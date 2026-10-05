"use client";

import { useRef, useState, useTransition } from "react";
import type { ConversationDetailResponse } from "../lib/api-client";
import { messageLabel, messageStatus, rateLabel, timestamp } from "../lib/conversation-model";
import { finishHumanConversation } from "../app/inbox/[conversationId]/actions";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function fileSize(value: number | null): string {
  if (value == null) return "";
  return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

const QUICK_REPLIES = [
  { label: "Take over", text: "Hi — I’m taking this up from here. I can help get this payment settled." },
  { label: "Request details", text: "Please send the invoice or payment reference, plus the amount and currency due. I’ll confirm the destination details." },
  { label: "Reviewing", text: "Thanks — I have the details. I’m checking the destination and current settlement rate now." },
] as const;

export function ConversationScreen({ initial }: { initial: ConversationDetailResponse }) {
  const [conversation, setConversation] = useState(initial);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [isPending, startTransition] = useTransition();
  const keyRef = useRef<string | null>(null);
  const human = conversation.conversation.automationMode === "HUMAN";
  const pendingHandoff = conversation.conversation.automationMode === "HANDOFF_PENDING";
  const replyable = human || pendingHandoff;
  const quote = conversation.conversation.quote;

  function send() {
    const body = text.trim();
    if ((!body && !attachment) || isPending) return;
    if (!keyRef.current) keyRef.current = crypto.randomUUID();
    setSendError("");
    startTransition(async () => {
      const requestBody: BodyInit = attachment ? (() => { const form = new FormData(); form.set("text", body); form.set("attachment", attachment); return form; })() : JSON.stringify({ text: body });
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversation.conversation.conversationId)}/messages`, {
        method: "POST",
        headers: { "Idempotency-Key": keyRef.current!, ...(attachment ? {} : { "Content-Type": "application/json" }) },
        body: requestBody,
      });
      if (!response.ok) {
        // A failed Meta attempt is deliberately retried with a fresh key; successful retries retain their key for duplicate-click protection.
        keyRef.current = null;
        setSendError(response.status === 400 ? "That file can't be sent. Use a JPEG, PNG, WebP, or PDF up to 5 MB." : "Message wasn't sent.");
        return;
      }
      const result = await response.json() as { sentAt?: string };
      const optimisticUrl = attachment ? URL.createObjectURL(attachment) : null;
      const optimisticAttachment = attachment ? { kind: attachment.type === "application/pdf" ? "DOCUMENT" as const : "IMAGE" as const, fileName: attachment.name, mimeType: attachment.type, byteSize: attachment.size, available: true, url: optimisticUrl, expiresAt: new Date(Date.now() + 90 * 86400000).toISOString() } : null;
      setConversation((current) => ({
        ...current,
        conversation: { ...current.conversation, automationMode: "HUMAN" },
        messages: [...current.messages, { senderType: "OPERATOR", contentType: optimisticAttachment?.kind ?? "TEXT", textBody: body || null, attachment: optimisticAttachment, createdAt: result.sentAt ?? new Date().toISOString(), sentAt: result.sentAt ?? new Date().toISOString(), deliveredAt: null, readAt: null, failedAt: null }],
      }));
      setText("");
      setAttachment(null);
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

  function chooseAttachment(file: File | null) {
    setSendError("");
    keyRef.current = null;
    if (!file) { setAttachment(null); return; }
    if (!ATTACHMENT_TYPES.has(file.type) || file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
      setAttachment(null);
      setSendError("Choose a JPEG, PNG, WebP, or PDF up to 5 MB.");
      return;
    }
    setAttachment(file);
  }

  return <section className="conversation-screen">
    <header className="conversation-header">
      <div><strong>{conversation.conversation.customer.displayName ?? conversation.conversation.customer.whatsappNumber ?? "Customer"}</strong><span>{conversation.conversation.handoff?.publicReference ?? quote?.publicReference ?? ""}</span></div>
      <span className={`conversation-row__status conversation-row__status--${conversation.conversation.automationMode.toLowerCase()}`}>{human ? "Human handling" : pendingHandoff ? "Waiting for team" : "Automation on"}</span>
    </header>
    {quote ? <section className="rate-context" aria-label="Indicative rate context"><p>{quote.sourceCurrency} → {quote.targetCurrency}</p><dl><div><dt>Customer sends</dt><dd>{quote.sourceAmount}</dd></div><div><dt>Indicative receive</dt><dd>{quote.indicativeTargetAmount}</dd></div><div><dt>Rate shown</dt><dd>{rateLabel(quote)}</dd></div></dl><small>Indicative rate</small></section> : null}
    <section className="transcript" aria-label="Transcript">
      {conversation.messages.map((message, index) => <article className={`message message--${message.senderType.toLowerCase()}`} key={`${message.createdAt}-${index}`}>
        <span className="message__label">{messageLabel(message.senderType)}</span>
        {message.attachment ? message.attachment.available && message.attachment.url ? message.attachment.kind === "IMAGE" ? <a className="message__image-link" href={message.attachment.url} target="_blank" rel="noreferrer"><img className="message__image" src={message.attachment.url} alt={message.textBody || message.attachment.fileName} /></a> : <div className="message__document"><strong>{message.attachment.fileName}</strong><span>{fileSize(message.attachment.byteSize)}</span><span><a href={message.attachment.url} target="_blank" rel="noreferrer">View</a> · <a href={`${message.attachment.url}&download=${encodeURIComponent(message.attachment.fileName)}`}>Download</a></span></div> : <div className="message__attachment-unavailable"><strong>{message.attachment.fileName}</strong><span>Attachment unavailable</span></div> : null}
        {message.textBody ? <p>{message.textBody}</p> : !message.attachment ? <p>Unsupported message</p> : null}<span className="message__meta">{timestamp(message.createdAt)}{messageStatus(message) ? ` · ${messageStatus(message)}` : ""}</span>
      </article>)}
    </section>
    {replyable ? <section className="reply-area" aria-label="Human reply">{pendingHandoff ? <p><strong>Reply to take over this conversation.</strong></p> : null}<div className="quick-replies"><span>Quick replies</span><div>{QUICK_REPLIES.map((reply) => <button type="button" className="quick-replies__option" key={reply.label} onClick={() => chooseQuickReply(reply.text)} disabled={isPending}>{reply.label}</button>)}</div></div><label className="attachment-picker"><span>{attachment ? attachment.name : "Attach image or PDF"}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => chooseAttachment(event.target.files?.[0] ?? null)} disabled={isPending} /></label>{attachment ? <button type="button" className="attachment-remove" onClick={() => chooseAttachment(null)} disabled={isPending}>Remove</button> : null}<textarea aria-label="Type a reply" value={text} onChange={(event) => { setText(event.target.value); if (keyRef.current) keyRef.current = null; }} placeholder={attachment ? "Add an optional caption..." : "Type a reply..."} maxLength={4096} disabled={isPending} /><button type="button" onClick={send} disabled={(!text.trim() && !attachment) || isPending}>{isPending ? "Sending" : pendingHandoff ? "Take over & send" : "Send"}</button>{sendError ? <p role="alert">{sendError} {sendError === "Message wasn't sent." ? <button type="button" onClick={send} disabled={isPending}>Try again</button> : null}</p> : null}</section> : null}
    {human ? <section className="finish-area">{confirmFinish ? <div className="finish-confirm"><strong>Finish this conversation?</strong><p>Barrel will respond automatically the next time this customer asks for a rate.</p><button type="button" className="button-secondary" onClick={() => setConfirmFinish(false)} disabled={isPending}>Cancel</button><button type="button" onClick={finish} disabled={isPending}>Finish conversation</button></div> : <button type="button" className="button-secondary" onClick={() => setConfirmFinish(true)}>Finish conversation</button>}</section> : null}
  </section>;
}
