import { parseCsv } from "@/lib/utils/csv";
import type { SocialPlatform } from "@/lib/social-platform";

export type RosterEntry = {
  name: string;
  instagram: string | null;
  instagramStatus: string;
  facebookUrl: string | null;
  facebookStatus: string;
};

export type RosterAccount = {
  workspaceId: string;
  platform: SocialPlatform;
  username: string;
  tokenRevokedAt: Date | null;
  tokenExpiresAt: Date | null;
};

export type ConnectionState = "connected" | "expired" | "revoked" | "not connected" | "check manually";

export function instagramHandle(url: string): string | null {
  const match = url.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  return match ? match[1].toLowerCase() : null;
}

export function parseRoster(csv: string): RosterEntry[] {
  const entries: RosterEntry[] = [];
  for (const row of parseCsv(csv)) {
    if (row["№"]) entries.push({ name: row.name, instagram: null, instagramStatus: "", facebookUrl: null, facebookStatus: "" });
    const entry = entries.at(-1);
    if (!entry || !row.url) continue;
    if (row.platform === "Inst") {
      entry.instagram = instagramHandle(row.url);
      entry.instagramStatus = row.status;
    }
    if (row.platform === "FB") {
      entry.facebookUrl = row.url;
      entry.facebookStatus = row.status;
    }
  }
  return entries.filter((entry) => entry.name);
}

function stateOf(account: RosterAccount | undefined, now: number): ConnectionState {
  if (!account) return "not connected";
  if (account.tokenRevokedAt) return "revoked";
  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < now) return "expired";
  return "connected";
}

export function matchRoster(entries: RosterEntry[], accounts: RosterAccount[], now = Date.now()) {
  const instagramByHandle = new Map<string, RosterAccount>();
  const facebookByWorkspace = new Map<string, ConnectionState>();
  for (const account of accounts) {
    if (account.platform === "INSTAGRAM") instagramByHandle.set(account.username.toLowerCase(), account);
    else if (facebookByWorkspace.get(account.workspaceId) !== "connected") facebookByWorkspace.set(account.workspaceId, stateOf(account, now));
  }

  return entries.map((entry) => {
    const instagramAccount = entry.instagram ? instagramByHandle.get(entry.instagram) : undefined;
    const facebook: ConnectionState | null = !entry.facebookUrl
      ? null
      : instagramAccount
        ? (facebookByWorkspace.get(instagramAccount.workspaceId) ?? "not connected")
        : "check manually";
    return { ...entry, instagramState: entry.instagram ? stateOf(instagramAccount, now) : null, facebookState: facebook };
  });
}
