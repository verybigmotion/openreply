import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceSocialAccount } from "@/lib/instagram-accounts";
import {
  getConversationMessages,
  MetaApiError,
} from "@/lib/instagram/provider";
import { createSocialAccountContext } from "@/lib/instagram/provider";

export interface ThreadMessage {
  id: string;
  text: string;
  fromMe: boolean;
  fromUsername: string | null;
  createdTime: string | null;
}

export interface ThreadResponse {
  messages: ThreadMessage[];
}

type RouteProps = { params: Promise<{ id: string }> };

// Message history for a single conversation (20 most recent, chronological).
export async function GET(request: NextRequest, { params }: RouteProps) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id: conversationId } = await params;

  const account = await getWorkspaceSocialAccount(
    workspaceId,
    request.nextUrl.searchParams.get("socialAccountId")
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "No account connected." },
      { status: 400 }
    );
  }

  try {
    const accessToken = await createSocialAccountContext(account);
    const raw = await getConversationMessages({
      context: accessToken,
      conversationId: conversationId,
    });

    // The API returns newest-first; reverse to read top-to-bottom.
    const messages: ThreadMessage[] = raw
      .map((m) => ({
        id: m.id,
        text: m.message ?? "",
        fromMe: m.from?.id === account.externalId,
        fromUsername: m.from?.username ?? null,
        createdTime: m.created_time ?? null,
      }))
      .reverse();

    const data: ThreadResponse = { messages };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Conversation Messages] Error:", err);
    const message =
      err instanceof MetaApiError ? err.message : "Failed to load messages";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
