"use client";

import { useState } from "react";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/top-bar";
import { OperatorProvider } from "@/components/operator-context";
import type { OperatorWorkspaceOption } from "@/components/operator-workspace-switcher";

interface DashboardShellProps {
  children: React.ReactNode;
  workspaceName: string;
  instagramUsername: string | null;
  instagramAccountCount: number;
  operatorWorkspaces?: OperatorWorkspaceOption[] | null;
  currentWorkspaceId?: string;
}

export default function DashboardShell({
  children,
  workspaceName,
  instagramUsername,
  instagramAccountCount,
  operatorWorkspaces,
  currentWorkspaceId,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const operator =
    operatorWorkspaces && currentWorkspaceId
      ? { workspaces: operatorWorkspaces, currentWorkspaceId }
      : null;

  return (
    <OperatorProvider value={operator}>
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        workspaceName={workspaceName}
        operatorWorkspaces={operatorWorkspaces}
        currentWorkspaceId={currentWorkspaceId}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setSidebarOpen(true)}
          instagramUsername={instagramUsername}
          instagramAccountCount={instagramAccountCount}
        />

        {/* overflow-x-hidden: enabling vertical scrolling makes the browser
            allow horizontal scrolling too, which lets a wide child drag the
            whole page sideways on a phone. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="px-4 lg:px-8 py-5 sm:py-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
    </OperatorProvider>
  );
}
