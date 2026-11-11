import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    socialAccount: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
    },
    account: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    workspace: {
      findFirst: vi.fn(),
    },
    operationalEvent: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: vi.fn() }),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/meta/oauth", () => ({
  encryptToken: (token: string) => `encrypted:${token}`,
}));

import { getWorkspaceSocialAccount } from "../lib/instagram-accounts";
import { saveSocialAccount, saveSocialAccounts, signInWithSocialAccounts, type SocialAccountInput } from "../lib/social-login";
import {
  buildInvitationUrl,
  normalizeInvitationEmail,
} from "../lib/workspace-invitations";

const account: SocialAccountInput = {
  platform: "INSTAGRAM",
  externalId: "ig_123",
  username: "creator",
  name: null,
  accessToken: "token",
  tokenExpiresAt: null,
  webhookSubscribed: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agency workspace helpers", () => {
  it("allows reconnecting an account already owned by the workspace", async () => {
    mockPrisma.socialAccount.findUnique.mockResolvedValue({
      id: "row_1",
      workspaceId: "workspace_123",
      provider: "META",
    });

    await expect(saveSocialAccount("workspace_123", account)).resolves.toBe(true);
    expect(mockPrisma.socialAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "row_1" } })
    );
  });

  it("blocks accounts already connected to another workspace", async () => {
    mockPrisma.socialAccount.findUnique.mockResolvedValue({
      id: "row_1",
      workspaceId: "workspace_other",
      provider: "META",
    });

    await expect(saveSocialAccount("workspace_123", account)).resolves.toBe(false);
    expect(mockPrisma.socialAccount.update).not.toHaveBeenCalled();
  });

  it("allows connecting additional accounts with no plan limit", async () => {
    mockPrisma.socialAccount.findUnique.mockResolvedValue(null);

    await expect(saveSocialAccount("workspace_123", account)).resolves.toBe(true);
    expect(mockPrisma.socialAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalId: "ig_123",
        workspaceId: "workspace_123",
        provider: "META",
        accessToken: "encrypted:token",
      }),
    });
  });

  it("selects a requested workspace account or falls back to the latest account", async () => {
    mockPrisma.socialAccount.findFirst.mockResolvedValue({ id: "account_1" });

    await getWorkspaceSocialAccount("workspace_123", "account_1");
    expect(mockPrisma.socialAccount.findFirst).toHaveBeenCalledWith({
      where: { id: "account_1", workspaceId: "workspace_123" },
    });

    await getWorkspaceSocialAccount("workspace_123", "all");
    expect(mockPrisma.socialAccount.findFirst).toHaveBeenLastCalledWith({
      where: { workspaceId: "workspace_123" },
      orderBy: { connectedAt: "desc" },
    });
  });

  it("normalizes invitation emails and builds invite URLs", () => {
    expect(normalizeInvitationEmail(" Team@Agency.COM ")).toBe(
      "team@agency.com"
    );
    expect(buildInvitationUrl("token_123", "https://manychat-alternative.com/")).toBe(
      "https://manychat-alternative.com/invite/token_123"
    );
  });
});

const names = { userName: "Alex", workspaceName: "@alex" };

const identity = { provider: "instagram" as const, providerAccountId: "ig_123" };

it("brings an influencer back to their workspace after they disconnected every account", async () => {
  mockPrisma.socialAccount.findMany.mockResolvedValue([]);
  mockPrisma.account.findUnique.mockResolvedValue({ userId: "owner_1", user: { email: null } });
  mockPrisma.workspace.findFirst.mockResolvedValue({ id: "workspace_home" });
  mockPrisma.socialAccount.findUnique.mockResolvedValue(null);

  await expect(signInWithSocialAccounts(identity, names, [account])).resolves.toEqual({
    saved: 1,
    taken: 0,
    signedIn: true,
  });
  expect(mockPrisma.socialAccount.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ externalId: "ig_123", workspaceId: "workspace_home" }),
  });
  expect(mockPrisma.account.upsert).toHaveBeenCalledWith({
    where: { provider_providerAccountId: identity },
    update: { userId: "owner_1" },
    create: { ...identity, userId: "owner_1", type: "oauth" },
  });
  expect(mockPrisma.session.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "owner_1" }) });
  mockPrisma.account.findUnique.mockReset();
});

