import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { readInstagramAccount, signInWithInstagram } from "@/lib/instagram-login";
import { verifyOAuthState } from "@/lib/meta/oauth";
import { isOperatorUser } from "@/lib/operator";
import { saveSocialAccount } from "@/lib/social-login";
import { canManageWorkspace } from "@/lib/workspace-access";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();

  if (state?.login) {
    if (error || !code) return NextResponse.redirect(`${baseUrl}/login?error=instagram_denied`);
    const result = await signInWithInstagram(code);
    if (result.ok) return NextResponse.redirect(`${baseUrl}/dashboard?connected=true`);
    return NextResponse.redirect(`${baseUrl}/login?error=${result.reason}`);
  }

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=invalid`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: state.workspaceId,
      userId: session.user.id,
    },
  });

  const allowed = membership ? canManageWorkspace(membership.role) : await isOperatorUser(session.user.id);
  if (!allowed) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=forbidden`);
  }

  try {
    const account = await readInstagramAccount(code);
    if (!(await saveSocialAccount(state.workspaceId, account))) {
      return NextResponse.redirect(`${baseUrl}/settings?instagram=already_connected`);
    }

    return NextResponse.redirect(`${baseUrl}/dashboard?connected=true`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Instagram Callback] Error:", err);
    // The message is the only diagnostic a self-hoster gets for a failed
    // connect, so persist it alongside the other operational events rather
    // than leaving it in server logs they may not be able to reach.
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Instagram connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return NextResponse.redirect(
      `${baseUrl}/settings?instagram=failed&reason=${encodeURIComponent(
        message.slice(0, 200)
      )}`
    );
  }
}
