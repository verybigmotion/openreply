import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { readFacebookPages, type FacebookAuthorization } from "@/lib/facebook-login";
import type { FacebookStatus } from "@/lib/facebook-status";
import { verifyOAuthState } from "@/lib/meta/oauth";
import {
  saveSocialAccounts,
  signInWithSocialAccounts,
  type SaveOutcome,
} from "@/lib/social-login";
import { canManageWorkspace } from "@/lib/workspace-access";

type LinkResult = { status: FacebookStatus | "connected"; reason?: string };

async function linkPages(
  code: string,
  save: (authorization: FacebookAuthorization) => Promise<SaveOutcome>
): Promise<LinkResult> {
  try {
    const authorization = await readFacebookPages(code);
    if (authorization.pages.length === 0) return { status: "no_pages" };
    const { saved, taken } = await save(authorization);
    if (saved === 0) return { status: "already_connected" };
    return { status: taken > 0 ? "partially_connected" : "connected" };
  } catch (error) {
    console.error("[Facebook Callback] Error:", error);
    return { status: "failed", reason: error instanceof Error ? error.message : "Unknown error" };
  }
}

function successUrl(baseUrl: string, status: LinkResult["status"]) {
  return status === "connected" ? `${baseUrl}/dashboard?connected=true` : `${baseUrl}/settings?facebook=${status}`;
}

async function signIn(code: string, baseUrl: string) {
  let signedIn = false;
  const { status } = await linkPages(code, async ({ profileId, pages }) => {
    const pageName = pages[0].name ?? pages[0].username;
    const outcome = await signInWithSocialAccounts(
      { provider: "facebook", providerAccountId: profileId },
      { userName: pageName, workspaceName: pageName },
      pages
    );
    signedIn = outcome.signedIn;
    return outcome;
  });
  if (signedIn) return successUrl(baseUrl, status);
  return `${baseUrl}/login?error=facebook_${status}`;
}

async function connect(code: string, workspaceId: string, baseUrl: string) {
  const { status, reason } = await linkPages(code, ({ pages }) => saveSocialAccounts(workspaceId, pages));
  if (status !== "failed") return successUrl(baseUrl, status);
  await prisma.operationalEvent
    .create({
      data: {
        source: "SYSTEM",
        level: "ERROR",
        workspaceId,
        message: "Facebook connection failed",
        payload: { reason },
      },
    })
    .catch(() => {});
  return `${baseUrl}/settings?facebook=failed&reason=${encodeURIComponent((reason ?? "").slice(0, 200))}`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const denied = Boolean(request.nextUrl.searchParams.get("error"));
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();

  if (state?.login) {
    if (denied || !code) return NextResponse.redirect(`${baseUrl}/login?error=facebook_denied`);
    return NextResponse.redirect(await signIn(code, baseUrl));
  }

  if (denied) return NextResponse.redirect(`${baseUrl}/settings?facebook=denied`);
  if (!code || !state) return NextResponse.redirect(`${baseUrl}/settings?facebook=invalid`);

  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${baseUrl}/login`);

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: state.workspaceId, userId: session.user.id },
  });
  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=forbidden`);
  }

  return NextResponse.redirect(await connect(code, state.workspaceId, baseUrl));
}
