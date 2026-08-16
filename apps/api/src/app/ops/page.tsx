import { redirect } from "next/navigation";
import { OperatorAuthError, requireOperator } from "../../lib/operator-auth";

export default async function OperatorHomePage() {
  try {
    const operator = await requireOperator();
    return <main><h1>Barrel Operations</h1><p>Signed in as {operator.email}.</p></main>;
  } catch (error) {
    if (error instanceof OperatorAuthError && error.status === 401) redirect("/login");
    throw error;
  }
}
