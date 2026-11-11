import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindFirst } = vi.hoisted(() => ({ mockFindFirst: vi.fn() }));

vi.mock("@/lib/db/client", () => ({
  prisma: { dmLog: { findFirst: mockFindFirst } },
}));

import { findAwaitedCampaignId } from "@/lib/queue/awaited-campaign";

function latestDelivered(commentId: string, openingDmEnabled = true) {
  return { automationId: "auto_1", commentId, automation: { openingDmEnabled } };
}

describe("findAwaitedCampaignId", () => {
  beforeEach(() => mockFindFirst.mockReset());

  it("looks only at the newest delivered DM to that person on that account", async () => {
    mockFindFirst.mockResolvedValue(null);
    await findAwaitedCampaignId("ig_1", "user_1");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ commenterId: "user_1" }, { recipientId: "user_1" }], status: "SENT", socialAccount: { externalId: "ig_1" } },
        orderBy: { dmSentAt: "desc" },
      })
    );
  });

  it("returns the campaign when its opening DM is the newest delivery", async () => {
    mockFindFirst.mockResolvedValue(latestDelivered("17953437384296756"));
    expect(await findAwaitedCampaignId("ig_1", "user_1")).toBe("auto_1");
  });

  it("returns null once a reveal went out after the opening DM", async () => {
    mockFindFirst.mockResolvedValue(latestDelivered("reveal:user_1"));
    expect(await findAwaitedCampaignId("ig_1", "user_1")).toBeNull();
  });

  it("returns null when the newest delivery answered a DM keyword", async () => {
    mockFindFirst.mockResolvedValue(latestDelivered("dm:mid_1"));
    expect(await findAwaitedCampaignId("ig_1", "user_1")).toBeNull();
  });

  it("returns null when the newest delivery was a direct link without an opening DM", async () => {
    mockFindFirst.mockResolvedValue(latestDelivered("17953437384296756", false));
    expect(await findAwaitedCampaignId("ig_1", "user_1")).toBeNull();
  });

  it("returns null when nothing was delivered", async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await findAwaitedCampaignId("ig_1", "user_1")).toBeNull();
  });
});
