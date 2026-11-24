import { describe, it, expect } from "vitest";
import { matchRoster, parseRoster } from "../lib/roster";

const csv = [
  "№,Name,Platform,URL,Status,",
  "1,Baptiste,Inst,instagram.com/Leoo.hustles,Active,",
  ",,TT,tiktok.com/@leoo.hustles,Active,22.10",
  ",,FB,https://www.facebook.com/share/1HN/?mibextid=wwXIfr,Active,",
  '2,"Tainara Ramos',
  '",Inst,https://www.instagram.com/grind.with.tai?utm_source=qr,Inactive,24.10',
  ",,FB,,Inactive,",
  "21,,,,,",
  "3,Ana,Inst,https://www.instagram.com/ana_hustles/reels/,Active,",
  ",,FB,https://www.facebook.com/profile.php?id=1,Active,",
].join("\n");

describe("parseRoster", () => {
  it("groups platform rows under each numbered influencer", () => {
    expect(parseRoster(csv)).toEqual([
      { name: "Baptiste", instagram: "leoo.hustles", instagramStatus: "Active", facebookUrl: "https://www.facebook.com/share/1HN/?mibextid=wwXIfr", facebookStatus: "Active" },
      { name: "Tainara Ramos", instagram: "grind.with.tai", instagramStatus: "Inactive", facebookUrl: null, facebookStatus: "" },
      { name: "Ana", instagram: "ana_hustles", instagramStatus: "Active", facebookUrl: "https://www.facebook.com/profile.php?id=1", facebookStatus: "Active" },
    ]);
  });
});

describe("matchRoster", () => {
  it("resolves Facebook through the workspace of the matched Instagram account", () => {
    const now = Date.parse("2026-11-24");
    const past = new Date(now - 1000);
    const future = new Date(now + 1000);
    const rows = matchRoster(
      parseRoster(csv),
      [
        { workspaceId: "w1", platform: "INSTAGRAM", username: "leoo.hustles", tokenRevokedAt: null, tokenExpiresAt: future },
        { workspaceId: "w1", platform: "FACEBOOK", username: "page", tokenRevokedAt: past, tokenExpiresAt: null },
        { workspaceId: "w1", platform: "FACEBOOK", username: "page2", tokenRevokedAt: null, tokenExpiresAt: null },
        { workspaceId: "w1", platform: "FACEBOOK", username: "page3", tokenRevokedAt: null, tokenExpiresAt: past },
        { workspaceId: "w2", platform: "INSTAGRAM", username: "grind.with.tai", tokenRevokedAt: null, tokenExpiresAt: past },
      ],
      now
    );
    expect(rows.map((row) => [row.instagramState, row.facebookState])).toEqual([
      ["connected", "connected"],
      ["expired", null],
      ["not connected", "check manually"],
    ]);
  });
});
