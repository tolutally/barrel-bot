"use client";

import { signOutOperator } from "../lib/browser-auth";

export function LogoutButton() {
  return <button onClick={async () => { await signOutOperator(); window.location.assign("/login"); }}>Log out</button>;
}
