# Barrel Public Website API

Base paths are unversioned under `/api/public`. All responses are JSON. Rates are indicative; the 15-minute timestamp is the window for submitting a trade request, not a provider lock or guarantee. The trading desk confirms the live rate before accepting a request.

## CORS

Browser origins must be listed in the server-side `PUBLIC_WEB_ORIGINS` comma-separated setting. Mutation endpoints never return wildcard CORS. POST requests require `Content-Type: application/json`; preflight supports `Content-Type`, `Idempotency-Key`, and `X-Request-ID`.

## `GET /api/public/corridors`

Returns enabled directional Barrel corridors only:

```json
{"corridors":[{"sourceCurrency":"NGN","targetCurrency":"CAD","sourceLabel":"Nigerian Naira","targetLabel":"Canadian Dollar","minSourceAmount":"1000.00","maxSourceAmount":"10000000.00"}]}
```

## `POST /api/public/quotes`

```json
{"sourceCurrency":"NGN","targetCurrency":"CAD","sourceAmount":"2000000"}
```

```json
{"quote":{"id":"quote-id","reference":"BARREL-Q-...","sourceCurrency":"NGN","targetCurrency":"CAD","sourceAmount":"₦2,000,000.00","targetAmount":"C$1,904.76","customerRate":"1050","requestExpiresAt":"2026-08-12T20:25:00.000Z","indicative":true,"disclaimer":"Final rate is confirmed by our trading desk before your trade is accepted."}}
```

## `POST /api/public/trade-requests`

Requires a high-entropy `Idempotency-Key` header (16–200 characters). Retrying the same payload with the same key returns the same request; reusing the key for different input returns `409`.

```json
{"quoteId":"quote-id","purposeOfPayment":"SUPPLIER_VENDOR","whatsappNumber":"+14035551234"}
```

For `OTHER`, include `purposeOfPaymentDetail` (maximum 200 characters). `sourceOfFunds` is not required.

```json
{"tradeRequest":{"reference":"BARREL-TI-...","status":"RECEIVED","message":"Your trade request has been sent to our trading desk. A Barrel specialist will contact you on WhatsApp to confirm the live rate and next steps."}}
```

The backend creates an anonymous WEB `TradeIntent`, calls the common `TradeHandoffService`, and uses the existing `AdminNotification` path. It does not create a Customer or Trade.

## Errors

```json
{"error":{"code":"QUOTE_EXPIRED","message":"This quote has expired. Please get a fresh rate.","requestId":"safe-correlation-id"}}
```

Possible codes include `INVALID_REQUEST`, `UNSUPPORTED_CORRIDOR`, `CORRIDOR_UNAVAILABLE`, `AMOUNT_BELOW_MINIMUM`, `AMOUNT_ABOVE_MAXIMUM`, `RATE_UNAVAILABLE`, `QUOTE_NOT_FOUND`, `QUOTE_EXPIRED`, `INVALID_CONTACT`, `TRADE_REQUEST_ALREADY_SUBMITTED`, `RATE_LIMITED`, and `INTERNAL_ERROR`.

## Website flow

1. Fetch corridors.
2. Post the selected direction and source amount for an indicative quote.
3. Display the quote and 15-minute request window.
4. Collect purpose, OTHER detail when applicable, and an international WhatsApp number.
5. Submit the trade request with a new high-entropy idempotency key.
6. Display the returned trade-request reference. Barrel’s existing handoff engine notifies the trading desk.
