import { getBaseUrl } from "@/lib/env";
import {
  exchangeFacebookCode,
  getFacebookProfileId,
  getManagedPages,
  subscribePageToWebhooks,
} from "@/lib/meta/facebook";
import type { SocialAccountInput } from "@/lib/social-login";

export function facebookRedirectUri() {
  return `${getBaseUrl()}/api/facebook/callback`;
}

export type FacebookAuthorization = { profileId: string; pages: SocialAccountInput[] };

export async function readFacebookPages(code: string): Promise<FacebookAuthorization> {
  const userToken = await exchangeFacebookCode(code, facebookRedirectUri());
  const [profileId, managedPages] = await Promise.all([getFacebookProfileId(userToken), getManagedPages(userToken)]);

  const pages = await Promise.all(
    managedPages.map(async (page) => {
      let webhookSubscribed = false;
      try {
        webhookSubscribed = Boolean((await subscribePageToWebhooks(page.id, page.access_token)).success);
      } catch (subscriptionError) {
        console.warn("[Facebook Login] Page webhook subscription failed:", page.id, subscriptionError);
      }
      return {
        platform: "FACEBOOK" as const,
        externalId: page.id,
        username: page.username ?? page.name,
        name: page.name,
        accessToken: page.access_token,
        tokenExpiresAt: null,
        webhookSubscribed,
      };
    })
  );

  return { profileId, pages };
}
