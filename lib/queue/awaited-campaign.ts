import { prisma } from "@/lib/db/client";

export async function findAwaitedCampaignId(
  instagramId: string,
  userId: string
): Promise<string | null> {
  const latestDelivered = await prisma.dmLog.findFirst({
    where: { commenterId: userId, status: "SENT", instagramAccount: { instagramId } },
    orderBy: { dmSentAt: "desc" },
    select: {
      automationId: true,
      commentId: true,
      automation: { select: { openingDmEnabled: true } },
    },
  });
  const isOpeningDm =
    latestDelivered?.automation.openingDmEnabled &&
    !/^(reveal|dm):/.test(latestDelivered.commentId);
  return isOpeningDm ? latestDelivered.automationId : null;
}
