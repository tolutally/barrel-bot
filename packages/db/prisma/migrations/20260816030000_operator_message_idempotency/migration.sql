ALTER TABLE "ConversationMessage" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "ConversationMessage_conversationId_idempotencyKey_key"
  ON "ConversationMessage"("conversationId", "idempotencyKey");
