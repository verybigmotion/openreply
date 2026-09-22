import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isOperatorUser } from "@/lib/operator";
import { openWorkspaceDiagnostics } from "@/lib/operator-actions";
import { getWorkerHealth } from "@/lib/ops/worker-health";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString().replace("T", " ").slice(0, 16) : "never";
}

function tokenState(expiresAt: Date | null, now: number) {
  if (!expiresAt) return { label: "no expiry", className: "text-muted" };
  const remainingMs = expiresAt.getTime() - now;
  if (remainingMs < 0) return { label: "expired", className: "text-error" };
  if (remainingMs < 7 * DAY_MS) return { label: `expires in ${Math.ceil(remainingMs / DAY_MS)}d`, className: "text-warning" };
  return { label: `ok until ${formatDate(expiresAt).slice(0, 10)}`, className: "text-success" };
}

async function loadOverview() {
  const now = Date.now();
  const since = new Date(now - DAY_MS);
  const [workspaces, lastWebhooks, failedDms, sentDms, unresolvedErrors, workerHealth] = await Promise.all([
    prisma.workspace.findMany({
      orderBy: { name: "asc" },
      include: {
        owner: { select: { email: true } },
        instagramAccounts: { select: { id: true, username: true, provider: true, tokenExpiresAt: true, webhookSubscribed: true } },
      },
    }),
    prisma.webhookEvent.groupBy({ by: ["workspaceId"], _max: { createdAt: true } }),
    prisma.dmLog.groupBy({ by: ["workspaceId"], where: { status: "FAILED", updatedAt: { gte: since } }, _count: { _all: true } }),
    prisma.dmLog.groupBy({ by: ["workspaceId"], where: { status: "SENT", dmSentAt: { gte: since } }, _count: { _all: true } }),
    prisma.operationalEvent.groupBy({ by: ["workspaceId"], where: { level: "ERROR", resolvedAt: null }, _count: { _all: true } }),
    getWorkerHealth().catch(() => ({ healthy: false, heartbeat: null, ageMs: null })),
  ]);

  const lastWebhookByWorkspace = new Map(lastWebhooks.map((row) => [row.workspaceId, row._max.createdAt]));
  const failedByWorkspace = new Map(failedDms.map((row) => [row.workspaceId, row._count._all]));
  const sentByWorkspace = new Map(sentDms.map((row) => [row.workspaceId, row._count._all]));
  const errorsByWorkspace = new Map(unresolvedErrors.map((row) => [row.workspaceId, row._count._all]));
  return { now, workspaces, workerHealth, lastWebhookByWorkspace, failedByWorkspace, sentByWorkspace, errorsByWorkspace };
}

export default async function OperatorPage() {
  const userId = await getCurrentUserId();
  if (!userId || !(await isOperatorUser(userId))) redirect("/dashboard");

  const { now, workspaces, workerHealth, lastWebhookByWorkspace, failedByWorkspace, sentByWorkspace, errorsByWorkspace } = await loadOverview();

  return (
    <div className="space-y-6">
      <section className="panel rounded p-4 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Worker</h2>
        <p className={`mt-2 text-sm ${workerHealth.healthy ? "text-success" : "text-error"}`}>
          {workerHealth.healthy ? "Healthy" : "Down"}
          {workerHealth.ageMs !== null && `, heartbeat ${Math.round(workerHealth.ageMs / 1000)}s ago`}
          {workerHealth.heartbeat?.hostname && ` on ${workerHealth.heartbeat.hostname}`}
        </p>
      </section>

      <section className="panel rounded p-4 sm:p-6 overflow-x-auto">
        <h2 className="text-base font-semibold text-foreground">Workspaces</h2>
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-2 pr-4 font-medium">Workspace</th>
              <th className="py-2 pr-4 font-medium">Owner</th>
              <th className="py-2 pr-4 font-medium">Instagram</th>
              <th className="py-2 pr-4 font-medium">Token</th>
              <th className="py-2 pr-4 font-medium">Last webhook</th>
              <th className="py-2 pr-4 font-medium">Sent 24h</th>
              <th className="py-2 pr-4 font-medium">Failed 24h</th>
              <th className="py-2 pr-4 font-medium">Open errors</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((workspace) => {
              const failed = failedByWorkspace.get(workspace.id) ?? 0;
              const errors = errorsByWorkspace.get(workspace.id) ?? 0;
              return (
                <tr key={workspace.id} className="border-t border-border align-top">
                  <td className="py-3 pr-4 text-foreground">{workspace.name}</td>
                  <td className="py-3 pr-4 text-muted">{workspace.owner.email ?? "—"}</td>
                  <td className="py-3 pr-4">
                    {workspace.instagramAccounts.length === 0 && <span className="text-warning">not connected</span>}
                    {workspace.instagramAccounts.map((account) => (
                      <div key={account.id} className="text-foreground">
                        @{account.username}
                        {!account.webhookSubscribed && account.provider === "META" && (
                          <span className="ml-2 text-warning">no webhook</span>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="py-3 pr-4">
                    {workspace.instagramAccounts.map((account) => {
                      const state = tokenState(account.tokenExpiresAt, now);
                      return <div key={account.id} className={state.className}>{state.label}</div>;
                    })}
                  </td>
                  <td className="py-3 pr-4 text-muted">{formatDate(lastWebhookByWorkspace.get(workspace.id))}</td>
                  <td className="py-3 pr-4 text-foreground">{sentByWorkspace.get(workspace.id) ?? 0}</td>
                  <td className={`py-3 pr-4 ${failed > 0 ? "text-error" : "text-muted"}`}>{failed}</td>
                  <td className={`py-3 pr-4 ${errors > 0 ? "text-error" : "text-muted"}`}>{errors}</td>
                  <td className="py-3">
                    <form action={openWorkspaceDiagnostics}>
                      <input type="hidden" name="workspaceId" value={workspace.id} />
                      <button type="submit" className="text-accent hover:underline">Open</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {workspaces.length === 0 && <p className="py-5 text-center text-sm text-muted">No workspaces yet.</p>}
      </section>
    </div>
  );
}
