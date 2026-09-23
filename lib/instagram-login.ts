import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { getLongLivedToken, getUserInfo, subscribeInstagramAccountToWebhooks } from "@/lib/meta/client";
import { encryptToken, exchangeCodeForToken } from "@/lib/meta/oauth";

const INSTAGRAM_PROVIDER = "instagram";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type InstagramLoginResult =
  | { ok: true }
  | { ok: false; reason: "instagram_taken" | "instagram_failed"; detail?: string };

export async function signInWithInstagram(code: string): Promise<InstagramLoginResult> {
  try {
    const redirectUri = `${getBaseUrl()}/api/instagram/callback`;
    const { accessToken: shortLivedToken } = await exchangeCodeForToken(code, redirectUri);
    const { accessToken: longLivedToken, expiresIn } = await getLongLivedToken(shortLivedToken);
    const userInfo = await getUserInfo(longLivedToken);
    const instagramId = userInfo.user_id ?? userInfo.id;

    const existingAccount = await prisma.instagramAccount.findUnique({ where: { instagramId } });
    const linked = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: INSTAGRAM_PROVIDER, providerAccountId: instagramId } },
      select: { userId: true },
    });
    if (existingAccount && !linked) return { ok: false, reason: "instagram_taken" };

    const userId = linked?.userId ?? (await createInfluencer(instagramId, userInfo.username, userInfo.name ?? null));
    const workspace = await prisma.workspace.findFirstOrThrow({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (existingAccount && existingAccount.workspaceId !== workspace.id) return { ok: false, reason: "instagram_taken" };

    let webhookSubscribed = false;
    try {
      webhookSubscribed = Boolean((await subscribeInstagramAccountToWebhooks(instagramId, longLivedToken)).success);
    } catch (subscriptionError) {
      console.warn("[Instagram Login] Webhook subscription failed:", subscriptionError);
    }

    const data = {
      username: userInfo.username,
      name: userInfo.name ?? null,
      accessToken: encryptToken(longLivedToken),
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      webhookSubscribed,
    };
    await prisma.instagramAccount.upsert({
      where: { instagramId },
      update: data,
      create: { ...data, instagramId, workspaceId: workspace.id, provider: "META" },
    });

    await createSession(userId);
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[Instagram Login] Error:", error);
    return { ok: false, reason: "instagram_failed", detail };
  }
}

async function createInfluencer(instagramId: string, username: string, name: string | null) {
  const user = await prisma.user.create({
    data: {
      name: name ?? username,
      accounts: { create: { type: "oauth", provider: INSTAGRAM_PROVIDER, providerAccountId: instagramId } },
    },
    select: { id: true },
  });
  await prisma.workspace.create({
    data: {
      name: `@${username}`,
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  return user.id;
}

async function createSession(userId: string) {
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);
  const sessionToken = randomUUID();
  await prisma.session.create({ data: { sessionToken, userId, expires } });
  const secure = getBaseUrl().startsWith("https://");
  const cookieStore = await cookies();
  cookieStore.set(secure ? "__Secure-authjs.session-token" : "authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires,
  });
}
