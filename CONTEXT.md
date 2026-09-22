# OpenReply (appscale deployment)

Self-hosted Instagram comment-to-DM autoreplier that appscale runs for its influencers. Each influencer configures their own campaigns; appscale staff oversee every connection.

## Language

**Influencer**:
A person whose Instagram account is connected to OpenReply. Owns exactly one Workspace and configures campaigns there.
_Avoid_: Client, customer, user, creator

**Operator**:
An appscale staff member who can see and manage every Workspace. Identified by email, not by Workspace membership.
_Avoid_: Admin, superadmin, platform admin

**Workspace**:
The isolation boundary. Everything an Influencer sees (campaigns, logs, inbox) belongs to one Workspace. One Workspace per Influencer.
_Avoid_: Account, tenant, organization

**Workspace role**:
OWNER, ADMIN or MEMBER inside one Workspace. Unrelated to Operator, which spans all Workspaces.

**Connection**:
The link between an Instagram account and OpenReply through the appscale Meta app. Its health (token validity, webhook delivery, worker state) is what Operators monitor.
_Avoid_: Integration, login

**Tester**:
An Instagram account added to the appscale Meta app in Development mode so it can be connected. Every Influencer must be a Tester before connecting.
