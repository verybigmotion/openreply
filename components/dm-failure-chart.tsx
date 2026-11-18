"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FAILURE_REASONS, type FailureAccount, type FailureDay } from "@/lib/dm-failure-reasons";

const SURFACE = "#f7f7f8";
const GRID_COLOR = "#e4e4e7";
const AXIS_TEXT = "#71717a";
const SENT_COLOR = "#efeff1";

function share(part: number, whole: number) {
  return whole ? (part / whole) * 100 : 0;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

function countFailed(counts: FailureDay | FailureAccount) {
  return FAILURE_REASONS.reduce((sum, r) => sum + counts[r.key], 0);
}

function FailureBreakdown({ title, counts }: { title: string; counts: FailureDay | FailureAccount }) {
  const failed = countFailed(counts);
  return (
    <div className="rounded border border-border bg-surface px-3 py-2 text-left text-xs font-normal whitespace-nowrap shadow-lg">
      <p className="text-muted">{title}</p>
      <p className="mt-1 font-semibold text-foreground">
        {formatPercent(share(failed, counts.total))} failed · {failed} of {counts.total}
      </p>
      {FAILURE_REASONS.filter((r) => counts[r.key] > 0)
        .sort((a, b) => counts[b.key] - counts[a.key])
        .map((r) => (
          <p key={r.key} className="mt-1 flex items-center gap-2 text-foreground">
            <span className="size-2 rounded-full" style={{ background: r.color }} />
            {r.label}
            <span className="ml-auto pl-4 text-muted">{counts[r.key]}</span>
          </p>
        ))}
    </div>
  );
}

function BarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: FailureDay }> }) {
  if (!active || !payload?.length) return null;
  return <FailureBreakdown title={formatDay(payload[0].payload.day)} counts={payload[0].payload} />;
}

function HoverBreakdown({ title, counts, children, className }: { title: string; counts: FailureDay | FailureAccount; children: React.ReactNode; className?: string }) {
  return (
    <div className={`group relative ${className ?? ""}`}>
      {children}
      <div className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden group-hover:block">
        <FailureBreakdown title={title} counts={counts} />
      </div>
    </div>
  );
}

type SortColumn = "username" | "rate" | "total" | "failed";

