DROP INDEX "WebhookEvent_workspaceId_idx";

CREATE INDEX "WebhookEvent_workspaceId_createdAt_idx" ON "WebhookEvent"("workspaceId", "createdAt");
