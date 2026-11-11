import { decryptToken } from "@/lib/meta/oauth";
import { prisma } from "@/lib/db/client";
import type { SocialPlatform } from "@/app/generated/prisma/client";

export type SocialAccountContext =
  | { provider: "META"; accessToken: string; platform: SocialPlatform; externalId: string }
  | {
      provider: "ZERNIO";
      apiKey: string;
      accountId: string;
      externalId: string;
      operationId?: string;
    };

export type ProviderAccount = {
  provider: "META" | "ZERNIO";
  platform: SocialPlatform;
  workspaceId: string;
  zernioAccountId: string | null;
  externalId: string;
  accessToken: string;
};

export function hasProviderCredentials(
  account: Pick<ProviderAccount, "provider" | "accessToken" | "zernioAccountId">
) {
  return account.provider === "ZERNIO"
    ? Boolean(account.zernioAccountId)
    : Boolean(account.accessToken);
}

export async function createSocialAccountContext(
  account: ProviderAccount,
  operationId?: string
): Promise<SocialAccountContext> {
  if (account.provider !== "ZERNIO")
    return {
      provider: "META",
      accessToken: decryptToken(account.accessToken),
      platform: account.platform,
      externalId: account.externalId,
    };
  if (!account.zernioAccountId)
    throw new Error("Zernio account is not connected");
  const connection = await prisma.zernioConnection.findUnique({
    where: { workspaceId: account.workspaceId },
    select: { apiKey: true },
  });
  if (!connection) throw new Error("Zernio workspace connection is missing");
  return {
    provider: "ZERNIO",
    apiKey: decryptToken(connection.apiKey),
    accountId: account.zernioAccountId,
    externalId: account.externalId,
    ...(operationId ? { operationId } : {}),
  };
}

export type ZernioContext = Extract<SocialAccountContext, { provider: "ZERNIO" }>;
export type MetaContext = Extract<SocialAccountContext, { provider: "META" }>;

export function isFacebook(
  context: SocialAccountContext
): context is MetaContext & { platform: "FACEBOOK" } {
  return context.provider === "META" && context.platform === "FACEBOOK";
}