export default function DmFailureChart({ days, accounts }: { days: FailureDay[]; accounts: FailureAccount[] }) {
  const [showAccounts, setShowAccounts] = useState(false);
  const [sort, setSort] = useState<{ column: SortColumn; descending: boolean }>({ column: "failed", descending: true });
  const byAccount = accounts
    .map((a) => {
      const failed = countFailed(a);
      return { ...a, failed, rate: share(failed, a.total) };
    })
    .sort((a, b) => {
      const order = sort.column === "username" ? a.username.localeCompare(b.username) : a[sort.column] - b[sort.column];
      return sort.descending ? -order : order;
    });
  const sortBy = (column: SortColumn) =>
    setSort((current) => ({ column, descending: current.column === column ? !current.descending : column !== "username" }));
  const sortHeader = (column: SortColumn, label: string, className: string) => (
    <th className={className} aria-sort={sort.column === column ? (sort.descending ? "descending" : "ascending") : undefined}>
      <button type="button" onClick={() => sortBy(column)} className="font-medium uppercase tracking-wide hover:text-foreground">
        {label}
        {sort.column === column && (sort.descending ? " ↓" : " ↑")}
      </button>
    </th>
  );
  const peakDailyRate = Math.max(0, ...accounts.flatMap((a) => a.days.map((d) => share(countFailed(d), d.total))));
  const stripMax = Math.max(10, Math.ceil(peakDailyRate / 10) * 10);
  const total = days.reduce((sum, d) => sum + d.total, 0);
  const totals = FAILURE_REASONS.map((r) => ({ ...r, count: days.reduce((sum, d) => sum + d[r.key], 0) }));
  const failed = totals.reduce((sum, r) => sum + r.count, 0);
  const ring = [...totals, { key: "sent", color: SENT_COLOR, count: total - failed }];
  const bars = days.map((d) => ({
    ...d,
    ...Object.fromEntries(FAILURE_REASONS.map((r) => [`${r.key}_pct`, share(d[r.key], d.total)])),
  }));

  return (
    <div className="panel rounded p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">DM failures over 30 days</h2>
          <p className="mt-1 text-sm text-muted">DMs that did not go out, by reason, as a share of every DM attempted</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAccounts((v) => !v)}
          className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-hover hover:text-foreground"
        >
          {showAccounts ? "By day" : "By account"}
        </button>
      </div>

      <div className="mt-6 grid items-center gap-6 sm:grid-cols-[180px_1fr]">
        <div className="relative mx-auto size-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={ring}
                dataKey="count"
                innerRadius={64}
                outerRadius={88}
                startAngle={90}
                endAngle={-270}
                stroke={SURFACE}
                strokeWidth={2}
                isAnimationActive={false}
              >
                {ring.map((r) => (
                  <Cell key={r.key} fill={r.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-semibold text-foreground">{formatPercent(share(failed, total))}</p>
            <p className="mt-1 text-xs text-muted">of {total.toLocaleString("en")} DMs</p>
          </div>
        </div>

        <ul className="w-full space-y-2">
          {totals.map((r) => (
            <li key={r.key} className="flex items-center gap-3 text-sm">
              <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
              <span className="text-foreground">{r.label}</span>
              <span className="ml-auto tabular-nums text-foreground">{r.count.toLocaleString("en")}</span>
              <span className="w-14 text-right tabular-nums text-muted">{formatPercent(share(r.count, total))}</span>
            </li>
          ))}
        </ul>
      </div>

      {showAccounts ? (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-zinc-500">
              {sortHeader("username", "Creator", "py-2 pr-4")}
              {sortHeader("rate", "Failure rate", "px-3 py-2 text-right")}
              {sortHeader("total", "DMs", "px-3 py-2 text-right")}
              {sortHeader("failed", "Failed", "px-3 py-2 text-right")}
              <th className="py-2 pl-6 font-medium">Failure rate by day, 0–{stripMax}%</th>
            </tr>
          </thead>
          <tbody>
            {byAccount.map((a) => (
              <tr key={a.username} className="border-b border-border last:border-0">
                <td className="py-2 pr-4 text-foreground">@{a.username}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                  <HoverBreakdown title={`@${a.username}, last 30 days`} counts={a}>
                    {formatPercent(share(a.failed, a.total))}
                  </HoverBreakdown>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{a.total.toLocaleString("en")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{a.failed.toLocaleString("en")}</td>
                <td className="w-1/2 py-2 pl-6">
                  <div className="flex h-12 items-end gap-0.5">
                    {a.days.map((d) => (
                      <HoverBreakdown key={d.day} title={`@${a.username}, ${formatDay(d.day)}`} counts={d} className="flex h-full flex-1 items-end">
                        <div
                          className={`w-full rounded-sm ${d.total === 0 ? "bg-border" : countFailed(d) === 0 ? "bg-zinc-300" : "bg-accent"}`}
                          style={{ height: d.total === 0 ? 1 : `${Math.max(share(share(countFailed(d), d.total), stripMax), 6)}%` }}
                        />
                      </HoverBreakdown>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="mt-6 h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_COLOR} strokeDasharray="3 3" />
              <XAxis
                dataKey="day"
                tickFormatter={formatDay}
                tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                stroke={GRID_COLOR}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                stroke={GRID_COLOR}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: GRID_COLOR, fillOpacity: 0.4 }} />
              {FAILURE_REASONS.map((r) => (
                <Bar
                  key={r.key}
                  dataKey={`${r.key}_pct`}
                  stackId="failures"
                  fill={r.color}
                  stroke={SURFACE}
                  strokeWidth={1}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

      )}
    </div>
  );
}
