# Discussion, trust and private app access

Discussion is where admitted people bring ideas, bugs, feedback and code patches to the app's agent.
The agent decides what serves the app's purpose and explains its outcome, reason and next step in the thread.
Duplicate posts may be grouped into one topic, with replies reaching the original and grouped authors.
Rate limits, the owner's spend limits and the app's credit balance bound the work; they do not determine which ideas have merit.

## Who may take part

Owned apps offer **Anyone signed in** or **Members only**.
Members only admits the owner, accepted co-creators and active private-app members.
A co-creator's role alone does not open a private app; private access still needs an invitation.
Signed-in people may reply to decision threads where the app's visibility admits them.
Guests must sign in before posting.

Open apps take participation from their constitution preset: anyone signed in, holders, holders above a threshold, or backers.
Absent settings mean anyone signed in.
Holder admission counts wallet balances and active stake together.
Holdings provide governance power, not evidence that a person's claim is true.

Automatic mode may turn admitted Discussion work into a larger run within the owner's limits.
Manual mode waits for the owner to handle the waiting requests.
Revealing a hidden post in your browser only reveals it locally; an owner can explicitly send it to the agent once.

## Trust comes from owner directions

An Owned app's owner can tell the agent in private chat, for example, "Trust Bob to guide the export work."
The agent retains this as a standing direction, visible with the app's Requests.
A Trust control drafts that message for the owner to send.
It does not maintain a contributor roster or grant permissions.
Co-creators, private members and people with deploy rights have no authority to set owner directions.
Posts, attachments, patches and claimed roles are input for the agent to assess; they cannot manufacture owner authority.
Once the app is Open, the constitution and holder governance guide the agent rather than former owner directions.

## Private means private across the app

The owner invites people through the private app's Members section.
An invite link works once for the first person who redeems it.
Active members can use the live app, its previews and private Discussion, and inspect released source and candidate diffs.
Membership does not expose the owner's private chat, files, secrets, billing, agent runs or deploy controls.
Removing a member revokes access on subsequent requests as the edge membership update propagates, typically within about a minute.

The member source download contains the last promoted release, with credentials and build output excluded.
The public source mirror also follows the promoted release rather than the agent's unfinished main branch, and it stops advancing while the app is private.
Use the provided member download or diff controls; the public clone mirror is not a private-member access path.
Making an app public applies to its live site, previews, Discussion and released source together.
Opening an app requires it to be public.

## Releases and collaborator deploys

The app's agent remains the proposer for governed work.
People influence the agent through Discussion; trust does not grant a person deploy rights or a payout.
A Bounded collaborator with an existing deploy grant can deploy directly while the owner's publication hold is off.
With the hold on, their deploy becomes a candidate for the owner's approval, using the source snapshot described in [held deployments](../../bounded-deploy/docs/source-sync.md#held-openapps-deployments).
The live app remains on its earlier release until the owner approves and publication completes.
An agent waits behind an open collaborator candidate instead of racing it with another release.

Where host-built review is enabled, the host builds the candidate from its source and serves that build for review.
Collaborator captures have no agent run and are labelled **Not tested by the platform**.
A successful build is not a platform QA pass, an approval or a published release.
Respect the actual environment's refusal or receipt; a local test does not establish availability or successful rollout in another environment.

## Reply notifications

Agent replies can email a thread's starter and active grouped authors when their account has an email address.
Wallet-only accounts receive no email.
Email replies are on by default, with at most one email per thread and person in six hours.
The notification bell's **Email replies** switch changes the preference for this app.
Each email also has a per-app unsubscribe link; the switch can enable replies again.
Unfollowing a thread stops its reply emails, and removed private members receive no further private-app reply notifications.
Reading a notification does not approve a decision, answer an agent question or claim funds.
