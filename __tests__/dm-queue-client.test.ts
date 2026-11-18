import { describe, expect, it, vi } from "vitest";

const { queuesCreated } = vi.hoisted(() => ({ queuesCreated: [] as string[] }));

vi.mock("ioredis", () => ({ default: vi.fn() }));
vi.mock("bullmq", () => ({
  Queue: vi.fn(function MockQueue(this: Record<string, unknown>, name: string) {
    queuesCreated.push(name);
    this.getJobCounts = async () =>
      name === "dm-processing" ? { waiting: 1, failed: 2 } : { waiting: 3, failed: 0 };
  }),
}));

import { getDMJobCounts, getDMQueue } from "../lib/queue/client";

describe("DM queues", () => {
  it("gives every account its own queue and reuses it", () => {
    expect(getDMQueue("ig_1")).toBe(getDMQueue("ig_1"));
    expect(getDMQueue("ig_2")).not.toBe(getDMQueue("ig_1"));
    expect(queuesCreated).toEqual(["dm-ig_1", "dm-ig_2"]);
  });

  it("sums job counts across the legacy queue and every account queue", async () => {
    await expect(getDMJobCounts(["ig_1", "ig_2"], "waiting", "failed")).resolves.toEqual({
      waiting: 7,
      failed: 2,
    });
  });
});
