import { describe, expect, it } from "vitest";
import { isPermanentDMFailure } from "../lib/queue/permanent-dm-failure";

describe("isPermanentDMFailure", () => {
  it("treats a DM Instagram refused with a permission error as final", () => {
    expect(
      isPermanentDMFailure({
        status: "FAILED",
        errorMessage: "PermissionError 100: The comment is invalid for a private reply",
      })
    ).toBe(true);
  });

  it("keeps transient failures retryable", () => {
    expect(
      isPermanentDMFailure({ status: "FAILED", errorMessage: "MetaApiError 2: Service temporarily unavailable" })
    ).toBe(false);
    expect(isPermanentDMFailure({ status: "PENDING", errorMessage: "PermissionError 100: x" })).toBe(false);
    expect(isPermanentDMFailure(null)).toBe(false);
  });
});
