import { describe, it, expect } from "vitest";
import { facebookIdFromUrl, matchRoster, parseRoster, type RosterAccount } from "../lib/roster";

describe("facebookIdFromUrl", () => {
  it("reads the numeric id from profile and people links", () => {
    expect(facebookIdFromUrl("https://www.facebook.com/profile.php?id=61595032421343&sk=reels_tab")).toBe("61595032421343");
    expect(facebookIdFromUrl("https://www.facebook.com/profile.php?mibextid=x&id=42")).toBe("42");
    expect(facebookIdFromUrl("https://www.facebook.com/people/cesarhustlesss/61595835669405/?mibextid=wwXIfr")).toBe("61595835669405");
    expect(facebookIdFromUrl("https://www.facebook.com/gih1705?mibextid=wwXIfr&rdid=r5L6")).toBe("gih1705");
    expect(facebookIdFromUrl("https://www.facebook.com/share/1HNXD9B5gV/")).toBeNull();
  });
});

const csv = [
  "№,Name,Platform,URL,Status,",
  "1,Baptiste,Inst,instagram.com/Leoo.hustles,Active,",
  ",,TT,tiktok.com/@leoo.hustles,,22.10",
  ",,FB,https://www.facebook.com/share/1HN/?mibextid=wwXIfr,Warming,",
  '2,"Tainara Ramos',
  '",Inst,https://www.instagram.com/grind.with.tai?utm_source=qr,Inactive,24.10',
  ",,FB,,Inactive,",
  "3,,,,,",
  "4,Nelly,Inst,https://www.instagram.com/grind.with.nelly/reels/,Active,",
  ",,FB,https://www.facebook.com/profile.php?id=1,Active,",
  "5,Zeyn,Inst,https://www.instagram.com/zeyn_hustles,Active,",
  "6,Newbie,Inst,https://www.instagram.com/newbie,,",
  ",,FB,https://www.tiktok.com/@newbie,,",
  "7,Cagla,Inst,,,",
  ",,FB,,Active,",
  "8,Twin,Inst,https://www.instagram.com/newbie,Activ,",
  "9,Lost,Inst,https://www.instagram.com/p/ABC123,Active,",
  ",,Threads,https://threads.net/@lost,Active,",
].join("\n");

describe("parseRoster", () => {
  it("groups platform rows under each named influencer and treats Warming as active", () => {
    const { people } = parseRoster(csv);
    expect(people.slice(0, 2)).toEqual([
      { row: 2, name: "Baptiste", instagram: { handle: "leoo.hustles", activity: "active" }, facebook: { url: "https://www.facebook.com/share/1HN/?mibextid=wwXIfr", activity: "active" } },
      { row: 5, name: "Tainara Ramos", instagram: { handle: "grind.with.tai", activity: "inactive" }, facebook: null },
    ]);
  });

  it("flags what a person filling the sheet can get wrong", () => {
    expect(parseRoster(csv).issues.map((issue) => `${issue.row} ${issue.name}: ${issue.message}`)).toEqual([
      "7 : Number without a name",
      "11 Newbie: Instagram status is empty",
      "12 Newbie: Facebook status is empty",
      "12 Newbie: Facebook link is not a facebook.com link: https://www.tiktok.com/@newbie",
      "14 Cagla: Facebook is Active but has no link",
      "15 Twin: Unknown Instagram status \"Activ\"",
      "16 Lost: Instagram link has no username: https://www.instagram.com/p/ABC123",
      "17 Lost: Unknown platform \"Threads\"",
      "13 Cagla: No Instagram link",
      "15 Twin: @newbie is also listed for Newbie",
      "16 Lost: No Instagram link",
    ]);
  });
});

describe("matchRoster", () => {
  it("lists what needs fixing on each side", () => {
    const now = Date.parse("2026-11-24");
    const past = new Date(now - 1000);
    const account = (id: string, workspaceId: string, platform: RosterAccount["platform"], username: string, extra: Partial<RosterAccount> = {}): RosterAccount => ({
      id, workspaceId, platform, username, tokenRevokedAt: null, tokenExpiresAt: null, ...extra,
    });
    const result = matchRoster(
      parseRoster(csv),
      [
        account("1", "w1", "INSTAGRAM", "leoo.hustles", { tokenExpiresAt: past }),
        account("2", "w1", "FACEBOOK", "Leoo page", { tokenRevokedAt: past }),
        account("3", "w1", "FACEBOOK", "Leoo page 2"),
        account("4", "w2", "INSTAGRAM", "grind.with.tai"),
        account("5", "w2", "FACEBOOK", "Tai page"),
        account("6", "w3", "INSTAGRAM", "grind.with.nelly", { tokenRevokedAt: past }),
        account("7", "w4", "FACEBOOK", "Grind.With.Nelly"),
        account("8", "w5", "INSTAGRAM", "zeyn.hustles"),
        account("9", "w6", "INSTAGRAM", "newbie"),
        account("10", "w7", "FACEBOOK", "Bigmotion"),
      ],
      now
    );
    const brief = (items: typeof result.toConnect) => items.map((item) => [item.name, item.platform, item.state]);
    expect(brief(result.toConnect)).toEqual([
      ["Baptiste", "INSTAGRAM", "expired"],
      ["Nelly", "INSTAGRAM", "revoked"],
    ]);
    expect(brief(result.toRemove)).toEqual([["Tainara Ramos", "INSTAGRAM", "connected"]]);
    expect(brief(result.notInSheet)).toEqual([["Bigmotion", "FACEBOOK", "connected"]]);
    expect(result.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(["Facebook Page Tai page is connected, but the sheet has no Facebook link", "Sheet has @zeyn_hustles, OpenReply has @zeyn.hustles"])
    );
  });
});
