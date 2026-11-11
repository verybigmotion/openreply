import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken, encryptToken } from "@/lib/meta/oauth";
import { PermissionError, refreshLongLivedToken, TokenExpiredError } from "@/lib/meta/client";
import { verifyPageToken } from "@/lib/meta/facebook";
import { resolveTokenEvents } from "@/lib/token-events";

const DAYS_BEFORE_EXPIRY = 10;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + DAYS_BEFORE_EXPIRY);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const usageReset = await prisma.workspace.updateMany({
    where: { usagePeriodStart: { lt: monthStart } },
    data: {
      usagePeriodStart: monthStart,
      dmsSentThisPeriod: 0,
    },
  });

  const accountsToRefresh = await prisma.socialAccount.findMany({
    where: {
      accessToken: { not: "" },
      provider: "META",
      platform: "INSTAGRAM",
      tokenExpiresAt: {
        not: null,
        lte: cutoffDate,
      },
    },
    select: {
      id: true,
      workspaceId: true,
      username: true,
      accessToken: true,
    },
  });

  const results: Array<{
    socialAccountId: string;
    username: string;
    status: "refreshed" | "failed";
    error?: string;
  }> = [];

  for (const account of accountsToRefresh) {
    try {
      const currentToken = decryptToken(account.accessToken);
      const { accessToken: newToken, expiresIn } =
        await refreshLongLivedToken(currentToken);
      const encryptedToken = encryptToken(newToken);
      const newExpiry = new Date(Date.now() + expiresIn * 1000);

      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encryptedToken,
          tokenExpiresAt: newExpiry,
        },
      });

      results.push({
        socialAccountId: account.id,
        username: account.username,
        status: "refreshed",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      await prisma.operationalEvent.create({
        data: {
          workspaceId: account.workspaceId,
          source: "TOKEN_REFRESH",
          level: "ERROR",
          message: `Token refresh failed for @${account.username}: ${errorMessage}`,
          payload: {
            socialAccountId: account.id,
            username: account.username,
          },
        },
      });

      results.push({
        socialAccountId: account.id,
        username: account.username,
        status: "failed",
        error: errorMessage,
      });
    }
  }

  const revokedPages = await findRevokedPageTokens();

  return NextResponse.json({
    success: true,
    data: {
      totalProcessed: accountsToRefresh.length,
      workspacesReset: usageReset.count,
      results,
      revokedPages,
    },
  });
}

async function markPageRestored(socialAccountId: string) {
  await prisma.socialAccount.update({ where: { id: socialAccountId }, data: { tokenRevokedAt: null } });
  await resolveTokenEvents(socialAccountId);
}

async function findRevokedPageTokens() {
  const pages = await prisma.socialAccount.findMany({
    where: { accessToken: { not: "" }, provider: "META", platform: "FACEBOOK" },
    select: {
      id: true,
      workspaceId: true,
      externalId: true,
      username: true,
      name: true,
      accessToken: true,
      tokenRevokedAt: true,
    },
  });
  const revoked: string[] = [];
  for (const page of pages) {
    try {
      await verifyPageToken(decryptToken(page.accessToken), page.externalId);
      if (page.tokenRevokedAt) await markPageRestored(page.id);
    } catch (err) {
      if (!(err instanceof TokenExpiredError || err instanceof PermissionError)) continue;
      revoked.push(page.id);
      if (page.tokenRevokedAt) continue;
      await prisma.socialAccount.update({ where: { id: page.id }, data: { tokenRevokedAt: new Date() } });
      await prisma.operationalEvent.create({
        data: {
          workspaceId: page.workspaceId,
          source: "TOKEN_REFRESH",
          level: "ERROR",
          message: `Facebook Page access revoked for ${page.name ?? page.username}; reconnect the Page`,
          payload: { socialAccountId: page.id, username: page.username },
        },
      });
    }
  }
  return revoked;
}
