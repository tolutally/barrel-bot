import { LoginForm } from "../../components/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main><h1>Barrel Ops</h1><p>Sign in to continue.</p><LoginForm denied={params.error === "not_authorized"} /></main>;
}
