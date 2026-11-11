import type { SocialPlatform } from "@/app/generated/prisma/client";

export type { SocialPlatform };

export function supportsFollowGate(platform: SocialPlatform | undefined) {
  return platform !== "FACEBOOK";
}

export function isFollowGated(automation: { requireFollow: boolean; socialAccount: { platform: SocialPlatform } }) {
  return automation.requireFollow && supportsFollowGate(automation.socialAccount.platform);
}
