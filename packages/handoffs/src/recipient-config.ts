const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizeAdminWhatsAppRecipient(value: string): string {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  if (!E164_PATTERN.test(normalized)) {
    throw new Error("admin WhatsApp recipient must be a valid E.164 identifier");
  }
  return normalized;
}

export function parseAdminWhatsAppRecipients(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return [...new Set(value.split(",").map(normalizeAdminWhatsAppRecipient))];
}
