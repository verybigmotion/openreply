import * as meta from "@/lib/meta/client";
import { zernioRequest } from "@/lib/zernio/client";
import * as facebook from "@/lib/meta/facebook";
import { isFacebook, type SocialAccountContext } from "./context";

export async function getConversations({
  context,
  igUserId,
}: {
  context: SocialAccountContext;
  igUserId: string;
}): Promise<meta.InstagramConversation[]> {
  if (isFacebook(context))
    return facebook.getPageConversations(context.accessToken, context.externalId);
  if (context.provider === "META")
    return meta.getConversations(context.accessToken, igUserId);
  const result = await zernioRequest<{
    data: {
      id: string;
      participantId?: string;
      participantUsername?: string;
      updatedTime: string;
      lastMessage: string;
    }[];
  }>({
    apiKey: context.apiKey,
    path: `/inbox/conversations?accountId=${encodeURIComponent(context.accountId)}&limit=50`,
  });
  // The list has no sender for lastMessage. Leave the optional preview absent
  // rather than attribute it to the wrong person or fetch every full thread.
  return result.data.map((c) => ({
    id: c.id,
    updated_time: c.updatedTime,
    participants: {
      data: c.participantId
        ? [
            { id: c.participantId, username: c.participantUsername },
            { id: igUserId },
          ]
        : [],
    },
  }));
}

export async function getConversationMessages({
  context,
  conversationId,
}: {
  context: SocialAccountContext;
  conversationId: string;
}): Promise<meta.InstagramMessage[]> {
  if (isFacebook(context))
    return facebook.getPageConversationMessages(context.accessToken, conversationId);
  if (context.provider === "META")
    return meta.getConversationMessages(context.accessToken, conversationId);
  const result = await zernioRequest<{
    messages: {
      id: string;
      message: string;
      senderId?: string;
      direction: string;
      createdAt?: string;
    }[];
  }>({
    apiKey: context.apiKey,
    path: `/inbox/conversations/${encodeURIComponent(conversationId)}/messages?accountId=${encodeURIComponent(context.accountId)}&limit=20&sortOrder=desc`,
  });
  return result.messages.map((m) => ({
    id: m.id,
    message: m.message,
    created_time: m.createdAt,
    from:
      m.direction === "outgoing"
        ? { id: context.externalId }
        : m.senderId
          ? { id: m.senderId }
          : undefined,
  }));
}
