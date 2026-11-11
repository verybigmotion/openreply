import { getBaseUrl } from "@/lib/env";
import {
  PermissionError,
  getLongLivedToken,
  getUserInfo,
  subscribeInstagramAccountToWebhooks,
} from "@/lib/meta/client";
import { exchangeCodeForToken } from "@/lib/meta/oauth";
import { signInWithSocialAccounts, type SocialAccountInput } from "@/lib/social-login";

export type InstagramLoginResult =
  | { ok: true }
  | { ok: false; reason: "instagram_taken" | "instagram_failed" | "instagram_not_tester"; detail?: string };

export async function readInstagramAccount(code: string): Promise<SocialAccountInput> {
  const redirectUri = `${getBaseUrl()}/api/instagram/callback`;
  const { accessToken: shortLivedToken } = await exchangeCodeForToken(code, redirectUri);
  const { accessToken, expiresIn } = await getLongLivedToken(shortLivedToken);
  const userInfo = await getUserInfo(accessToken);
  const externalId = userInfo.user_id ?? userInfo.id;

  let webhookSubscribed = false;
  try {
    webhookSubscribed = Boolean((await subscribeInstagramAccountToWebhooks(externalId, accessToken)).success);
  } catch (subscriptionError) {
    console.warn("[Instagram Login] Webhook subscription failed:", subscriptionError);
  }

  return {
    platform: "INSTAGRAM",
    externalId,
    username: userInfo.username,
    name: userInfo.name ?? null,
    accessToken,
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    webhookSubscribed,
  };
}

export async function signInWithInstagram(code: string): Promise<InstagramLoginResult> {
  try {
    const account = await readInstagramAccount(code);
    const { signedIn } = await signInWithSocialAccounts(
      { provider: "instagram", providerAccountId: account.externalId },
      { userName: account.name ?? account.username, workspaceName: `@${account.username}` },
      [account]
    );
    return signedIn ? { ok: true } : { ok: false, reason: "instagram_taken" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[Instagram Login] Error:", error);
    if (error instanceof PermissionError && detail.includes("Unsupported request")) {
      return { ok: false, reason: "instagram_not_tester", detail };
    }
    return { ok: false, reason: "instagram_failed", detail };
  }
}
