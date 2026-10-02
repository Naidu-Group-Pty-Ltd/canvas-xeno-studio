/** Avatar Studio error vocabulary — independent of Creative Studio's provider errors. */
export type AvatarErrorCode =
  | "HEYGEN_NOT_CONFIGURED"
  | "LIVEAVATAR_NOT_CONFIGURED"
  | "INSUFFICIENT_CREDIT"
  | "VOICE_SLOT_UNAVAILABLE"
  | "INVALID_PARAMETERS"
  | "CONSENT_REQUIRED"
  | "ATTESTATION_REQUIRED"
  | "FEATURE_DISABLED"
  | "PROVIDER_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "SUBMISSION_UNCERTAIN"
  | "MODERATION_BLOCKED"
  | "NOT_FOUND"
  | "INGEST_FAILED"
  | "NOT_AUTHORIZED"
  | "UNKNOWN";

export const AVATAR_ERROR_MESSAGES: Record<AvatarErrorCode, string> = {
  HEYGEN_NOT_CONFIGURED: "HeyGen is not connected yet. An admin needs to add the HEYGEN_API_KEY secret.",
  LIVEAVATAR_NOT_CONFIGURED: "Realtime avatars are not connected yet. An admin needs to add the LIVEAVATAR_API_KEY secret.",
  INSUFFICIENT_CREDIT: "The HeyGen account does not have enough credit for this. Top up the HeyGen API balance before retrying.",
  VOICE_SLOT_UNAVAILABLE:
    "No available Professional Voice slot. Purchase or free a HeyGen API voice slot before retrying.",
  INVALID_PARAMETERS: "Some settings were rejected. Review the highlighted fields.",
  CONSENT_REQUIRED: "This avatar is waiting for the person's consent. Complete the consent step first.",
  ATTESTATION_REQUIRED: "Confirm you have permission to use this person's image or voice before continuing.",
  FEATURE_DISABLED: "This Avatar Studio feature is switched off by an admin.",
  PROVIDER_REJECTED: "HeyGen rejected this request.",
  PROVIDER_UNAVAILABLE: "HeyGen is temporarily unavailable. Your draft is kept — try again shortly.",
  RATE_LIMITED: "HeyGen is rate limiting requests. Try again in a moment.",
  SUBMISSION_UNCERTAIN:
    "We couldn't confirm whether HeyGen received this request. It will not be retried automatically, to avoid a duplicate charge.",
  MODERATION_BLOCKED: "HeyGen's content moderation blocked this request.",
  NOT_FOUND: "That item no longer exists at HeyGen.",
  INGEST_FAILED: "Generated — but saving to the Avatar Library failed. You can retry the save without regenerating.",
  NOT_AUTHORIZED: "You do not have permission to do that.",
  UNKNOWN: "Something went wrong.",
};

export class AvatarError extends Error {
  code: AvatarErrorCode;
  details?: unknown;
  constructor(code: AvatarErrorCode, message?: string, details?: unknown) {
    super(message ?? AVATAR_ERROR_MESSAGES[code]);
    this.code = code;
    this.details = details;
  }
}

export function avatarMessage(code?: string | null, fallback?: string | null): string {
  if (code && code in AVATAR_ERROR_MESSAGES) return AVATAR_ERROR_MESSAGES[code as AvatarErrorCode];
  return fallback || AVATAR_ERROR_MESSAGES.UNKNOWN;
}
