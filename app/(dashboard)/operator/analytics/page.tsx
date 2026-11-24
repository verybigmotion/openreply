import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isOperatorUser } from "@/lib/operator";
import DmFailureChart from "@/components/dm-failure-chart";
import OperatorRoster from "@/components/operator-roster";
import { FAILURE_REASONS, type FailureAccount, type FailureDay, type FailureReason } from "@/lib/dm-failure-reasons";

const DAYS = 30;

function emptyCounts() {
  return Object.fromEntries(FAILURE_REASONS.map((r) => [r.key, 0])) as Record<FailureReason, number>;
}

async function loadFailures(): Promise<{ days: FailureDay[]; accounts: FailureAccount[]; last24h: FailureDay }> {
  const rows = await prisma.$queryRaw<Array<{ day: string; account: string; recent: boolean; reason: FailureReason | "sent"; n: number }>>`
    SELECT to_char(date_trunc('day', d."createdAt"), 'YYYY-MM-DD') AS day, s.username AS account,
      d."createdAt" >= now() - interval '24 hours' AS recent,
      CASE
        WHEN status = 'SENT' THEN 'sent'
        WHEN status = 'SKIPPED_PLAN_LIMIT' THEN 'plan_limit'
        WHEN "errorMessage" LIKE '%Error 368:%' THEN 'account_blocked'
        WHEN status = 'SKIPPED_RATE_LIMIT' OR "errorMessage" LIKE '%Error 613:%' OR "errorMessage" LIKE 'RateLimitError%' THEN 'rate_limited'
        WHEN "errorMessage" LIKE '%invalid for a private reply%' OR "errorMessage" LIKE '%already has a reply%' THEN 'refused'
        WHEN "errorMessage" LIKE '%user cannot be found%' OR "errorMessage" LIKE '%archived or deleted%'
          OR "errorMessage" LIKE '%disabled access to Instagram Direct%' OR "errorMessage" LIKE '%outside of allowed window%' THEN 'recipient_unavailable'
        WHEN "errorMessage" LIKE 'TokenExpiredError%' OR "errorMessage" ILIKE '%access token%' THEN 'token'
        ELSE 'other'
      END AS reason,
      count(*)::int AS n
    FROM "DmLog" d JOIN "SocialAccount" s ON s.id = d."socialAccountId"
    WHERE d."createdAt" >= date_trunc('day', now()) - make_interval(days => ${DAYS - 1})
      AND d.status IN ('SENT', 'FAILED', 'SKIPPED_RATE_LIMIT', 'SKIPPED_PLAN_LIMIT')
    GROUP BY 1, 2, 3, 4`;

  const today = new Date();
  const dayKeys = Array.from({ length: DAYS }, (_, i) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (DAYS - 1 - i))).toISOString().slice(0, 10)
  );
  const emptyDays = (): FailureDay[] => dayKeys.map((day) => ({ day, total: 0, ...emptyCounts() }));
  const days = emptyDays();
  const emptyLast24h = (): FailureDay => ({ day: "last24h", total: 0, ...emptyCounts() });
  const last24h = emptyLast24h();
  const byAccount = new Map<string, FailureAccount>();
  for (const row of rows) {
    const index = dayKeys.indexOf(row.day);
    if (index === -1) continue;
    const account = byAccount.get(row.account) ?? { username: row.account, total: 0, days: emptyDays(), last24h: emptyLast24h(), ...emptyCounts() };
    byAccount.set(row.account, account);
    for (const target of [days[index], account.days[index], account, ...(row.recent ? [last24h, account.last24h] : [])]) {
      target.total += row.n;
      if (row.reason !== "sent") target[row.reason] += row.n;
    }
  }
  return { days, accounts: [...byAccount.values()], last24h };
}

export default async function OperatorAnalyticsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId || !(await isOperatorUser(userId))) redirect("/dashboard");
  const { archived } = await searchParams;

  return (
    <div className="space-y-6">
      <DmFailureChart {...await loadFailures()} />
      <OperatorRoster showArchived={archived === "1"} />
    </div>
  );
}
