export type AppErrorCode =
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_DISABLED"
  | "INSUFFICIENT_PROVIDER_BALANCE"
  | "INVALID_PARAMETERS"
  | "UPLOAD_FAILED"
  | "ESTIMATE_FAILED"
  | "PROVIDER_REJECTED"
  | "SUBMISSION_UNCERTAIN"
  | "PROVIDER_TIMEOUT"
  | "MODERATION_BLOCKED"
  | "INGEST_FAILED"
  | "STORAGE_FAILED"
  | "RATE_LIMITED"
  | "NOT_AUTHORIZED"
  | "UNKNOWN";

export const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  PROVIDER_NOT_CONFIGURED: "Higgsfield credentials are not configured yet. An admin must add them before generating.",
  PROVIDER_DISABLED: "The Higgsfield provider is currently disabled in settings.",
  INSUFFICIENT_PROVIDER_BALANCE:
    "Higgsfield API balance is insufficient. Top up the provider account before retrying.",
  INVALID_PARAMETERS: "Some generation settings are invalid. Review the highlighted fields.",
  UPLOAD_FAILED: "A reference file could not be prepared for the provider.",
  ESTIMATE_FAILED: "A cost estimate could not be retrieved for these settings.",
  PROVIDER_REJECTED: "Higgsfield rejected this generation request.",
  SUBMISSION_UNCERTAIN:
    "Submission status is uncertain. Automatic retry is disabled to prevent accidental duplicate generation charges.",
  PROVIDER_TIMEOUT: "Higgsfield did not respond in time.",
  MODERATION_BLOCKED: "Generation blocked by provider moderation.",
  INGEST_FAILED: "The finished output could not be saved to the asset library.",
  STORAGE_FAILED: "A file could not be stored.",
  RATE_LIMITED: "Higgsfield is rate limiting requests. Try again shortly.",
  NOT_AUTHORIZED: "You do not have permission to do that.",
  UNKNOWN: "Something went wrong.",
};

export class AppError extends Error {
  code: AppErrorCode;
  details?: unknown;
  constructor(code: AppErrorCode, message?: string, details?: unknown) {
    super(message ?? ERROR_MESSAGES[code]);
    this.code = code;
    this.details = details;
  }
}

export function messageForCode(code?: string | null, fallback?: string | null): string {
  if (code && code in ERROR_MESSAGES) return ERROR_MESSAGES[code as AppErrorCode];
  return fallback || ERROR_MESSAGES.UNKNOWN;
}
