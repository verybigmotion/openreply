"use client";

import { createContext, useContext } from "react";
import type { OperatorWorkspaceOption } from "@/components/operator-workspace-switcher";

export interface OperatorContextValue {
  workspaces: OperatorWorkspaceOption[];
  currentWorkspaceId: string;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

export const OperatorProvider = OperatorContext.Provider;

export function useOperator(): OperatorContextValue | null {
  return useContext(OperatorContext);
}
