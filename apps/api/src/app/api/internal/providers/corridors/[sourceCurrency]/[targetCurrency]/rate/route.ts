import { NextResponse } from "next/server";
import { OperatorAuthError, requireOperator } from "../../../../../../../../lib/operator-auth";
import { getProviderRate } from "../../../../../../../../lib/provider-rate";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

export async function GET(request: Request, { params }: { params: Promise<{ sourceCurrency: string; targetCurrency: string }> }): Promise<Response> {
  try {
    await requireOperator(request);
    const { sourceCurrency, targetCurrency } = await params;
    const rate = await getProviderRate(sourceCurrency, targetCurrency);
    return rate
      ? NextResponse.json(rate, { headers: NO_STORE_HEADERS })
      : NextResponse.json({ error: "This corridor is not available from the selected provider." }, { status: 404, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof OperatorAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "We couldn't retrieve a live provider rate." }, { status: 502 });
  }
}
