import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, afterResponse } = vi.hoisted(() => ({
  mockPrisma: {
    trackedLink: {
      findUnique: vi.fn(),
    },
    linkClick: {
      create: vi.fn(),
    },
  },
  afterResponse: [] as Array<() => unknown>,
}));

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    afterResponse.push(task);
  },
}));

import { GET } from "../app/r/[slug]/route";

async function runAfterResponse() {
  await Promise.all(afterResponse.splice(0).map((task) => task()));
}

beforeEach(() => {
  vi.clearAllMocks();
  afterResponse.length = 0;
});

describe("tracked link redirect route", () => {
  it("logs a workspace-isolated click and redirects to the destination", async () => {
    mockPrisma.trackedLink.findUnique.mockResolvedValue({
      id: "link_123",
      workspaceId: "workspace_123",
      automationId: "automation_123",
      destinationUrl: "https://example.com/offer",
      automation: {
        socialAccountId: "instagram_account_123",
      },
    });
    mockPrisma.linkClick.create.mockResolvedValue({});

    const response = await GET(
      new Request("https://manychat-alternative.com/r/abc123", {
        headers: {
          "user-agent": "vitest",
          referer: "https://instagram.com/",
          "x-forwarded-for": "203.0.113.10",
        },
      }) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ slug: "abc123" }) }
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/offer");
    expect(mockPrisma.trackedLink.findUnique).toHaveBeenCalledWith({
      where: { slug: "abc123" },
      select: expect.any(Object),
    });
    expect(mockPrisma.linkClick.create).not.toHaveBeenCalled();
    await runAfterResponse();
    expect(mockPrisma.linkClick.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace_123",
        automationId: "automation_123",
        socialAccountId: "instagram_account_123",
        trackedLinkId: "link_123",
        userAgent: "vitest",
        referrer: "https://instagram.com/",
      }),
    });
  });

  it("answers 404 for an unknown link without logging a click", async () => {
    mockPrisma.trackedLink.findUnique.mockResolvedValue(null);

    const response = await GET(
      new Request("https://manychat-alternative.com/r/missing") as Parameters<
        typeof GET
      >[0],
      { params: Promise.resolve({ slug: "missing" }) }
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    await runAfterResponse();
    expect(mockPrisma.linkClick.create).not.toHaveBeenCalled();
  });

  it("redirects even when recording the click fails", async () => {
    mockPrisma.trackedLink.findUnique.mockResolvedValue({
      id: "link_123",
      workspaceId: "workspace_123",
      automationId: "automation_123",
      destinationUrl: "https://example.com/offer",
      automation: { socialAccountId: "instagram_account_123" },
    });
    mockPrisma.linkClick.create.mockRejectedValue(new Error("database down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(
      new Request("https://manychat-alternative.com/r/abc123") as Parameters<typeof GET>[0],
      { params: Promise.resolve({ slug: "abc123" }) }
    );

    expect(response.headers.get("location")).toBe("https://example.com/offer");
    await expect(runAfterResponse()).resolves.toBeUndefined();
  });
});
