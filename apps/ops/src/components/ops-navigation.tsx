"use client";

import Link from "next/link";

export function OpsNavigation({ active }: { active: "dashboard" | "inbox" | "providers" }) {
  return <nav className="ops-navigation" aria-label="Primary navigation">
    <Link className={active === "dashboard" ? "ops-navigation__link--active" : undefined} href="/dashboard">Dashboard</Link>
    <Link className={active === "inbox" ? "ops-navigation__link--active" : undefined} href="/inbox">Inbox</Link>
    <Link className={active === "providers" ? "ops-navigation__link--active" : undefined} href="/providers">Providers</Link>
  </nav>;
}
