import type { SocialPlatform } from "@/lib/social-platform";

type LabelledAccount = {
  username: string;
  name?: string | null;
  platform?: SocialPlatform;
};

export function socialAccountLabel(account: LabelledAccount) {
  return account.platform === "FACEBOOK"
    ? `${account.name ?? account.username} · Facebook`
    : `@${account.username}`;
}

export function socialAccountDisplayName(account: LabelledAccount) {
  return account.platform === "FACEBOOK" ? (account.name ?? account.username) : account.username;
}

export function contactLabel(name: string | null | undefined, platform: SocialPlatform | undefined) {
  const shown = name ?? "unknown";
  return platform === "FACEBOOK" ? shown : `@${shown}`;
}
