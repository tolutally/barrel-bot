CREATE TABLE "OperatorPushSubscription" (
  "id" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),

  CONSTRAINT "OperatorPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperatorPushSubscription_endpoint_key" ON "OperatorPushSubscription"("endpoint");
CREATE INDEX "OperatorPushSubscription_operatorId_idx" ON "OperatorPushSubscription"("operatorId");

ALTER TABLE "OperatorPushSubscription"
  ADD CONSTRAINT "OperatorPushSubscription_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
