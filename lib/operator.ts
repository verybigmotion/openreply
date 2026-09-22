import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import type { Workspace } from "@/app/generated/prisma/client";

export const OPERATOR_WORKSPACE_COOKIE = "openreply-operator-workspace";

export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const operators = (process.env.OPERATOR_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return operators.includes(email.toLowerCase());
}

export const isOperatorUser = cache(async (userId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return isOperatorEmail(user?.email);
});

export const getOperatorSelectedWorkspace = cache(
  async (userId: string): Promise<Workspace | null> => {
    let selectedId: string | undefined;
    try {
      selectedId = (await cookies()).get(OPERATOR_WORKSPACE_COOKIE)?.value;
    } catch {
      return null;
    }
    if (!selectedId) return null;
    if (!(await isOperatorUser(userId))) return null;
    return prisma.workspace.findUnique({ where: { id: selectedId } });
  }
);
