import type { StaticMessageKey } from "@/lib/i18n";

export const FACEBOOK_STATUS_MESSAGES = {
  denied: "Facebook authorization was cancelled.",
  invalid: "Facebook authorization failed. Please try again.",
  failed: "Facebook authorization failed. Please try again.",
  forbidden: "Not permitted",
  already_connected: "This Facebook Page is already connected to another workspace.",
  partially_connected: "Some Facebook Pages are already connected to another workspace and were skipped.",
  no_pages: "No Facebook Pages were shared. Try again and select at least one Page.",
  misconfigured: "Facebook is not configured on this server.",
} satisfies Record<string, StaticMessageKey>;

export type FacebookStatus = keyof typeof FACEBOOK_STATUS_MESSAGES;

export function facebookStatusMessage(status: string | null | undefined): StaticMessageKey | null {
  return status && Object.hasOwn(FACEBOOK_STATUS_MESSAGES, status) ? FACEBOOK_STATUS_MESSAGES[status as FacebookStatus] : null;
}
