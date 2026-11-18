import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getRequestIp, hashClickIp } from "@/lib/tracking/server";

type RedirectRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: NextRequest, { params }: RedirectRouteProps) {
  const { slug } = await params;
  const trackedLink = await prisma.trackedLink.findUnique({
    where: { slug },
    select: {
      id: true,
      workspaceId: true,
      automationId: true,
      destinationUrl: true,
      automation: {
        select: {
          socialAccountId: true,
        },
      },
    },
  });

  if (!trackedLink) {
    return new NextResponse("This link is no longer available.", { status: 404 });
  }

  const click = {
    workspaceId: trackedLink.workspaceId,
    automationId: trackedLink.automationId,
    socialAccountId: trackedLink.automation.socialAccountId,
    trackedLinkId: trackedLink.id,
    ipHash: hashClickIp(getRequestIp(request)),
    userAgent: request.headers.get("user-agent"),
    referrer: request.headers.get("referer"),
  };
  after(() =>
    prisma.linkClick.create({ data: click }).catch((error: unknown) => {
      console.error("[Tracked link] Failed to record click:", error);
    })
  );

  return NextResponse.redirect(trackedLink.destinationUrl, { status: 302 });
}
