import { NextResponse } from "next/server";
import { getBaseUrl, getMissingFacebookOAuthEnv } from "@/lib/env";
import { facebookRedirectUri } from "@/lib/facebook-login";
import { getFacebookAuthorizationUrl } from "@/lib/meta/facebook";
import { createLoginOAuthState } from "@/lib/meta/oauth";

export async function GET() {
  if (getMissingFacebookOAuthEnv().length > 0) {
    return NextResponse.redirect(`${getBaseUrl()}/login?error=facebook_misconfigured`);
  }
  return NextResponse.redirect(getFacebookAuthorizationUrl(facebookRedirectUri(), createLoginOAuthState()));
}
