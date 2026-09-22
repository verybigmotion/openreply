"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isOperatorUser, OPERATOR_WORKSPACE_COOKIE } from "@/lib/operator";

async function selectWorkspace(workspaceId: string) {
  const userId = await getCurrentUserId();
  if (!userId || !(await isOperatorUser(userId))) throw new Error("Operators only");
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
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

export async function openWorkspaceDiagnostics(formData: FormData) {
  const workspaceId = formData.get("workspaceId");
  if (typeof workspaceId !== "string") throw new Error("Unknown workspace");
  await selectWorkspace(workspaceId);
  redirect("/diagnostics");
}
