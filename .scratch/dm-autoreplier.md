# DM autoreplier (openreply)

## Decision
Separate repo: fork https://github.com/diwenne/openreply into verybigmotion/openreply. Not inside miqla.

## Decided 2026-09-22
- Provider: own Meta app, Development mode, under the appscale Meta Business portfolio. Each influencer added as Instagram Tester by hand. No App Review. (ADR 0001)
- Isolation: one Workspace per Influencer, auto-created on first login. No invites.
- Operators: `OPERATOR_EMAILS` env, see all Workspaces via switcher, ADMIN rights everywhere. (ADR 0002)
- Hosting: one EC2 (t4g.small) + Dokploy, containers web + worker + Redis. Postgres in Supabase. Cloudflare DNS/proxy.
- Domain: reply.appscale.team
- Email: Resend, sender on mail.appscale.team
- Monitoring: no per-influencer alerts. CloudWatch/Route53 health check on /api/health → SNS → email, like miqla. Operator health overview page in UI.
- UI stays English, no influencer guide, support via WhatsApp.

## Code to write
1. `OPERATOR_EMAILS`: workspace switcher in sidebar listing all Workspaces for Operators, context resolves selected Workspace, Operator acts as ADMIN.
2. Operator overview page: every Workspace with connection health (token expiry, last webhook received, last failed DM, worker heartbeat).

## Meta app (created 2026-09-22)
- App: AppScale Reply, Facebook App ID 2327493031417038, type Business, no portfolio yet.
- Instagram App ID: 28100165789684145 (= INSTAGRAM_APP_ID)
- Webhook: https://reply.appscale.team/api/webhook, verify after deploy, subscribe comments + messages.
- Redirect URI: https://reply.appscale.team/api/instagram/callback
- Must be switched to Live for webhooks. No App Review.

## Server
- EC2 i-08cdf13048a48f89e, t4g.small, us-east-1, Elastic IP 98.94.134.117, key ~/.ssh/openreply.pem, user ubuntu.
- Dokploy installed, panel http://98.94.134.117:3000.

## Ops to do
- Meta app under business portfolio: Instagram product, redirect URI on reply.appscale.team, webhook, secrets.
- EC2 + Dokploy per docs/deploy-dokploy.md, Supabase project, Resend domain, Cloudflare record.
- CloudWatch health check + SNS email.

## Influencer onboarding
1. Operator adds Instagram username as Tester in Meta app.
2. Influencer accepts in Instagram: Settings → Apps and websites → Tester invites. Business/Creator account required.
3. Influencer signs in at reply.appscale.team via magic link.
4. Settings → Connect Instagram.
5. Create campaign.

## Docs
- docs/setup.md, docs/deploy-dokploy.md, META_APP_REVIEW.md, CONTEXT.md, docs/adr/
