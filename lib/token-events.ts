import { prisma } from "@/lib/db/client";

export async function resolveTokenEvents(socialAccountId: string) {
  await prisma.operationalEvent.updateMany({
    where: { source: "TOKEN_REFRESH", resolvedAt: null, payload: { path: ["socialAccountId"], equals: socialAccountId } },
    data: { resolvedAt: new Date() },
  });
}
