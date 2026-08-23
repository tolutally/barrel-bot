"use client";

import { useRouter } from "next/navigation";

export function MobileBackButton() {
  const router = useRouter();

  function goBack() {
    const previousPageIsBarrel = document.referrer ? new URL(document.referrer).origin === window.location.origin : false;
    if (previousPageIsBarrel && window.history.length > 1) router.back();
    else router.push("/dashboard");
  }

  return <button className="mobile-back-control" type="button" onClick={goBack} aria-label="Go back" title="Go back">←</button>;
}
