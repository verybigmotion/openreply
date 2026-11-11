import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MetaApiError, TokenExpiredError } from "../lib/meta/client";

const { mockPrisma, mockVerifyPageToken } = vi.hoisted(() => ({
  mockPrisma: {
    workspace: { updateMany: vi.fn() },
    socialAccount: { findMany: vi.fn(), update: vi.fn() },
    operationalEvent: { create: vi.fn(), updateMany: vi.fn() },
  },
  mockVerifyPageToken: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: (token: string) => token.replace("encrypted:", ""),
  encryptToken: (token: string) => `encrypted:${token}`,
}));
vi.mock("@/lib/meta/facebook", () => ({ verifyPageToken: mockVerifyPageToken }));

import { GET } from "../app/api/cron/refresh-tokens/route";

const page = {
  id: "row_page",
  workspaceId: "workspace_1",
  externalId: "page_1",
  username: "brand",
  name: "Brand",
  accessToken: "encrypted:page_token",
};

function runCron() {
  vi.stubEnv("CRON_SECRET", "secret");
  return GET(
    new NextRequest("https://openreply.test/api/cron/refresh-tokens", {
      headers: { authorization: "Bearer secret" },
    })
  );
}

describe("Facebook Page token check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.workspace.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.socialAccount.findMany.mockImplementation(async ({ where }) =>
      where.platform === "FACEBOOK" ? [page] : []
    );
  });

  it("reports a Page whose access was revoked", async () => {
    mockVerifyPageToken.mockRejectedValue(new TokenExpiredError("Session invalidated"));

    const body = await (await runCron()).json();

    expect(mockVerifyPageToken).toHaveBeenCalledWith("page_token", "page_1");
    expect(body.data.revokedPages).toEqual(["row_page"]);
    expect(mockPrisma.operationalEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workspaceId: "workspace_1", level: "ERROR", source: "TOKEN_REFRESH" }),
    });
  });

  it("marks the revoked Page so Settings and Operators show it", async () => {
    mockVerifyPageToken.mockRejectedValue(new TokenExpiredError("Session invalidated"));

    await runCron();

    expect(mockPrisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: "row_page" },
      data: { tokenRevokedAt: expect.any(Date) },
    });
  });

  it("reports a revoked Page only once until it is reconnected", async () => {
    mockVerifyPageToken.mockRejectedValue(new TokenExpiredError("Session invalidated"));
    mockPrisma.socialAccount.findMany.mockImplementation(async ({ where }) =>
      where.platform === "FACEBOOK" ? [{ ...page, tokenRevokedAt: new Date("2026-11-10") }] : []
    );

    await runCron();

    expect(mockPrisma.operationalEvent.create).not.toHaveBeenCalled();
  });

  it("clears the revoked mark once the Page token works again", async () => {
    mockVerifyPageToken.mockResolvedValue(undefined);
    mockPrisma.socialAccount.findMany.mockImplementation(async ({ where }) =>
      where.platform === "FACEBOOK" ? [{ ...page, tokenRevokedAt: new Date("2026-11-10") }] : []
    );

    await runCron();

    expect(mockPrisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: "row_page" },
      data: { tokenRevokedAt: null },
    });
    expect(mockPrisma.operationalEvent.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ source: "TOKEN_REFRESH", resolvedAt: null }),
      data: { resolvedAt: expect.any(Date) },
    });
  });

  it("ignores Meta outages that say nothing about the token", async () => {
    mockVerifyPageToken.mockRejectedValue(new MetaApiError(2, undefined, undefined, "Service temporarily unavailable"));

    const body = await (await runCron()).json();

    expect(body.data.revokedPages).toEqual([]);
    expect(mockPrisma.operationalEvent.create).not.toHaveBeenCalled();
  });
});
