import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionError, sendCommentReply, sendDirectMessage, sendPrivateReply } from "../lib/meta/client";
import { getPagePosts, getPostInsights, getRecentPostComments } from "../lib/meta/facebook";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function respond(body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: true, url: "https://graph.facebook.com/x", json: async () => body });
}

afterEach(() => fetchMock.mockReset());

describe("Facebook Page Graph calls", () => {
  it("sends Messenger replies from the Page with a response messaging type", async () => {
    respond({ message_id: "m" });
    await sendPrivateReply("page_token", "page_1", "post_comment", "hi", "FACEBOOK");
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/graph\.facebook\.com\/v[\d.]+\/page_1\/messages$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      recipient: { comment_id: "post_comment" },
      messaging_type: "RESPONSE",
      message: { text: "hi" },
    });

    respond({ message_id: "m" });
    await sendDirectMessage("ig_token", "ig_1", "person", "hi", "INSTAGRAM");
    expect(fetchMock.mock.calls[1][0]).toContain("graph.instagram.com");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("messaging_type");
  });

  it("replies publicly on the comment's comments edge", async () => {
    respond({ id: "reply" });
    await sendCommentReply("page_token", "post_comment", "thanks", "FACEBOOK");
    expect(fetchMock.mock.calls[0][0]).toMatch(/graph\.facebook\.com\/v[\d.]+\/post_comment\/comments$/);
  });

  it("lists Page reels next to posts under their post ids", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      url,
      json: async () =>
        url.includes("/video_reels")
          ? {
              data: [
                {
                  id: "video_1",
                  post_id: "reel_post",
                  description: "reel",
                  created_time: "2026-11-10T10:00:00+0000",
                  likes: { summary: { total_count: 7 } },
                },
                { id: "video_2", post_id: "photo_post", created_time: "2026-11-09T10:00:00+0000" },
              ],
            }
          : {
              data: [
                {
                  id: "page_1_photo_post",
                  message: "photo",
                  created_time: "2026-11-09T10:00:00+0000",
                  attachments: { data: [{ media_type: "photo" }] },
                  reactions: { summary: { total_count: 4 } },
                  comments: { summary: { total_count: 2 } },
                },
              ],
            },
    }));

    const media = await getPagePosts("page_token", "page_1", 10);

    expect(media.map((item) => [item.id, item.media_product_type, item.like_count])).toEqual([
      ["page_1_reel_post", "REELS", 7],
      ["page_1_photo_post", undefined, 4],
    ]);
  });

  it("still lists Page reels when Meta rejects the reel count fields", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/video_reels") && url.includes("likes")) {
        return { ok: false, status: 400, url, json: async () => ({ error: { message: "Unknown field", code: 2500 } }) };
      }
      return {
        ok: true,
        url,
        json: async () =>
          url.includes("/video_reels")
            ? { data: [{ id: "video_1", post_id: "reel_post", created_time: "2026-11-10T10:00:00+0000" }] }
            : { data: [] },
      };
    });

    const media = await getPagePosts("page_token", "page_1", 10);

    expect(media.map((item) => item.id)).toEqual(["page_1_reel_post"]);
  });

  it("reads post views and reach from the Page post insights", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      url,
      json: async () =>
        url.includes("/insights")
          ? {
              data: [
                { name: "post_media_view", values: [{ value: 120 }] },
                { name: "post_total_media_view_unique", values: [{ value: 80 }] },
              ],
            }
          : { reactions: { summary: { total_count: 4 } }, shares: { count: 2 } },
    }));

    expect(await getPostInsights("page_token", "page_1_post", ["views", "reach", "shares", "saved"])).toEqual({
      views: 120,
      reach: 80,
      shares: 2,
    });
  });

  it("surfaces a missing insights permission instead of hiding it", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/insights")
        ? {
            ok: false,
            status: 403,
            url,
            json: async () => ({ error: { message: "(#10) Requires read_insights permission", code: 10 } }),
          }
        : { ok: true, url, json: async () => ({}) }
    );

    await expect(getPostInsights("page_token", "page_1_post", ["views"])).rejects.toBeInstanceOf(PermissionError);
  });

  it("maps Page comments to the shared comment shape and stops at the window", async () => {
    respond({
      data: [
        {
          id: "c1",
          message: "LINK",
          created_time: "2026-11-09T10:00:00+0000",
          from: { id: "person", name: "Alex" },
          comments: { data: [{ id: "r1", from: { id: "page_1", name: "Page" } }] },
        },
        { id: "c0", message: "old", created_time: "2026-11-01T10:00:00+0000" },
      ],
      paging: { next: "https://graph.facebook.com/next" },
    });
    const comments = await getRecentPostComments("page_token", "post", Date.parse("2026-11-08T00:00:00Z"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(comments).toEqual([
      {
        id: "c1",
        text: "LINK",
        timestamp: "2026-11-09T10:00:00+0000",
        from: { id: "person", username: "Alex" },
        replies: { data: [{ id: "r1", from: { id: "page_1", username: "Page" } }] },
      },
    ]);
  });
});
