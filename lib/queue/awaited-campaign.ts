import { prisma } from "@/lib/db/client";
import { sentTo } from "@/lib/queue/dm-recipient";

export async function findAwaitedCampaignId(
  externalId: string,
  userId: string
): Promise<string | null> {
  const latestDelivered = await prisma.dmLog.findFirst({
    where: { ...sentTo(userId), status: "SENT", socialAccount: { externalId } },
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
