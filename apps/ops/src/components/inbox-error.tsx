import Link from "next/link";

export function InboxError() {
  return <section className="inbox-empty"><h2>We couldn’t load conversations.</h2><Link className="button-link" href="/inbox">Try again</Link></section>;
}
