import { parseCsv } from "@/lib/utils/csv";
import type { SocialPlatform } from "@/lib/social-platform";

type SheetActivity = "active" | "inactive" | null;

export type RosterPerson = {
  row: number;
  name: string;
  instagram: { handle: string; activity: SheetActivity } | null;
  facebook: { url: string; activity: SheetActivity } | null;
};

export type SheetIssue = { row: number; name: string; message: string };

export type RosterAccount = {
  id: string;
  workspaceId: string;
  platform: SocialPlatform;
  username: string;
  tokenRevokedAt: Date | null;
  tokenExpiresAt: Date | null;
};

export type ConnectionState = "connected" | "expired" | "revoked" | "not connected";

export type RosterItem = {
  name: string;
  platform: SocialPlatform;
  label: string;
  url: string | null;
  activity: SheetActivity;
  state: ConnectionState;
};

const KNOWN_PLATFORMS = new Set(["Inst", "TT", "YT Shorts", "FB"]);
const ACTIVITY_BY_STATUS: Record<string, SheetActivity> = { active: "active", warming: "active", inactive: "inactive" };
const INSTAGRAM_PATHS = new Set(["p", "reel", "reels", "stories", "explore", "tv"]);
const STATE_PRIORITY: ConnectionState[] = ["connected", "expired", "revoked"];

export function instagramHandle(url: string): string | null {
  const handle = url.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1].toLowerCase();
  return handle && !INSTAGRAM_PATHS.has(handle) ? handle : null;
}

function looseHandle(handle: string) {
  return handle.toLowerCase().replace(/[._]/g, "");
}

export function parseRoster(csv: string): { people: RosterPerson[]; issues: SheetIssue[] } {
  const people: RosterPerson[] = [];
  const issues: SheetIssue[] = [];
  let person: RosterPerson | null = null;

  for (const [index, row] of parseCsv(csv).entries()) {
    const line = index + 2;
    const report = (message: string) => issues.push({ row: line, name: person?.name ?? "", message });

    if (row["№"]) {
      person = row.name ? { row: line, name: row.name, instagram: null, facebook: null } : null;
      if (person) people.push(person);
      else report("Number without a name");
    }
    if (!person) {
      if (!row["№"] && (row.platform || row.url)) report("Row does not belong to any influencer");
      continue;
    }
    if (!row.platform) {
      if (row.url) report(`Link without a platform: ${row.url}`);
      continue;
    }
    if (!KNOWN_PLATFORMS.has(row.platform)) report(`Unknown platform "${row.platform}"`);
    if (row.platform !== "Inst" && row.platform !== "FB") continue;

    const platformName = row.platform === "Inst" ? "Instagram" : "Facebook";
    const status = row.status.toLowerCase();
    const activity = ACTIVITY_BY_STATUS[status] ?? null;
    if (!row.url) {
      if (activity === "active") report(`${platformName} is ${row.status} but has no link`);
      continue;
    }
    if (!status) report(`${platformName} status is empty`);
    else if (!(status in ACTIVITY_BY_STATUS)) report(`Unknown ${platformName} status "${row.status}"`);

    if (row.platform === "Inst") {
      const handle = instagramHandle(row.url);
      if (handle) person.instagram = { handle, activity };
      else report(`Instagram link has no username: ${row.url}`);
    } else {
      if (!/(facebook|fb)\.com\//i.test(row.url)) report(`Facebook link is not a facebook.com link: ${row.url}`);
      person.facebook = { url: row.url, activity };
    }
  }

  const seen = new Map<string, RosterPerson>();
  for (const listed of people) {
    if (!listed.instagram) {
      issues.push({ row: listed.row, name: listed.name, message: "No Instagram link" });
      continue;
    }
    const first = seen.get(listed.instagram.handle);
    if (first) issues.push({ row: listed.row, name: listed.name, message: `@${listed.instagram.handle} is also listed for ${first.name}` });
    else seen.set(listed.instagram.handle, listed);
  }

  return { people, issues };
}

function stateOf(account: RosterAccount, now: number): ConnectionState {
  if (account.tokenRevokedAt) return "revoked";
  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < now) return "expired";
  return "connected";
}

function bestState(accounts: RosterAccount[], now: number): ConnectionState {
  const states = accounts.map((account) => stateOf(account, now));
  return STATE_PRIORITY.find((state) => states.includes(state)) ?? "not connected";
}

export function matchRoster({ people, issues: sheetIssues }: ReturnType<typeof parseRoster>, accounts: RosterAccount[], now = Date.now()) {
  const matchedIds = new Set<string>();
  const items: RosterItem[] = [];
  const issues = [...sheetIssues];
  const instagram = accounts.filter((account) => account.platform === "INSTAGRAM");
  const exactHandles = new Set(people.map((person) => person.instagram?.handle));

  for (const person of people) {
    const handle = person.instagram?.handle;
    let instagramAccounts = instagram.filter((account) => account.username.toLowerCase() === handle);
    if (handle && instagramAccounts.length === 0) {
      instagramAccounts = instagram.filter(
        (account) => !exactHandles.has(account.username.toLowerCase()) && looseHandle(account.username) === looseHandle(handle)
      );
      for (const account of instagramAccounts) {
        issues.push({ row: person.row, name: person.name, message: `Sheet has @${handle}, OpenReply has @${account.username}` });
      }
    }
    const workspaceIds = new Set(instagramAccounts.map((account) => account.workspaceId));
    const pages = accounts.filter(
      (account) => account.platform === "FACEBOOK" && (account.username.toLowerCase() === handle || workspaceIds.has(account.workspaceId))
    );
    [...instagramAccounts, ...pages].forEach((account) => matchedIds.add(account.id));

    if (person.instagram) {
      items.push({
        name: person.name,
        platform: "INSTAGRAM",
        label: `@${person.instagram.handle}`,
        url: `https://www.instagram.com/${person.instagram.handle}`,
        activity: person.instagram.activity,
        state: bestState(instagramAccounts, now),
      });
    }
    if (person.facebook) {
      items.push({
        name: person.name,
        platform: "FACEBOOK",
        label: pages[0]?.username ?? "profile",
        url: person.facebook.url,
        activity: person.facebook.activity,
        state: bestState(pages, now),
      });
    } else if (pages.length > 0) {
      issues.push({ row: person.row, name: person.name, message: `Facebook Page ${pages[0].username} is connected, but the sheet has no Facebook link` });
    }
  }

  return {
    items,
    toConnect: items.filter((item) => item.activity === "active" && item.state !== "connected"),
    toRemove: items.filter((item) => item.activity === "inactive" && item.state !== "not connected"),
    notInSheet: accounts
      .filter((account) => !matchedIds.has(account.id))
      .map((account): RosterItem => ({
        name: account.username,
        platform: account.platform,
        label: account.platform === "INSTAGRAM" ? `@${account.username}` : account.username,
        url: null,
        activity: null,
        state: stateOf(account, now),
      })),
    issues: issues.sort((a, b) => a.row - b.row),
  };
}
