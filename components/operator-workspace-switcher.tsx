"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOperatorWorkspace } from "@/lib/operator-actions";
import { useI18n } from "@/lib/i18n/provider";

export interface OperatorWorkspaceOption {
  id: string;
  name: string;
}

export default function OperatorWorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
}: {
  workspaces: OperatorWorkspaceOption[];
  currentWorkspaceId: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <div className="space-y-1">
      <label className="flex flex-col gap-1 text-sm text-muted">
        <span>{t("Workspace")}</span>
        <select
          value={currentWorkspaceId}
          disabled={pending}
          aria-busy={pending}
          onChange={(event) => {
            const workspaceId = event.target.value;
            setFailed(false);
            startTransition(async () => {
              try {
                await setOperatorWorkspace(workspaceId);
                router.refresh();
              } catch {
                setFailed(true);
              }
            });
          }}
          className="min-h-9 w-full rounded border border-border bg-surface px-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </label>
      {failed && (
        <p role="alert" className="text-xs text-error">
          {t("Could not switch workspace. Please try again.")}
        </p>
      )}
    </div>
  );
}
