import { NextResponse } from "next/server";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getBaseUrl, getMissingFacebookOAuthEnv } from "@/lib/env";
import { facebookRedirectUri } from "@/lib/facebook-login";
import { getFacebookAuthorizationUrl } from "@/lib/meta/facebook";
import { createOAuthState } from "@/lib/meta/oauth";

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.redirect(`${getBaseUrl()}/login`);
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.redirect(`${getBaseUrl()}/settings?facebook=forbidden`);
  }
  if (getMissingFacebookOAuthEnv().length > 0) {
    return NextResponse.redirect(`${getBaseUrl()}/settings?facebook=misconfigured`);
  }
  return NextResponse.redirect(
    getFacebookAuthorizationUrl(facebookRedirectUri(), createOAuthState(context.workspaceId))
  );
}
