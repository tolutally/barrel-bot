"use client";

import { useRef, useState, useTransition } from "react";
import type { ConversationDetailResponse } from "../lib/api-client";
import { messageLabel, messageStatus, rateLabel, timestamp } from "../lib/conversation-model";
import { finishHumanConversation, sendHumanReply } from "../app/inbox/[conversationId]/actions";

const QUICK_REPLIES = [
  { label: "Take over", text: "Hi — I’m taking this up from here. I can help get this payment settled." },
  { label: "Request details", text: "Please send the invoice or payment reference, plus the amount and currency due. I’ll confirm the destination details." },
  { label: "Reviewing", text: "Thanks — I have the details. I’m checking the destination and current settlement rate now." },
] as const;

export function ConversationScreen({ initial }: { initial: ConversationDetailResponse }) {
  const [conversation, setConversation] = useState(initial);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState("");
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [isPending, startTransition] = useTransition();
  const keyRef = useRef<string | null>(null);
  const human = conversation.conversation.automationMode === "HUMAN";
  const quote = conversation.conversation.quote;

  function send() {
    const body = text.trim();
    if (!body || isPending) return;
    if (!keyRef.current) keyRef.current = crypto.randomUUID();
    setSendError("");
    startTransition(async () => {
      const result = await sendHumanReply(conversation.conversation.conversationId, body, keyRef.current!);
      if (!result.ok) {
        // A failed Meta attempt is deliberately retried with a fresh key; successful retries retain their key for duplicate-click protection.
        if (result.error === "Message wasn't sent.") keyRef.current = null;
        setSendError(result.error);
        return;
      }
      setConversation((current) => ({
        ...current,
        messages: [...current.messages, { senderType: "OPERATOR", contentType: "TEXT", textBody: body, createdAt: result.sentAt ?? new Date().toISOString(), sentAt: result.sentAt ?? new Date().toISOString(), deliveredAt: null, readAt: null, failedAt: null }],
      }));
      setText("");
      keyRef.current = null;
    });
  }

  function finish() {
    if (isPending) return;
    startTransition(async () => {
      const result = await finishHumanConversation(conversation.conversation.conversationId);
      if (!result.ok) { setSendError(result.error); return; }
      setConversation((current) => ({ ...current, conversation: { ...current.conversation, automationMode: "BOT" } }));
      setConfirmFinish(false);
    });
  }

  function chooseQuickReply(value: string) {
    setText(value);
    keyRef.current = null;
    setSendError("");
  }

  return <section className="conversation-screen">
    <header className="conversation-header">
      <div><strong>{conversation.conversation.customer.displayName ?? conversation.conversation.customer.whatsappNumber ?? "Customer"}</strong><span>{conversation.conversation.handoff?.publicReference ?? quote?.publicReference ?? ""}</span></div>
      <span className={`conversation-row__status conversation-row__status--${conversation.conversation.automationMode.toLowerCase()}`}>{human ? "Human handling" : "Automation on"}</span>
    </header>
    {quote ? <section className="rate-context" aria-label="Indicative rate context"><p>{quote.sourceCurrency} → {quote.targetCurrency}</p><dl><div><dt>Customer sends</dt><dd>{quote.sourceAmount}</dd></div><div><dt>Indicative receive</dt><dd>{quote.indicativeTargetAmount}</dd></div><div><dt>Rate shown</dt><dd>{rateLabel(quote)}</dd></div></dl><small>Indicative rate</small></section> : null}
    <section className="transcript" aria-label="Transcript">
      {conversation.messages.map((message, index) => <article className={`message message--${message.senderType.toLowerCase()}`} key={`${message.createdAt}-${index}`}>
        <span className="message__label">{messageLabel(message.senderType)}</span><p>{message.textBody ?? "Unsupported message"}</p><span className="message__meta">{timestamp(message.createdAt)}{messageStatus(message) ? ` · ${messageStatus(message)}` : ""}</span>
      </article>)}
    </section>
    {human ? <section className="reply-area" aria-label="Human reply"><div className="quick-replies"><span>Quick replies</span><div>{QUICK_REPLIES.map((reply) => <button type="button" className="quick-replies__option" key={reply.label} onClick={() => chooseQuickReply(reply.text)} disabled={isPending}>{reply.label}</button>)}</div></div><textarea aria-label="Type a reply" value={text} onChange={(event) => { setText(event.target.value); if (keyRef.current) keyRef.current = null; }} placeholder="Type a reply..." maxLength={4096} disabled={isPending} /><button type="button" onClick={send} disabled={!text.trim() || isPending}>{isPending ? "Sending" : "Send"}</button>{sendError ? <p role="alert">{sendError} {sendError === "Message wasn't sent." ? <button type="button" onClick={send} disabled={isPending}>Try again</button> : null}</p> : null}</section> : null}
    {human ? <section className="finish-area">{confirmFinish ? <div className="finish-confirm"><strong>Finish this conversation?</strong><p>Barrel will respond automatically the next time this customer asks for a rate.</p><button type="button" className="button-secondary" onClick={() => setConfirmFinish(false)} disabled={isPending}>Cancel</button><button type="button" onClick={finish} disabled={isPending}>Finish conversation</button></div> : <button type="button" className="button-secondary" onClick={() => setConfirmFinish(true)}>Finish conversation</button>}</section> : null}
  </section>;
}
