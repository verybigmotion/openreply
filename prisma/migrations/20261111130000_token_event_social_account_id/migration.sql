UPDATE "OperationalEvent"
SET "payload" = ("payload" - 'instagramAccountId') || jsonb_build_object('socialAccountId', "payload" -> 'instagramAccountId')
WHERE "source" = 'TOKEN_REFRESH' AND "payload" ? 'instagramAccountId';
