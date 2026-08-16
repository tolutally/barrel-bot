ALTER TYPE "ConversationState" ADD VALUE 'CHOOSING_SOURCE_CURRENCY';
ALTER TYPE "ConversationState" ADD VALUE 'CHOOSING_TARGET_CURRENCY';
ALTER TYPE "ConversationState" ADD VALUE 'TRADE_INTENT_CREATED';
ALTER TYPE "ConversationState" ADD VALUE 'AWAITING_CUSTOMER_TYPE';
ALTER TYPE "ConversationState" ADD VALUE 'CUSTOMER_TYPE_SELECTED';

ALTER TABLE "Conversation"
ADD COLUMN "selectedSourceCurrency" TEXT,
ADD COLUMN "selectedTargetCurrency" TEXT;

CREATE UNIQUE INDEX "Conversation_customerChannelId_key"
ON "Conversation"("customerChannelId");

CREATE UNIQUE INDEX "TradeIntent_conversationId_quoteId_key"
ON "TradeIntent"("conversationId", "quoteId");
