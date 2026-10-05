import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let validateConversationMedia: typeof import("../../apps/api/src/lib/conversation-media").validateConversationMedia;

beforeAll(async () => {
  ({ validateConversationMedia } = await import("../../apps/api/src/lib/conversation-media"));
});

describe("conversation media validation", () => {
  it("accepts genuine JPEG and PDF bytes", () => {
    expect(validateConversationMedia({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), claimedMimeType: "image/jpeg", fileName: "receipt.jpg" })).toMatchObject({ kind: "IMAGE", mimeType: "image/jpeg" });
    expect(validateConversationMedia({ bytes: new TextEncoder().encode("%PDF-1.7\n1 0 obj"), claimedMimeType: "application/pdf", fileName: "invoice.pdf" })).toMatchObject({ kind: "DOCUMENT" });
  });

  it.each([
    { bytes: new Uint8Array(), mime: "image/jpeg", code: "EMPTY" },
    { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), mime: "image/png", code: "MIME_MISMATCH" },
    { bytes: new TextEncoder().encode("<svg></svg>"), mime: "image/svg+xml", code: "UNSUPPORTED" },
    { bytes: new TextEncoder().encode("%PDF-1.7\n/Encrypt true"), mime: "application/pdf", code: "ENCRYPTED_PDF" },
  ])("rejects unsafe input with $code", ({ bytes, mime, code }) => {
    expect(() => validateConversationMedia({ bytes, claimedMimeType: mime })).toThrowError(expect.objectContaining({ code }));
  });
});
