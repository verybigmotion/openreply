const PERMANENT_FAILURE_PREFIX = "PermissionError ";

export const permanentDMFailure = {
  status: "FAILED",
  errorMessage: { startsWith: PERMANENT_FAILURE_PREFIX },
} as const;

export function isPermanentDMFailure(
  log: { status: string; errorMessage: string | null } | null | undefined
): boolean {
  return log?.status === "FAILED" && Boolean(log.errorMessage?.startsWith(PERMANENT_FAILURE_PREFIX));
}
