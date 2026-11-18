import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockQueueAdd } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn(),
    automation: { findMany: vi.fn() },
    dmLog: { findMany: vi.fn() },
    operationalEvent: { create: vi.fn() },
  },
  mockQueueAdd: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/queue/client", () => ({ getDMQueue: () => ({ add: mockQueueAdd }) }));
vi.mock("@/lib/instagram/provider", () => ({
  MetaApiError: class extends Error {},
  createSocialAccountContext: vi.fn().mockResolvedValue({ provider: "META" }),
  getUserMedia: vi.fn(),
  getRecentMediaComments: vi.fn().mockResolvedValue([
    { id: "c_1", text: "LINK", timestamp: "2026-11-18T10:00:00Z", from: { id: "u1" } },
  ]),
}));

import { reconcileComments } from "../lib/polling/comment-reconciler";
import { permanentDMFailure } from "../lib/queue/permanent-dm-failure";

describe("comment sweep and DMs Instagram refused for good", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.operationalEvent.create.mockResolvedValue({});
    mockPrisma.dmLog.findMany.mockResolvedValue([]);
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        id: "auto_1",
        name: "campaign",
        postId: "post_1",
        matchAnyPost: false,
        matchAnyWord: true,
        keywords: [],
        wholeWordMatch: false,
        publicReplyEnabled: false,
        workspaceId: "ws_1",
        socialAccount: {
          id: "acc_1",
          externalId: "ig_1",
          username: "owner",
          accessToken: "token",
          provider: "META",
          platform: "INSTAGRAM",
          workspaceId: "ws_1",
          zernioAccountId: null,
        },
      },
    ]);
  });

  it("counts a permanently refused DM as handled so the comment is not queued again", async () => {
    await reconcileComments();

    const where = mockPrisma.dmLog.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toContainEqual(permanentDMFailure);
  });
});
