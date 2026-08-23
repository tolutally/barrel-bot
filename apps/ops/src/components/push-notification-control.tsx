"use client";

import { useEffect, useState } from "react";

type ControlState = "checking" | "unsupported" | "install_required" | "unavailable" | "disabled" | "enabled" | "testing" | "tested" | "blocked" | "error";

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function vapidKeyBytes(value: string): ArrayBuffer {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error("Unable to save notification preference");
}

export function PushNotificationControl() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<ControlState>("checking");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (!publicKey) {
      setState("unavailable");
      return;
    }
    if (isIos() && !isStandalone()) {
      setState("install_required");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    navigator.serviceWorker.register("/service-worker.js", { scope: "/", updateViaCache: "none" })
      .then(async (registration) => {
        await registration.update();
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await saveSubscription(existing);
          setState("enabled");
        } else setState("disabled");
      })
      .catch(() => setState("error"));
  }, [publicKey]);

  const enable = async () => {
    if (!publicKey) return;
    try {
      setState("checking");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "disabled");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(publicKey) });
      await saveSubscription(subscription);
      setState("enabled");
    } catch {
      setState("error");
    }
  };

  const testAlert = async () => {
    try {
      setState("testing");
      const response = await fetch("/api/push-subscriptions/test", { method: "POST" });
      if (!response.ok) throw new Error("Unable to send test alert");
      setState("tested");
      window.setTimeout(() => setState("enabled"), 3500);
    } catch {
      setState("error");
    }
  };

  if (state === "checking") return <span className="push-status">Checking alerts…</span>;
  if (state === "enabled") return <button className="push-control push-control--enabled" onClick={testAlert} title="Send a test notification to this device">Alerts on · Test</button>;
  if (state === "testing") return <span className="push-status">Sending test…</span>;
  if (state === "tested") return <span className="push-status push-status--enabled">Test sent ✓</span>;
  if (state === "unsupported") return <span className="push-status">Alerts unavailable</span>;
  if (state === "install_required") return <span className="push-status" title="On iPhone, add Barrel Ops to your Home Screen before enabling notifications">Install app for alerts</span>;
  if (state === "unavailable") return null;
  if (state === "blocked") return <span className="push-status" aria-label="Allow notifications in iPhone Settings to enable alerts">Alerts blocked</span>;
  return <button className="push-control" onClick={enable}>{state === "error" ? "Try alerts again" : "Enable alerts"}</button>;
}
