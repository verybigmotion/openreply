import { describe, expect, it } from "vitest";
import {
  parseCommentEvents,
  parseMessageEvents,
  parsePostbackEvents,
} from "../lib/meta/webhook";

const feedChange = (value: Record<string, unknown>) => ({
  object: "page",
  entry: [{ id: "page_1", time: 1, changes: [{ field: "feed", value }] }],
});

describe("Facebook Page webhooks", () => {
  it("turns a new Page comment into a comment event", () => {
    expect(
      parseCommentEvents(
        feedChange({
          item: "comment",
          verb: "add",
          comment_id: "post_1_comment_9",
          post_id: "page_1_post_1",
          message: "LINK",
          from: { id: "person_7", name: "Alex" },
        })
      )
    ).toEqual([
      {
        instagramAccountId: "page_1",
        commentId: "post_1_comment_9",
        commentText: "LINK",
        commenterId: "person_7",
        commenterName: "Alex",
        mediaId: "page_1_post_1",
        originalMediaId: undefined,
      },
    ]);
  });

  it("ignores edits, reactions and the Page's own comments", () => {
    const base = { comment_id: "c", post_id: "p", message: "LINK" };
    expect(parseCommentEvents(feedChange({ ...base, item: "comment", verb: "edited", from: { id: "person_7" } }))).toEqual([]);
    expect(parseCommentEvents(feedChange({ ...base, item: "reaction", verb: "add", from: { id: "person_7" } }))).toEqual([]);
    expect(parseCommentEvents(feedChange({ ...base, item: "comment", verb: "add", from: { id: "page_1" } }))).toEqual([]);
  });

  it("reads Messenger messages and postbacks for the Page", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page_1",
          time: 1,
          messaging: [
            { sender: { id: "person_7" }, recipient: { id: "page_1" }, message: { mid: "m1", text: "link" } },
            { sender: { id: "person_7" }, recipient: { id: "page_1" }, postback: { mid: "m2", payload: "reveal:c1" } },
            { sender: { id: "page_1" }, recipient: { id: "person_7" }, message: { mid: "m3", text: "link", is_echo: true } },
          ],
        },
      ],
    };
    expect(parseMessageEvents(payload)).toEqual([
      { instagramAccountId: "page_1", messageId: "m1", messageText: "link", senderId: "person_7" },
    ]);
    expect(parsePostbackEvents(payload)).toEqual([
      { instagramAccountId: "page_1", userId: "person_7", payload: "reveal:c1", mid: "m2" },
    ]);
  });
});
