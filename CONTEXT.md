# OpenReply (appscale deployment)

Self-hosted Instagram and Facebook comment-to-DM autoreplier that appscale runs for its influencers. Each influencer configures their own campaigns; appscale staff oversee every connection.

## Language

**Influencer**:
A person whose Social accounts are connected to OpenReply. Owns exactly one Workspace and configures campaigns there. Signs in by email, Instagram or Facebook; signing in through Instagram or Facebook leads to the Workspace that holds that Instagram account or the Facebook Pages that profile manages, or, when none of them is connected any more, to the Workspace they signed in to before.
_Avoid_: Client, customer, user, creator

**Social account**:
An Instagram professional account or a Facebook Page connected to a Workspace. An Influencer may have several, on either platform.
_Avoid_: Account, channel, profile

**Facebook Page**:
A Facebook presence that can be messaged through Messenger. A personal Facebook profile, even in professional mode, is not a Facebook Page and cannot be connected.

**Campaign**:
One keyword-triggered reply flow. Belongs to exactly one Social account; a reel cross-posted to Instagram and Facebook needs one Campaign per Social account. Campaigns behave the same on both platforms, except the follow gate, which exists only on Instagram.
_Avoid_: Automation

**Operator**:
An appscale staff member who can see and manage every Workspace. Identified by email, not by Workspace membership.
_Avoid_: Admin, superadmin, platform admin

**Workspace**:
The isolation boundary. Everything an Influencer sees (campaigns, logs, inbox) belongs to one Workspace. One Workspace per Influencer.
_Avoid_: Account, tenant, organization

**Workspace role**:
OWNER, ADMIN or MEMBER inside one Workspace. Unrelated to Operator, which spans all Workspaces.

**Connection**:
The link between a Social account and OpenReply through the appscale Meta app. Its health (token validity, webhook delivery, worker state) is what Operators monitor.
_Avoid_: Integration, login

**Tester**:
An Instagram account, or the personal Facebook profile that administers a Facebook Page, added to the appscale Meta app in Development mode so it can be connected. Every Influencer must be a Tester before connecting.
