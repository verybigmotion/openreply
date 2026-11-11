import { I18nProvider } from "@/lib/i18n/provider";
import { getI18n } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { socialAccountLabel } from "@/lib/social-account-label";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ensureWorkspaceForUser } from "@/lib/workspace";
import { isOperatorUser } from "@/lib/operator";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("OpenReply - Open source Instagram and Facebook comment-to-DM automation") };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = await getI18n();
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const workspace = await ensureWorkspaceForUser(
    session.user.id,
    session.user.email
  );
  const [accounts, operatorWorkspaces] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { connectedAt: "desc" },
      select: { username: true, name: true, platform: true },
    }),
    (await isOperatorUser(session.user.id))
      ? prisma.workspace.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : null,
  ]);

  return (
    <I18nProvider locale={locale}>
      <DashboardShell
        workspaceName={workspace.name}
        primaryAccountLabel={accounts[0] ? socialAccountLabel(accounts[0]) : null}
        accountCount={accounts.length}
        operatorWorkspaces={operatorWorkspaces}
        currentWorkspaceId={workspace.id}
      >
        {children}
      </DashboardShell>
    </I18nProvider>
  );
}
