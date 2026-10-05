import { LoginForm } from "../../components/login-form";
import { getAuthorizedOperator } from "../../lib/require-operator";
import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [params, auth] = await Promise.all([searchParams, getAuthorizedOperator()]);
  if ("operator" in auth) redirect("/inbox");

  return <main><h1>Barrel Ops</h1><p>Sign in to continue.</p><LoginForm denied={params.error === "not_authorized"} /></main>;
}
