ALTER TABLE "SocialAccount" ADD COLUMN "tokenRevokedAt" TIMESTAMP(3);

UPDATE "SocialAccount"
SET "tokenRevokedAt" = "tokenExpiresAt", "tokenExpiresAt" = NULL
WHERE "platform" = 'FACEBOOK' AND "tokenExpiresAt" IS NOT NULL;