it("signs in as the owner of the workspace that holds the account", async () => {
  mockPrisma.socialAccount.findMany.mockResolvedValue([
    { workspaceId: "workspace_pages", workspace: { ownerId: "owner_1", owner: { email: "alex@example.com" } } },
  ]);
  mockPrisma.socialAccount.findUnique.mockResolvedValue({ id: "row_1", workspaceId: "workspace_pages", provider: "META" });

  await expect(signInWithSocialAccounts(identity, names, [account])).resolves.toEqual({ saved: 1, taken: 0, signedIn: true });
  expect(mockPrisma.socialAccount.update).toHaveBeenCalled();
  expect(mockPrisma.session.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "owner_1" }) });
});

it("signs in to a workspace that holds the account through Zernio without replacing it", async () => {
  mockPrisma.socialAccount.findMany.mockResolvedValue([
    { workspaceId: "workspace_pages", workspace: { ownerId: "owner_1", owner: { email: null } } },
  ]);
  mockPrisma.socialAccount.findUnique.mockResolvedValue({ id: "row_1", workspaceId: "workspace_pages", provider: "ZERNIO" });

  await expect(signInWithSocialAccounts(identity, names, [account])).resolves.toEqual({ saved: 0, taken: 1, signedIn: true });
  expect(mockPrisma.socialAccount.update).not.toHaveBeenCalled();
  expect(mockPrisma.session.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "owner_1" }) });
});

it("never signs in as an Operator through a social account", async () => {
  vi.stubEnv("OPERATOR_EMAILS", "staff@appscale.team");
  mockPrisma.socialAccount.findMany.mockResolvedValue([
    { workspaceId: "workspace_staff", workspace: { ownerId: "staff_1", owner: { email: "Staff@appscale.team" } } },
  ]);

  await expect(signInWithSocialAccounts(identity, names, [account])).resolves.toEqual({ saved: 0, taken: 1, signedIn: false });
  expect(mockPrisma.session.create).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});

it("signs in through a Page the influencer holds when another Page sits in an Operator workspace", async () => {
  vi.stubEnv("OPERATOR_EMAILS", "staff@appscale.team");
  mockPrisma.socialAccount.findMany.mockResolvedValue([
    { workspaceId: "workspace_staff", workspace: { ownerId: "staff_1", owner: { email: "staff@appscale.team" } } },
    { workspaceId: "workspace_pages", workspace: { ownerId: "owner_1", owner: { email: "alex@example.com" } } },
  ]);
  mockPrisma.socialAccount.findUnique
    .mockResolvedValueOnce({ id: "row_staff", workspaceId: "workspace_staff", provider: "META" })
    .mockResolvedValueOnce({ id: "row_1", workspaceId: "workspace_pages", provider: "META" });

  await expect(
    signInWithSocialAccounts(identity, names, [{ ...account, externalId: "page_staff" }, account])
  ).resolves.toEqual({ saved: 1, taken: 1, signedIn: true });
  expect(mockPrisma.session.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "owner_1" }) });
  vi.unstubAllEnvs();
});

it("reports Pages skipped because another workspace holds them", async () => {
  mockPrisma.socialAccount.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: "row_2", workspaceId: "workspace_other", provider: "META" });

  await expect(
    saveSocialAccounts("workspace_123", [account, { ...account, externalId: "page_2" }])
  ).resolves.toEqual({ saved: 1, taken: 1 });
});

it("does not silently replace a Zernio connection through direct Meta OAuth", async () => {
  mockPrisma.socialAccount.findUnique.mockResolvedValue({ id: "row_1", workspaceId: "workspace_123", provider: "ZERNIO" });
  await expect(saveSocialAccount("workspace_123", account)).resolves.toBe(false);
});
