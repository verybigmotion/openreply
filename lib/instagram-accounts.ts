import { prisma } from "@/lib/db/client";

export async function getWorkspaceSocialAccount(
  workspaceId: string,
  socialAccountId?: string | null
) {
  if (socialAccountId && socialAccountId !== "all") {
    return prisma.socialAccount.findFirst({
      where: { id: socialAccountId, workspaceId },
    });
  }

  return prisma.socialAccount.findFirst({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
  });
}

