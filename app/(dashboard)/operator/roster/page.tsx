import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isOperatorUser } from "@/lib/operator";
import { matchRoster, parseRoster, type ConnectionState } from "@/lib/roster";

const STATE_CLASS: Record<ConnectionState, string> = {
  connected: "text-success",
  expired: "text-error",
  revoked: "text-error",
  "not connected": "text-warning",
  "check manually": "text-muted",
};

function State({ state }: { state: ConnectionState | null }) {
  return state ? <span className={STATE_CLASS[state]}>{state}</span> : <span className="text-muted">—</span>;
}

export default async function RosterPage() {
  const userId = await getCurrentUserId();
  if (!userId || !(await isOperatorUser(userId))) redirect("/dashboard");

  const csvUrl = process.env.ROSTER_CSV_URL;
  if (!csvUrl) {
    return <p className="panel rounded p-4 text-sm text-muted">Set ROSTER_CSV_URL to the sheet&apos;s CSV export link.</p>;
  }

  const [response, accounts] = await Promise.all([
    fetch(csvUrl),
    prisma.socialAccount.findMany({ select: { workspaceId: true, platform: true, username: true, tokenRevokedAt: true, tokenExpiresAt: true } }),
  ]);
  if (!response.ok) {
    return <p className="panel rounded p-4 text-sm text-error">Sheet returned HTTP {response.status}.</p>;
  }
  const rows = matchRoster(parseRoster(await response.text()), accounts);
  const instagramCounts = (["connected", "not connected", "expired", "revoked"] as const)
    .map((state) => `${rows.filter((row) => row.instagramState === state).length} ${state}`)
    .join(", ");

  return (
    <section className="panel rounded p-4 sm:p-6 overflow-x-auto">
      <h2 className="text-base font-semibold text-foreground">Roster</h2>
      <p className="mt-1 text-sm text-muted">{rows.length} influencers in the sheet. Instagram: {instagramCounts}.</p>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Instagram</th>
            <th className="py-2 pr-4 font-medium">Sheet</th>
            <th className="py-2 pr-4 font-medium">OpenReply</th>
            <th className="py-2 pr-4 font-medium">Facebook</th>
            <th className="py-2 pr-4 font-medium">Sheet</th>
            <th className="py-2 font-medium">OpenReply</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border align-top">
              <td className="py-3 pr-4 text-foreground">{row.name}</td>
              <td className="py-3 pr-4 text-foreground">{row.instagram ? `@${row.instagram}` : "—"}</td>
              <td className="py-3 pr-4 text-muted">{row.instagramStatus || "—"}</td>
              <td className="py-3 pr-4"><State state={row.instagramState} /></td>
              <td className="py-3 pr-4">
                {row.facebookUrl ? <a href={row.facebookUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">profile</a> : "—"}
              </td>
              <td className="py-3 pr-4 text-muted">{row.facebookStatus || "—"}</td>
              <td className="py-3"><State state={row.facebookState} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
