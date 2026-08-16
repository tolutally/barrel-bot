"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function OpsNavigation({ active }: { active: "inbox" | "providers" }) {
  const router = useRouter();
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/inbox");
  }
  return <nav className="ops-navigation" aria-label="Primary navigation">
    <button type="button" className="ops-navigation__back" onClick={goBack} aria-label="Go back">←</button>
    <Link className={active === "inbox" ? "ops-navigation__link--active" : undefined} href="/inbox">Inbox</Link>
    <Link className={active === "providers" ? "ops-navigation__link--active" : undefined} href="/providers">Providers</Link>
  </nav>;
}
