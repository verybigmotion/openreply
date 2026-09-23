import { NextRequest, NextResponse } from "next/server";
import { duplicateCampaign } from "@/lib/campaigns/duplicate";
import { isOperatorUser } from "@/lib/operator";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can create campaigns" },
      { status: 403 }
    );
  }

  const automationId = request.nextUrl.searchParams.get("id");
  if (!automationId) {
    return NextResponse.json(
      { success: false, error: "Missing campaign ID" },
      { status: 400 }
    );
  }

  const targetWorkspaceId =
    request.nextUrl.searchParams.get("targetWorkspaceId") ?? context.workspaceId;
  if (
    targetWorkspaceId !== context.workspaceId &&
    !(await isOperatorUser(context.userId))
  ) {
    return NextResponse.json(
      { success: false, error: "Only operators can copy campaigns to another workspace" },
      { status: 403 }
    );
  }

  const duplicate = await duplicateCampaign({
    automationId,
    workspaceId: context.workspaceId,
    targetWorkspaceId,
  });

  if (!duplicate) {
    return NextResponse.json(
      { success: false, error: "Campaign not found or target workspace has no Instagram account" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { success: true, data: duplicate },
    { status: 201 }
  );
}
