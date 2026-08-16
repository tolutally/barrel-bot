export type CreateUploadTargetInput = {
  storageKey: string;
  contentType: string;
  sizeBytes: bigint;
  sha256Hash: string;
  expiresInSeconds?: number;
};

export type UploadTarget = {
  method: "PUT" | "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  expiresAt: Date;
};

export type ReadTarget = {
  url: string;
  expiresAt: Date;
};

/**
 * Contract for private object storage. Returned targets must be short-lived;
 * implementations must never make compliance objects publicly readable.
 */
export interface SecureDocumentStorage {
  createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget>;
  createReadTarget(storageKey: string, options?: { expiresInSeconds?: number }): Promise<ReadTarget>;
  deleteObject(storageKey: string): Promise<void>;
}
