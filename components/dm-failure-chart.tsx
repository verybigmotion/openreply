"use client";

import { useEffect, useRef, useState } from "react";
import { FAILURE_REASONS, type FailureAccount, type FailureDay, type FailureReason } from "@/lib/dm-failure-reasons";

const SURFACE = "#f7f7f8";
const GRID_COLOR = "#e4e4e7";
const SENT_COLOR = "#efeff1";
const MORPH_MS = 500;
const MORPH_TRANSITION = `${MORPH_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
const OTHERS = "others";
const OTHERS_COLOR = FAILURE_REASONS.find((r) => r.key === "plan_limit")!.color;
const CREATOR_COLORS = FAILURE_REASONS.map((r) => r.color).filter((c) => c !== OTHERS_COLOR);
const RING_SIZE = 180;
const RING_RADIUS = 76;
const RING_WIDTH = 24;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const Y_TICKS = [0, 25, 50, 75, 100];

type Series = { key: string; label: string; color: string };
type Point = { day: string; total: number; values: Record<string, number> };
type Segment = { key: string; color: string; value: number; reason: FailureReason | null; joined: boolean };

function share(part: number, whole: number) {
  return whole ? (part / whole) * 100 : 0;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatCount(value: number) {
  return Math.round(value).toLocaleString("en");
}

function AnimatedNumber({ value, format }: { value: number; format: (value: number) => string }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const origin = current.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = reduced ? 1 : Math.min((now - start) / MORPH_MS, 1);
      current.current = origin + (value - origin) * (1 - (1 - progress) ** 3);
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return format(shown);
}

function sumValues(point: Point) {
  return Object.values(point.values).reduce((sum, n) => sum + n, 0);
}

function reasonPoint(day: string, counts: FailureDay | FailureAccount, excluded: string[]): Point {
  const kept = FAILURE_REASONS.filter((r) => !excluded.includes(r.key));
  const removed = FAILURE_REASONS.filter((r) => excluded.includes(r.key)).reduce((sum, r) => sum + counts[r.key], 0);
  return { day, total: counts.total - removed, values: Object.fromEntries(kept.map((r) => [r.key, counts[r.key]])) };
}

function creatorView(accounts: FailureAccount[], reason: FailureReason, excludedReasons: string[], excludedCreators: string[], dayKeys: string[]) {
  const ranked = accounts.filter((a) => a[reason] > 0).sort((a, b) => b[reason] - a[reason]);
  const top = ranked.slice(0, CREATOR_COLORS.length).sort((a, b) => b.last24h[reason] - a.last24h[reason]);
  const rest = ranked.slice(top.length);
  const series: Series[] = [
    ...top.map((a, i) => ({ key: a.username, label: `@${a.username}`, color: CREATOR_COLORS[i] })),
    ...(rest.length ? [{ key: OTHERS, label: `${rest.length} other creators`, color: OTHERS_COLOR }] : []),
  ];
  const groupOf = (a: FailureAccount) => (top.includes(a) ? a.username : rest.includes(a) ? OTHERS : null);
  const point = (day: string, pick: (a: FailureAccount) => FailureDay): Point => {
    const values = Object.fromEntries(series.filter((s) => !excludedCreators.includes(s.key)).map((s) => [s.key, 0]));
    let total = 0;
    for (const a of accounts) {
      const group = groupOf(a);
      if (group && excludedCreators.includes(group)) continue;
      const counts = pick(a);
      total += reasonPoint(day, counts, excludedReasons).total;
      if (group && group in values) values[group] += counts[reason];
    }
    return { day, total, values };
  };
  return { series, recent: point("last24h", (a) => a.last24h), days: dayKeys.map((day, i) => point(day, (a) => a.days[i])) };
}

function Breakdown({ title, point, series }: { title: string; point: Point; series: readonly Series[] }) {
  const failed = sumValues(point);
  return (
    <div className="rounded border border-border bg-surface px-3 py-2 text-left text-xs font-normal whitespace-nowrap shadow-lg">
      <p className="text-muted">{title}</p>
      <p className="mt-1 font-semibold text-foreground">
        {formatPercent(share(failed, point.total))} failed · {failed} of {point.total}
      </p>
      {series
        .filter((s) => point.values[s.key] > 0)
        .sort((a, b) => point.values[b.key] - point.values[a.key])
        .map((s) => (
          <p key={s.key} className="mt-1 flex items-center gap-2 text-foreground">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
            <span className="ml-auto pl-4 text-muted">{point.values[s.key]}</span>
          </p>
        ))}
    </div>
  );
}

function HoverBreakdown({ title, point, children, className }: { title: string; point: Point; children: React.ReactNode; className?: string }) {
  return (
    <div className={`group relative ${className ?? ""}`}>
      {children}
      <div className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden group-hover:block">
        <Breakdown title={title} point={point} series={FAILURE_REASONS} />
      </div>
    </div>
  );
}

type SortColumn = "username" | "rate" | "total" | "failed";

export default function DmFailureChart(props: { days: FailureDay[]; accounts: FailureAccount[]; last24h: FailureDay }) {
  const [showAccounts, setShowAccounts] = useState(false);
  const [reason, setReason] = useState<FailureReason | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [excludedReasons, setExcludedReasons] = useState<string[]>([]);
  const [excludedCreators, setExcludedCreators] = useState<string[]>([]);
  const [sort, setSort] = useState<{ column: SortColumn; descending: boolean }>({ column: "failed", descending: true });

  const dayKeys = props.days.map((d) => d.day);
  const reasonRecent = reasonPoint("last24h", props.last24h, excludedReasons);
  const reasonDays = props.days.map((d) => reasonPoint(d.day, d, excludedReasons));
  const creators = reason ? creatorView(props.accounts, reason, excludedReasons, excludedCreators, dayKeys) : null;
  const allCreators = reason ? creatorView(props.accounts, reason, excludedReasons, [], dayKeys) : null;
  const drilled = expanded && creators ? creators : null;
  const reasonInfo = FAILURE_REASONS.find((r) => r.key === reason);
  const reasons = [...FAILURE_REASONS].sort((a, b) => props.last24h[b.key] - props.last24h[a.key]);

  const segmentsFor = (reasonPart: Point, creatorPart: Point | null): Segment[] => [
    ...reasons.flatMap((r): Segment[] =>
      r.key === reason && creators && creatorPart
        ? creators.series.map((s, i) => ({
            key: `creator:${s.key}`,
            color: expanded ? s.color : r.color,
            value: excludedReasons.includes(r.key) ? 0 : (creatorPart.values[s.key] ?? 0),
            reason: r.key,
            joined: !expanded && i < creators.series.length - 1,
          }))
        : [{ key: r.key, color: r.color, value: expanded ? 0 : (reasonPart.values[r.key] ?? 0), reason: r.key, joined: false }]
    ),
    { key: "rest", color: SENT_COLOR, value: expanded ? 0 : reasonPart.total - sumValues(reasonPart), reason: null, joined: false },
  ];

  const ringSegments = segmentsFor(reasonRecent, creators?.recent ?? null);
  const ringTotal = ringSegments.reduce((sum, s) => sum + s.value, 0);
  let ringOffset = 0;
  const ringArcs = ringSegments.map((s) => {
    const length = ringTotal ? (s.value / ringTotal) * RING_LENGTH : 0;
    const arc = { ...s, length, offset: ringOffset };
    ringOffset += length;
    return arc;
  });

  const legendSeries: readonly Series[] = drilled ? drilled.series : reasons;
  const legendRecent = drilled ? drilled.recent : reasonRecent;
  const legendUnfiltered = drilled && allCreators ? allCreators.recent : reasonPoint("last24h", props.last24h, []);
  const legendExcluded = drilled ? excludedCreators : excludedReasons;
  const failed = sumValues(legendRecent);
  const legendTotal = drilled ? failed : legendRecent.total;

  const byAccount = props.accounts
    .map((a) => {
      const point = reasonPoint("", a, excludedReasons);
      const accountFailed = sumValues(point);
      return { ...a, point, failed: accountFailed, total: point.total, rate: share(accountFailed, point.total), dayPoints: a.days.map((d) => reasonPoint(d.day, d, excludedReasons)) };
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
  const peakDailyRate = Math.max(0, ...byAccount.flatMap((a) => a.dayPoints.map((d) => share(sumValues(d), d.total))));
  const stripMax = Math.max(10, Math.ceil(peakDailyRate / 10) * 10);

  const drillInto = (key: FailureReason | null) => {
    if (!key || expanded) return;
    setReason(key);
    setExcludedCreators([]);
    setShowAccounts(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
  };
  const goBack = () => setExpanded(false);
  const toggle = (key: string) => {
    const flip = (current: string[]) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]);
    if (drilled) setExcludedCreators(flip);
    else setExcludedReasons(flip);
  };

  return (
    <div className="panel rounded p-4 sm:p-6">
      <button
        type="button"
        onClick={goBack}
        className={`mb-3 block h-5 text-sm font-medium text-muted transition-[opacity,translate,color] duration-300 ease-out hover:text-foreground ${expanded ? "" : "pointer-events-none -translate-x-2 opacity-0"}`}
      >
        ← Back
      </button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            DM failures
            {drilled && reasonInfo && (
              <span className="flex items-center gap-2 transition-[opacity,translate] duration-300 ease-out starting:-translate-x-1 starting:opacity-0">
                <span className="text-muted">·</span>
                <span className="size-2 rounded-full" style={{ background: reasonInfo.color }} />
                {reasonInfo.label} by creator
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-muted">DMs that did not go out, by reason, as a share of every DM attempted: last 24 hours above, last 30 days below</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAccounts((v) => !v)}
          className={`rounded border border-border px-3 py-1.5 text-xs font-medium text-muted transition-[opacity,translate,color,border-color] duration-300 ease-out hover:border-border-hover hover:text-foreground ${expanded ? "pointer-events-none translate-x-2 opacity-0" : ""}`}
        >
          <span key={String(showAccounts)} className="block transition-opacity duration-300 ease-out starting:opacity-0">
            {showAccounts ? "By day" : "By account"}
          </span>
        </button>
      </div>

      <div className="mt-6 grid items-center gap-6 sm:grid-cols-[180px_1fr]">
        <div className="relative mx-auto" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="size-full -rotate-90">
            {ringArcs.map((arc) => (
              <circle
                key={arc.key}
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={RING_WIDTH}
                strokeDasharray={`${Math.max(arc.length - (arc.length > 2 && !arc.joined ? 2 : 0), 0)} ${RING_LENGTH}`}
                strokeDashoffset={-arc.offset}
                onClick={() => drillInto(arc.reason)}
                className={!expanded && arc.reason ? "cursor-pointer" : undefined}
                style={{ transition: `stroke-dasharray ${MORPH_TRANSITION}, stroke-dashoffset ${MORPH_TRANSITION}, stroke ${MORPH_TRANSITION}` }}
              />
            ))}
          </svg>
          <div
            key={drilled ? "drilled" : "all"}
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center transition-[opacity,scale] duration-300 ease-out starting:scale-95 starting:opacity-0"
          >
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {drilled ? <AnimatedNumber key="count" value={failed} format={formatCount} /> : <AnimatedNumber key="rate" value={share(failed, legendTotal)} format={formatPercent} />}
            </p>
            <p className="mt-1 text-xs text-muted">
              {drilled && reasonInfo ? (
                `${reasonInfo.label} in 24h`
              ) : (
                <>
                  of <AnimatedNumber value={legendTotal} format={formatCount} /> DMs in 24h
                </>
              )}
            </p>
          </div>
        </div>

        <ul className="min-h-[188px] w-full space-y-2">
          {legendSeries.map((s, index) => {
            const off = legendExcluded.includes(s.key);
            const count = (off ? legendUnfiltered : legendRecent).values[s.key] ?? 0;
            return (
              <li
                key={s.key}
                className="transition-[opacity,translate] duration-300 ease-out starting:translate-x-2 starting:opacity-0"
                style={{ transitionDelay: `${index * 30}ms` }}
              >
                <button
                  type="button"
                  aria-pressed={!off}
                  onClick={() => toggle(s.key)}
                  className={`flex w-full items-center gap-3 text-sm transition-opacity hover:opacity-70 ${off ? "opacity-40" : ""}`}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className={`text-foreground ${off ? "line-through" : ""}`}>{s.label}</span>
                  <span className="ml-auto tabular-nums text-foreground">
                    <AnimatedNumber value={count} format={formatCount} />
                  </span>
                  <span className="w-14 text-right tabular-nums text-muted">
                    {off ? "—" : <AnimatedNumber value={share(count, legendTotal)} format={formatPercent} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {showAccounts && !expanded ? (
        <table className="mt-6 w-full text-sm transition-[opacity,translate] duration-300 ease-out starting:translate-y-1 starting:opacity-0">
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
                  <HoverBreakdown title={`@${a.username}, last 30 days`} point={a.point}>
                    {formatPercent(a.rate)}
                  </HoverBreakdown>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{a.total.toLocaleString("en")}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{a.failed.toLocaleString("en")}</td>
                <td className="w-1/2 py-2 pl-6">
                  <div className="flex h-12 items-end gap-0.5">
                    {a.dayPoints.map((d) => (
                      <HoverBreakdown key={d.day} title={`@${a.username}, ${formatDay(d.day)}`} point={d} className="flex h-full flex-1 items-end">
                        <div
                          className={`w-full rounded-sm ${d.total === 0 ? "bg-border" : sumValues(d) === 0 ? "bg-zinc-300" : "bg-accent"}`}
                          style={{ height: d.total === 0 ? 1 : `${Math.max(share(share(sumValues(d), d.total), stripMax), 6)}%` }}
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
        <div className="mt-6 flex h-56 flex-col transition-[opacity,translate] duration-300 ease-out starting:translate-y-1 starting:opacity-0 sm:h-64">
          <div className="flex min-h-0 flex-1">
            <div className="relative w-11 shrink-0 text-xs text-[#71717a]">
              {Y_TICKS.map((tick) => (
                <span key={tick} className="absolute right-2 translate-y-1/2" style={{ bottom: `${tick}%` }}>
                  {tick}%
                </span>
              ))}
            </div>
            <div className="relative flex-1 border-b border-l" style={{ borderColor: GRID_COLOR }}>
              {Y_TICKS.slice(1).map((tick) => (
                <div key={tick} className="absolute inset-x-0 border-t border-dashed" style={{ bottom: `${tick}%`, borderColor: GRID_COLOR }} />
              ))}
              <div className="absolute inset-0 flex gap-[4px] px-1">
                {reasonDays.map((reasonDay, index) => {
                  const creatorDay = creators?.days[index] ?? null;
                  const denominator = expanded && creatorDay ? creatorDay.total : reasonDay.total;
                  const today = index === reasonDays.length - 1;
                  const hovered = drilled ? drilled.days[index] : reasonDay;
                  return (
                    <div key={reasonDay.day} className="group relative flex h-full flex-1 flex-col justify-end hover:bg-[#e4e4e7]/40">
                      {segmentsFor(reasonDay, creatorDay)
                        .filter((s) => s.reason)
                        .map((s, i, list) => {
                          const top = list[i - 1]?.joined ? "transparent" : today ? s.color : SURFACE;
                          const bottom = s.joined || !today ? "transparent" : s.color;
                          const side = today ? s.color : "transparent";
                          return (
                          <div
                            key={s.key}
                            style={{
                              height: `${share(s.value, denominator)}%`,
                              background: today ? `${s.color}59` : s.color,
                              boxShadow: `inset 0 1px 0 ${top}, inset 0 -1px 0 ${bottom}, inset 1px 0 0 ${side}, inset -1px 0 0 ${side}`,
                              transition: `height ${MORPH_TRANSITION}, background-color ${MORPH_TRANSITION}, box-shadow ${MORPH_TRANSITION}`,
                            }}
                          />
                          );
                        })}
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 group-hover:block">
                        <Breakdown title={formatDay(reasonDay.day)} point={hovered} series={legendSeries} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="ml-11 flex h-6 gap-[4px] px-1 text-xs text-[#71717a]">
            {reasonDays.map((d, index) => (
              <div key={d.day} className="relative flex-1">
                {(reasonDays.length - 1 - index) % 2 === 0 && (
                  <span className="absolute left-1/2 top-1.5 -translate-x-1/2 whitespace-nowrap">{formatDay(d.day)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
