ALTER TYPE "InstagramProvider" RENAME TO "SocialProvider";
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK');

ALTER TABLE "InstagramAccount" RENAME TO "SocialAccount";
ALTER TABLE "SocialAccount" RENAME COLUMN "instagramId" TO "externalId";
ALTER TABLE "SocialAccount" ADD COLUMN "platform" "SocialPlatform" NOT NULL DEFAULT 'INSTAGRAM';
ALTER TABLE "SocialAccount" RENAME CONSTRAINT "InstagramAccount_pkey" TO "SocialAccount_pkey";
ALTER TABLE "SocialAccount" RENAME CONSTRAINT "InstagramAccount_workspaceId_fkey" TO "SocialAccount_workspaceId_fkey";
ALTER INDEX "InstagramAccount_instagramId_key" RENAME TO "SocialAccount_externalId_key";
ALTER INDEX "InstagramAccount_workspaceId_idx" RENAME TO "SocialAccount_workspaceId_idx";

ALTER TABLE "Automation" RENAME COLUMN "instagramAccountId" TO "socialAccountId";
ALTER TABLE "Automation" RENAME CONSTRAINT "Automation_instagramAccountId_fkey" TO "Automation_socialAccountId_fkey";
ALTER INDEX "Automation_instagramAccountId_idx" RENAME TO "Automation_socialAccountId_idx";

ALTER TABLE "DmLog" RENAME COLUMN "instagramAccountId" TO "socialAccountId";
ALTER TABLE "DmLog" RENAME CONSTRAINT "DmLog_instagramAccountId_fkey" TO "DmLog_socialAccountId_fkey";
ALTER INDEX "DmLog_instagramAccountId_idx" RENAME TO "DmLog_socialAccountId_idx";

ALTER TABLE "LinkClick" RENAME COLUMN "instagramAccountId" TO "socialAccountId";
ALTER TABLE "LinkClick" RENAME CONSTRAINT "LinkClick_instagramAccountId_fkey" TO "LinkClick_socialAccountId_fkey";
ALTER INDEX "LinkClick_instagramAccountId_idx" RENAME TO "LinkClick_socialAccountId_idx";

ALTER TABLE "FollowerSnapshot" RENAME COLUMN "instagramAccountId" TO "socialAccountId";
ALTER TABLE "FollowerSnapshot" RENAME CONSTRAINT "FollowerSnapshot_instagramAccountId_fkey" TO "FollowerSnapshot_socialAccountId_fkey";
ALTER INDEX "FollowerSnapshot_instagramAccountId_date_key" RENAME TO "FollowerSnapshot_socialAccountId_date_key";
ALTER INDEX "FollowerSnapshot_instagramAccountId_date_idx" RENAME TO "FollowerSnapshot_socialAccountId_date_idx";
