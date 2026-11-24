"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isOperatorUser, OPERATOR_WORKSPACE_COOKIE, VISIBLE_WORKSPACE } from "@/lib/operator";

async function selectWorkspace(workspaceId: string) {
  const userId = await getCurrentUserId();
  if (!userId || !(await isOperatorUser(userId))) throw new Error("Operators only");
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, ...VISIBLE_WORKSPACE }, select: { id: true } });
  if (!workspace) throw new Error("Unknown workspace");
  const cookieStore = await cookies();
  cookieStore.set(OPERATOR_WORKSPACE_COOKIE, workspaceId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function setOperatorWorkspace(workspaceId: string) {
  await selectWorkspace(workspaceId);
}

async function operatorAccountIds(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!userId || !(await isOperatorUser(userId))) throw new Error("Operators only");
  return formData.getAll("socialAccountId").filter((id): id is string => typeof id === "string");
}

export async function archiveSocialAccounts(formData: FormData) {
  const ids = await operatorAccountIds(formData);
  await prisma.$transaction([
    prisma.socialAccount.updateMany({ where: { id: { in: ids }, archivedAt: null }, data: { archivedAt: new Date() } }),
    prisma.automation.updateMany({ where: { socialAccountId: { in: ids } }, data: { isActive: false } }),
  ]);
  revalidatePath("/operator/analytics");
}

export async function unarchiveSocialAccounts(formData: FormData) {
  const ids = await operatorAccountIds(formData);
  await prisma.socialAccount.updateMany({ where: { id: { in: ids } }, data: { archivedAt: null } });
  revalidatePath("/operator/analytics");
}

export async function openWorkspaceDiagnostics(formData: FormData) {
  const workspaceId = formData.get("workspaceId");
  if (typeof workspaceId !== "string") throw new Error("Unknown workspace");
  await selectWorkspace(workspaceId);
  redirect("/diagnostics");
}
