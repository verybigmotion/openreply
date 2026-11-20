# Meta App Review notes

You only need App Review if you want people who are not testers on your app to connect their own Instagram accounts. If you run OpenReply for your own accounts, skip this. See the "Letting other people use your instance" section of [docs/setup.md](docs/setup.md).

OpenReply uses the official Instagram and Facebook Pages APIs to send a private reply to someone who comments on a connected professional account's or Page's post or reel.

## Permissions to request

Instagram:

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`
- `instagram_business_manage_insights`

Facebook Pages:

- `public_profile`
- `pages_show_list`
- `business_management`
- `pages_manage_metadata`
- `pages_read_engagement`
- `pages_read_user_content`
- `pages_manage_engagement`
- `pages_messaging`
- `read_insights`

Do not request permissions the app never calls, such as `ads_read`, `ads_management`, `instagram_creator_marketplace_discovery`, Page Public Content Access, or Page Public Metadata Access. Reviewers reject permissions they cannot see used in the screencast.

## Permission justifications

Paste these into the App Review request, adjusted to your wording.

`instagram_business_basic`. We use this to identify the connected Instagram professional account after the user authorizes through Instagram business login, so we can associate the account with their workspace and show which account each automation belongs to. We also list the account's own posts and reels so the owner can pick which one a campaign runs on.

`instagram_business_manage_comments`. When a follower comments a keyword the account owner configured on the owner's own post or reel, we receive the comment through the comments webhook, with periodic polling of the post's comments as a backup for missed webhooks, and, if the owner enabled it, post a public reply under that comment. We only act on comments on the connecting account's own media.

`instagram_business_manage_messages`. After a follower comments a configured keyword, we send that follower a one-time private reply with content the account owner set up, typically a link or answer the follower asked for by commenting. This is the standard Instagram comment-to-DM flow. We send one reply per matching comment and respect Meta's rate limits. The opening reply can carry a button; when the follower taps it, we send the content in a follow-up message in that same conversation. If the owner enabled it, a follower who sends the account a DM containing a configured keyword gets the same content as a reply. If the owner enabled it, we send one follow-up message in the same conversation within 24 hours of the reply. If the owner made the content followers-only, we check whether the follower follows the account before sending it, and otherwise ask them to follow first. The app also has an inbox where the owner reads the account's conversations and replies to them by hand. We only message people who commented on the account's content or messaged the account first.

`instagram_business_manage_insights`. On the Overview page we show the account owner the reach, views, saves, shares, and total interactions of their own recent posts and reels, so they can see which posts drive the most comments and replies. We also read the account's follower count insight to show a follower-growth chart on the same page. We only read insights for the connected account and its own media.

`public_profile`. When a user signs in with Facebook to connect their Pages, we read their Facebook user ID to link the login to their OpenReply workspace. We do not read or store any other profile data.

`pages_show_list`. After Facebook login we list the Pages the user manages so we can connect them to their workspace and show which Page each automation belongs to.

`business_management`. Many Pages are owned through a business portfolio rather than directly by a person. We use this so those Pages appear in the list of Pages the user manages and can be connected. We do not create or modify anything in Business Manager.

`pages_manage_metadata`. When a Page is connected we subscribe it to our app's webhooks for feed, messages, messaging_postbacks, and message_reads, so we are notified when someone comments on the Page's posts or messages the Page.

`pages_read_engagement`. We read the connected Page's name, profile picture, posts, and reels so the owner can pick which post a campaign runs on, and we read reaction and comment counts to show post performance on the Overview page.

`pages_read_user_content`. We read comments people leave on the connected Page's own posts and reels to detect the keyword the owner configured. We only read comments on the Page's own content.

`pages_manage_engagement`. When a person comments the configured keyword and the owner enabled it, we post a public reply under that comment on the Page's own post.

`pages_messaging`. After a person comments the configured keyword on the Page's post, we send them one private reply in Messenger with content the Page owner set up, typically a link or answer they asked for by commenting. We send one reply per matching comment and respect Meta's rate limits. The opening reply can carry a button; when the person taps it, we send the content in a follow-up message in that same conversation. If the owner enabled it, a person who messages the Page with a configured keyword gets the same content as a reply. If the owner enabled it, we send one follow-up message in the same conversation within 24 hours of the reply. The app also has an inbox where the owner reads the Page's Messenger conversations and replies to them by hand. We only message people who commented on the Page's content or messaged the Page first.

`read_insights`. On the Overview page we show the Page owner the view counts of their own posts, so they can see which posts drive the most comments and replies. We only read insights for the connected Page's own posts.

## Screencast script

Record two videos on your published app with real accounts, each in one take of about two to three minutes. Start logged out, keep the UI in English, and explain each step with English captions; reviewers do not listen to audio. Use the mouse rather than the keyboard so every action is visible. Attach the Instagram video to the four Instagram permissions and the Facebook video to the nine Facebook permissions.

Use an Instagram account with at least 100 followers, or one connected for at least two days, so the follower-growth chart has data. Before Advanced Access is granted, Meta only delivers webhooks and messages for people with a role on the app, so add the commenting Instagram and Facebook accounts as testers first.

### Instagram video

1. On the login page, click Continue with Instagram. Show the consent screen with the permissions being granted, then the connected account in Settings.
2. Create a campaign on a recent post with keyword `LINK`, a DM message, and the public reply enabled with a reply message typed in, then save.
3. On a second phone or account, comment `LINK` on that post.
4. Show the second account receiving the DM, and the public reply appearing under the comment.
5. Back in the app, show the DM Logs page with the SENT row.
6. Open Overview for the Instagram account and show the follower-growth chart and the per-post insights.

### Facebook video

1. On the login page, click Continue with Facebook. Show the consent screen with the Page permissions and the Pages being granted, then the connected Page in Settings. Use a Page owned by a business portfolio and say so, since that Page only appears through `business_management`.
2. Create a campaign on a Facebook Page post with keyword `LINK`, a DM message, and the public reply enabled with a reply message typed in.
3. From another Facebook account, comment `LINK` on that post.
4. Show the Messenger reply arriving, and the public reply under the comment.
5. Back in the app, show the Inbox with the Page conversation and the Overview with the Page post views.

Reviewers want to see the permission produce a real result for a real user. This flow does that directly.

## Compliance positioning

- The app never scrapes Instagram and never asks for a password.
- It only messages people who commented on the connected account's own content or messaged the account first.
- Tokens are encrypted at rest with AES-256-GCM.
- Users can disconnect Instagram from Settings.
- Per-account rate limiting and deduplication prevent spammy behavior.

## Business verification

Meta usually requires business verification before granting Advanced Access. It asks for a document proving a legal entity: a business registration or license, articles of incorporation, a business tax document, or a business bank statement. If you do not have a registered business, you cannot complete this step, and the practical path is to run OpenReply for your own accounts instead, which never needs review.
