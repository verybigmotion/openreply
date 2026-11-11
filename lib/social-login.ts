import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { encryptToken } from "@/lib/meta/oauth";
import { isOperatorEmail } from "@/lib/operator";
import { resolveTokenEvents } from "@/lib/token-events";
import type { SocialPlatform } from "@/app/generated/prisma/client";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type SocialAccountInput = {
  platform: SocialPlatform;
  externalId: string;
  username: string;
  name: string | null;
  accessToken: string;
  tokenExpiresAt: Date | null;
  webhookSubscribed: boolean;
};

type Home = { userId: string; workspaceId: string };

export type SaveOutcome = { saved: number; taken: number };

export async function saveSocialAccount(workspaceId: string, account: SocialAccountInput): Promise<boolean> {
  const { externalId, accessToken, ...fields } = account;
  const data = { ...fields, accessToken: encryptToken(accessToken), tokenRevokedAt: null };
  const existing = await prisma.socialAccount.findUnique({
    where: { externalId },
    select: { id: true, workspaceId: true, provider: true },
  });
  if (!existing) {
    await prisma.socialAccount.create({ data: { ...data, externalId, workspaceId, provider: "META" } });
    return true;
  }
  if (existing.workspaceId !== workspaceId || existing.provider !== "META") return false;
  await prisma.socialAccount.update({ where: { id: existing.id }, data });
  await resolveTokenEvents(existing.id);
  return true;
}

export async function saveSocialAccounts(workspaceId: string, accounts: SocialAccountInput[]): Promise<SaveOutcome> {
  const results = await Promise.all(accounts.map((account) => saveSocialAccount(workspaceId, account)));
  const saved = results.filter(Boolean).length;
  return { saved, taken: results.length - saved };
}

export type InfluencerNames = { userName: string; workspaceName: string };

export type SignInOutcome = SaveOutcome & { signedIn: boolean };

async function findInfluencerHome(accounts: SocialAccountInput[]) {
  const connected = await prisma.socialAccount.findMany({
    where: { externalId: { in: accounts.map((account) => account.externalId) } },
    orderBy: { connectedAt: "asc" },
    select: { workspaceId: true, workspace: { select: { ownerId: true, owner: { select: { email: true } } } } },
  });
  const influencerOwned = connected.find((account) => !isOperatorEmail(account.workspace.owner.email));
  return {
    home: influencerOwned ? { userId: influencerOwned.workspace.ownerId, workspaceId: influencerOwned.workspaceId } : null,
    allConnected: connected.length === accounts.length,
  };
}

export type LoginIdentity = { provider: "instagram" | "facebook"; providerAccountId: string };

async function findLinkedHome(identity: LoginIdentity): Promise<Home | null> {
  const link = await prisma.account.findUnique({
    where: { provider_providerAccountId: identity },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (!link || isOperatorEmail(link.user.email)) return null;
  const workspace = await prisma.workspace.findFirst({
    where: { ownerId: link.userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return workspace ? { userId: link.userId, workspaceId: workspace.id } : null;
}

async function linkIdentity(identity: LoginIdentity, userId: string) {
  await prisma.account.upsert({
    where: { provider_providerAccountId: identity },
    update: { userId },
    create: { ...identity, userId, type: "oauth" },
  });
}

export async function signInWithSocialAccounts(
  identity: LoginIdentity,
  names: InfluencerNames,
  accounts: SocialAccountInput[]
): Promise<SignInOutcome> {
  const { home: connectedHome, allConnected } = await findInfluencerHome(accounts);
  const existingHome = connectedHome ?? (await findLinkedHome(identity));
  if (!existingHome && allConnected) return { saved: 0, taken: accounts.length, signedIn: false };
  const home = existingHome ?? (await createInfluencer(names));
  const outcome = await saveSocialAccounts(home.workspaceId, accounts);
  const signedIn = Boolean(existingHome) || outcome.saved > 0;
  if (signedIn) {
    await linkIdentity(identity, home.userId);
    await createSession(home.userId);
  }
  return { ...outcome, signedIn };
}

async function createInfluencer({ userName, workspaceName }: InfluencerNames): Promise<Home> {
  const user = await prisma.user.create({ data: { name: userName }, select: { id: true } });
  const workspace = await prisma.workspace.create({
    data: {
      name: workspaceName,
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
    select: { id: true },
  });
  return { userId: user.id, workspaceId: workspace.id };
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
