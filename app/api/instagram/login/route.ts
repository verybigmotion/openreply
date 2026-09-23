import { NextResponse } from "next/server";
import { getBaseUrl, getMissingInstagramOAuthEnv } from "@/lib/env";
import { createLoginOAuthState, getAuthorizationUrl } from "@/lib/meta/oauth";

export async function GET() {
  const baseUrl = getBaseUrl();
  if (getMissingInstagramOAuthEnv().length > 0) {
    return NextResponse.redirect(`${baseUrl}/login?error=instagram_misconfigured`);
  }
  const redirectUri = `${baseUrl}/api/instagram/callback`;
  return NextResponse.redirect(getAuthorizationUrl(redirectUri, createLoginOAuthState()));
}
