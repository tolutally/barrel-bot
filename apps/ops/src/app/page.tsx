import { redirect } from "next/navigation";
import { getAuthorizedOperator } from "../lib/require-operator";

export default async function OpsHomePage() {
  const result = await getAuthorizedOperator();
  redirect("reason" in result ? "/login" : "/inbox");
}
