export const FAILURE_REASONS = [
  { key: "rate_limited", label: "Rate limited", color: "#f97316" },
  { key: "refused", label: "Refused", color: "#3f3f46" },
  { key: "recipient_unavailable", label: "Recipient unavailable", color: "#fdba74" },
  { key: "account_blocked", label: "Account blocked", color: "#a1a1aa" },
  { key: "token", label: "Token", color: "#c2410c" },
  { key: "plan_limit", label: "Plan limit", color: "#d4d4d8" },
  { key: "other", label: "Other", color: "#7c2d12" },
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number]["key"];
export type FailureDay = { day: string; total: number } & Record<FailureReason, number>;
export type FailureAccount = { username: string; total: number; days: FailureDay[] } & Record<FailureReason, number>;
