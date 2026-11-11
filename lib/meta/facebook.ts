import { getMetaGraphApiVersion, requireEnv } from "@/lib/env";
import {
  facebookGraphBase,
  handleResponse,
  PermissionError,
  type InstagramComment,
  type InstagramConversation,
  type InstagramMedia,
  type InstagramMediaInsights,
  type InstagramMessage,
  type InstagramUser,
} from "./client";

const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_read_engagement",
  "pages_read_user_content",
  "read_insights",
  "pages_manage_metadata",
  "pages_manage_engagement",
  "business_management",
];

const PAGE_WEBHOOK_FIELDS = "feed,messages,messaging_postbacks,message_reads";

const COUNT_FIELDS = "reactions.limit(0).summary(total_count),comments.limit(0).summary(total_count)";

type FacebookPerson = { id: string; name?: string };

type GraphList<T> = { data?: T[]; paging?: { next?: string } };

type Count = { summary?: { total_count?: number } };

function toParticipant(person: FacebookPerson) {
  return { id: person.id, username: person.name };
}

function asParticipant(person?: FacebookPerson) {
  return person ? toParticipant(person) : undefined;
}

function graphUrl(path: string, params: Record<string, string>) {
  const url = new URL(`${facebookGraphBase()}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function graphFetch<T>(url: string, accessToken?: string, method = "GET") {
  return handleResponse<T>(
    await fetch(url, accessToken ? { method, headers: { Authorization: `Bearer ${accessToken}` } } : { method })
  );
}

function graphGet<T>(path: string, accessToken: string, params: Record<string, string> = {}) {
  return graphFetch<T>(graphUrl(path, params), accessToken);
}

async function followPages<T>(first: GraphList<T>, accessToken: string, max: number, stop?: (page: T[]) => boolean) {
  const results: T[] = [];
  let page: GraphList<T> | undefined = first;
  while (page && results.length < max) {
    const items: T[] = page.data ?? [];
    results.push(...items);
    const next: string | undefined = stop?.(items) ? undefined : page.paging?.next;
    page = next ? await graphFetch<GraphList<T>>(next, accessToken) : undefined;
  }
  return results.slice(0, max);
}

export function getFacebookAuthorizationUrl(redirectUri: string, state: string): string {
  const configId = process.env.FACEBOOK_LOGIN_CONFIG_ID;
  const params = new URLSearchParams({
    client_id: requireEnv("FACEBOOK_APP_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    ...(configId ? { config_id: configId } : { scope: FACEBOOK_SCOPES.join(",") }),
  });
  return `https://www.facebook.com/${getMetaGraphApiVersion()}/dialog/oauth?${params}`;
}

async function requestAccessToken(params: Record<string, string>) {
  const { access_token } = await graphFetch<{ access_token: string }>(
    graphUrl("oauth/access_token", {
      client_id: requireEnv("FACEBOOK_APP_ID"),
      client_secret: requireEnv("FACEBOOK_APP_SECRET"),
      ...params,
    })
  );
  return access_token;
}

export async function exchangeFacebookCode(code: string, redirectUri: string): Promise<string> {
  const shortLived = await requestAccessToken({ redirect_uri: redirectUri, code });
  return requestAccessToken({ grant_type: "fb_exchange_token", fb_exchange_token: shortLived });
}

export async function getFacebookProfileId(userToken: string): Promise<string> {
  const { id } = await graphGet<{ id: string }>("me", userToken, { fields: "id" });
  return id;
}

export type ManagedPage = { id: string; name: string; username?: string; access_token: string };

export async function getManagedPages(userToken: string): Promise<ManagedPage[]> {
  const first = await graphGet<GraphList<ManagedPage>>("me/accounts", userToken, {
    fields: "id,name,username,access_token",
    limit: "100",
  });
  return followPages(first, userToken, 500);
}

export async function subscribePageToWebhooks(pageId: string, pageToken: string) {
  return graphFetch<{ success: boolean }>(
    graphUrl(`${pageId}/subscribed_apps`, { subscribed_fields: PAGE_WEBHOOK_FIELDS }),
    pageToken,
    "POST"
  );
}

export async function verifyPageToken(pageToken: string, pageId: string) {
  await graphGet<{ id: string }>(pageId, pageToken, { fields: "id" });
}

export async function getPageInfo(pageToken: string, pageId: string): Promise<InstagramUser> {
  const page = await graphGet<{
    id: string;
    name: string;
    username?: string;
    followers_count?: number;
    picture?: { data?: { url?: string } };
  }>(pageId, pageToken, { fields: "id,name,username,followers_count,picture{url}" });
  return {
    id: page.id,
    user_id: page.id,
    username: page.username ?? page.name,
    name: page.name,
    profile_picture_url: page.picture?.data?.url,
    ...(typeof page.followers_count === "number" ? { followers_count: page.followers_count } : {}),
  };
}

type FacebookPost = {
  id: string;
  message?: string;
  created_time: string;
  full_picture?: string;
  permalink_url?: string;
  attachments?: { data?: { media_type?: string }[] };
  reactions?: Count;
  comments?: Count;
};

type FacebookReel = {
  id: string;
  post_id?: string;
  description?: string;
  created_time: string;
  picture?: string;
  permalink_url?: string;
  likes?: Count;
  comments?: Count;
};

function postMediaType(post: FacebookPost, isReel: boolean): InstagramMedia["media_type"] {
  if (isReel) return "VIDEO";
  const attachmentType = post.attachments?.data?.[0]?.media_type;
  if (attachmentType === "video") return "VIDEO";
  if (attachmentType === "album") return "CAROUSEL_ALBUM";
  return "IMAGE";
}

function asMedia(post: FacebookPost): InstagramMedia {
  const isReel = /\/reel\//.test(post.permalink_url ?? "");
  return {
    id: post.id,
    caption: post.message,
    media_type: postMediaType(post, isReel),
    media_product_type: isReel ? "REELS" : undefined,
    thumbnail_url: post.full_picture,
    media_url: post.full_picture,
    timestamp: post.created_time,
    permalink: post.permalink_url,
    like_count: post.reactions?.summary?.total_count,
    comments_count: post.comments?.summary?.total_count,
  };
}

function reelAsMedia(pageId: string, reel: FacebookReel & { post_id: string }): InstagramMedia {
  return {
    id: `${pageId}_${reel.post_id}`,
    caption: reel.description,
    media_type: "VIDEO",
    media_product_type: "REELS",
    thumbnail_url: reel.picture,
    media_url: reel.picture,
    timestamp: reel.created_time,
    permalink: reel.permalink_url,
    like_count: reel.likes?.summary?.total_count,
    comments_count: reel.comments?.summary?.total_count,
  };
}

const REEL_FIELDS = "id,post_id,description,created_time,picture,permalink_url";

const REEL_COUNT_FIELDS = "likes.limit(0).summary(total_count),comments.limit(0).summary(total_count)";

async function fetchReels(pageToken: string, pageId: string, max: number, fields: string) {
  const first = await graphGet<GraphList<FacebookReel>>(`${pageId}/video_reels`, pageToken, {
    fields,
    limit: String(Math.min(100, max)),
  });
  return followPages(first, pageToken, max);
}

async function getPageReels(pageToken: string, pageId: string, max: number): Promise<InstagramMedia[]> {
  try {
    const reels = await fetchReels(pageToken, pageId, max, `${REEL_FIELDS},${REEL_COUNT_FIELDS}`).catch(
      (error: unknown) => {
        console.warn("[Facebook] Page reel counts unavailable:", pageId, error);
        return fetchReels(pageToken, pageId, max, REEL_FIELDS);
      }
    );
    return reels
      .filter((reel): reel is FacebookReel & { post_id: string } => Boolean(reel.post_id))
      .map((reel) => reelAsMedia(pageId, reel));
  } catch (error) {
    console.warn("[Facebook] Page reels unavailable:", pageId, error);
    return [];
  }
}

export async function getPagePosts(pageToken: string, pageId: string, max = 25): Promise<InstagramMedia[]> {
  const [first, reels] = await Promise.all([
    graphGet<GraphList<FacebookPost>>(`${pageId}/posts`, pageToken, {
      fields: `id,message,created_time,full_picture,permalink_url,attachments{media_type},${COUNT_FIELDS}`,
      limit: String(Math.min(100, max)),
    }),
    getPageReels(pageToken, pageId, max),
  ]);
  const posts = (await followPages(first, pageToken, max)).map(asMedia);
  const postIds = new Set(posts.map((post) => post.id));
  return [...posts, ...reels.filter((reel) => !postIds.has(reel.id))]
    .sort((a, b) => Date.parse(b.timestamp ?? "") - Date.parse(a.timestamp ?? ""))
    .slice(0, max);
}

type FacebookComment = {
  id: string;
  message?: string;
  created_time: string;
  from?: FacebookPerson;
  comments?: { data?: { id: string; from?: FacebookPerson }[] };
};

export async function getRecentPostComments(
  pageToken: string,
  postId: string,
  sinceMs: number,
  max = 800
): Promise<InstagramComment[]> {
  const first = await graphGet<GraphList<FacebookComment>>(`${postId}/comments`, pageToken, {
    fields: "id,message,created_time,from,comments{from}",
    order: "reverse_chronological",
    limit: "50",
  });
  const isOlderThanWindow = (page: FacebookComment[]) => {
    const oldest = page[page.length - 1];
    return Boolean(oldest && Date.parse(oldest.created_time) < sinceMs);
  };
  const comments = await followPages(first, pageToken, max, isOlderThanWindow);
  return comments
    .filter((comment) => Date.parse(comment.created_time) >= sinceMs)
    .map((comment) => ({
      id: comment.id,
      text: comment.message ?? "",
      timestamp: comment.created_time,
      from: asParticipant(comment.from),
      replies: { data: comment.comments?.data?.map((reply) => ({ id: reply.id, from: asParticipant(reply.from) })) },
    }));
}

const VIEW_METRICS = ["post_media_view", "post_total_media_view_unique"] as const;

type ViewMetric = (typeof VIEW_METRICS)[number];

async function getPostViewMetrics(pageToken: string, postId: string): Promise<Partial<Record<ViewMetric, number>>> {
  try {
    const insights = await graphGet<GraphList<{ name: string; values?: { value?: unknown }[] }>>(
      `${postId}/insights`,
      pageToken,
      { metric: VIEW_METRICS.join(",") }
    );
    return Object.fromEntries(
      (insights.data ?? [])
        .map((metric) => [metric.name, metric.values?.[0]?.value] as const)
        .filter(([, value]) => typeof value === "number")
    );
  } catch (error) {
    if (error instanceof PermissionError) throw error;
    console.warn("[Facebook] Post view metrics unavailable:", postId, error);
    return {};
  }
}

export async function getPostInsights(
  pageToken: string,
  postId: string,
  metrics: string[]
): Promise<InstagramMediaInsights> {
  const [post, viewMetrics] = await Promise.all([
    graphGet<{ reactions?: Count; comments?: Count; shares?: { count?: number } }>(postId, pageToken, {
      fields: `${COUNT_FIELDS},shares`,
    }),
    getPostViewMetrics(pageToken, postId),
  ]);
  const available: InstagramMediaInsights = {
    likes: post.reactions?.summary?.total_count,
    comments: post.comments?.summary?.total_count,
    shares: post.shares?.count ?? 0,
    views: viewMetrics.post_media_view,
    reach: viewMetrics.post_total_media_view_unique,
  };
  return Object.fromEntries(
    Object.entries(available).filter(([metric, value]) => metrics.includes(metric) && typeof value === "number")
  );
}

type FacebookMessage = {
  id: string;
  created_time?: string;
  message?: string;
  from?: FacebookPerson;
  to?: { data?: FacebookPerson[] };
};

function asMessage(message: FacebookMessage): InstagramMessage {
  return {
    id: message.id,
    created_time: message.created_time,
    message: message.message,
    from: asParticipant(message.from),
    to: message.to?.data ? { data: message.to.data.map(toParticipant) } : undefined,
  };
}

export async function getPageConversations(pageToken: string, pageId: string): Promise<InstagramConversation[]> {
  const page = await graphGet<{
    data?: {
      id: string;
      updated_time?: string;
      participants?: { data?: FacebookPerson[] };
      messages?: { data?: FacebookMessage[] };
    }[];
  }>(`${pageId}/conversations`, pageToken, {
    platform: "messenger",
    fields: "participants,updated_time,messages.limit(1){message,from,created_time}",
    limit: "50",
  });
  return (page.data ?? []).map((conversation) => ({
    id: conversation.id,
    updated_time: conversation.updated_time,
    participants: { data: (conversation.participants?.data ?? []).map(toParticipant) },
    messages: { data: (conversation.messages?.data ?? []).map(asMessage) },
  }));
}

export async function getPageConversationMessages(pageToken: string, conversationId: string): Promise<InstagramMessage[]> {
  const conversation = await graphGet<{ messages?: { data?: FacebookMessage[] } }>(conversationId, pageToken, {
    fields: "messages{id,created_time,from,to,message}",
  });
  return (conversation.messages?.data ?? []).map(asMessage);
}
