import { prisma } from "@/lib/db/client";
import { matchRoster, parseRoster, resolveFacebookId, type ConnectionState, type RosterItem } from "@/lib/roster";
import type { SocialPlatform } from "@/lib/social-platform";
import CopyButton from "@/components/copy-button";

const STATE_CLASS: Record<ConnectionState, string> = {
  connected: "bg-success/10 text-success",
  expired: "bg-error/10 text-error",
  revoked: "bg-error/10 text-error",
  "not connected": "bg-warning/10 text-warning",
};

const SEGMENTS = [
  { key: "ok", label: "OK", className: "bg-success" },
  { key: "toConnect", label: "To connect", className: "bg-warning" },
  { key: "toRemove", label: "To remove", className: "bg-error" },
] as const;

const PLATFORMS: { platform: SocialPlatform; label: string }[] = [
  { platform: "INSTAGRAM", label: "Instagram" },
  { platform: "FACEBOOK", label: "Facebook" },
];

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  return platform === "INSTAGRAM" ? (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-[#E1306C]" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Instagram">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-[#1877F2]" fill="currentColor" aria-label="Facebook">
      <path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
    </svg>
  );
}

type ListedItem = RosterItem & { copyValue: string | null };

async function withCopyValues(items: RosterItem[]): Promise<ListedItem[]> {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      copyValue: item.platform === "INSTAGRAM" ? item.label.replace(/^@/, "") : item.url ? await resolveFacebookId(item.url) : null,
    }))
  );
}

function ItemList({ title, items }: { title: string; items: ListedItem[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">
        {title} <span className="font-normal text-muted">{items.length}</span>
      </h3>
      {items.length === 0 && <p className="mt-3 text-sm text-muted">Nothing here.</p>}
      <ul className="mt-2 divide-y divide-border">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 py-2 text-sm">
            <PlatformIcon platform={item.platform} />
            <span className="truncate text-foreground">{item.name}</span>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" className="truncate text-muted hover:text-foreground hover:underline">
                {item.label}
              </a>
            ) : (
              item.label !== item.name && <span className="truncate text-muted">{item.label}</span>
            )}
            {item.copyValue && <CopyButton value={item.copyValue} />}
            <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs ${STATE_CLASS[item.state]}`}>{item.state}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function OperatorRoster() {
  const csvUrl = process.env.ROSTER_CSV_URL;
  if (!csvUrl) {
    return <p className="panel rounded p-4 text-sm text-muted">Set ROSTER_CSV_URL to the sheet&apos;s CSV export link to compare it with OpenReply.</p>;
  }

  const [response, accounts] = await Promise.all([
    fetch(csvUrl).catch(() => null),
    prisma.socialAccount.findMany({
      select: { id: true, workspaceId: true, platform: true, username: true, tokenRevokedAt: true, tokenExpiresAt: true },
    }),
  ]);
  if (!response?.ok) {
    return <p className="panel rounded p-4 text-sm text-error">Could not load the sheet{response ? ` (HTTP ${response.status})` : ""}.</p>;
  }

  const { items, toConnect, toRemove, notInSheet, issues } = matchRoster(parseRoster(await response.text()), accounts);
  const groups = { ok: items.filter((item) => item.activity === "active" && item.state === "connected"), toConnect, toRemove };
  const rows = PLATFORMS.map(({ platform, label }) => ({
    platform,
    label,
    counts: SEGMENTS.map((segment) => ({ ...segment, count: groups[segment.key].filter((item) => item.platform === platform).length })),
  }));
  const widest = Math.max(1, ...rows.map((row) => row.counts.reduce((sum, segment) => sum + segment.count, 0)));
  const [listedToConnect, listedToRemove, listedNotInSheet] = await Promise.all([toConnect, toRemove, notInSheet].map(withCopyValues));

  return (
    <section className="panel rounded p-4 sm:p-6">
      <h2 className="text-base font-semibold text-foreground">Sheet vs OpenReply</h2>

      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.platform} className="flex items-center gap-3 text-sm">
            <div className="flex w-28 shrink-0 items-center gap-2 text-foreground">
              <PlatformIcon platform={row.platform} />
              {row.label}
            </div>
            <div className="flex h-5 flex-1 overflow-hidden rounded bg-surface-hover">
              {row.counts.map((segment) =>
                segment.count > 0 ? (
                  <div
                    key={segment.key}
                    className={`${segment.className} flex items-center justify-center text-xs font-medium text-white`}
                    style={{ width: `${(segment.count / widest) * 100}%` }}
                    title={`${segment.label}: ${segment.count}`}
                  >
                    {segment.count}
                  </div>
                ) : null
              )}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-4 pl-31 text-xs text-muted">
          {SEGMENTS.map((segment) => (
            <span key={segment.key} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-sm ${segment.className}`} />
              {segment.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <ItemList title="To connect" items={listedToConnect} />
        <ItemList title="To remove" items={listedToRemove} />
        <ItemList title="Not in sheet" items={listedNotInSheet} />
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Sheet issues <span className="font-normal text-muted">{issues.length}</span>
          </h3>
          {issues.length === 0 && <p className="mt-3 text-sm text-muted">Nothing here.</p>}
          <ul className="mt-2 divide-y divide-border">
            {issues.map((issue, index) => (
              <li key={index} className="flex gap-2 py-2 text-sm">
                <span className="w-14 shrink-0 text-muted tabular-nums">Row {issue.row}</span>
                <span className="min-w-0">
                  {issue.name && <span className="text-foreground">{issue.name} · </span>}
                  <span className="break-words text-warning">{issue.message}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
