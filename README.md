# ModLink

A React/Vite Discord staff and moderator hiring hub using Supabase Auth and Postgres.

## Local setup

1. Install dependencies with `npm install`.
2. Create a Supabase project and copy its project URL and anon/publishable key into the root `.env`:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. In the Supabase SQL Editor, run the complete `supabase-setup.sql` script. It is safe to rerun and includes profile backfill for existing accounts. The final query lists each required app table and confirms whether it exists in `public`: `profiles`, `job_listings`, `applications`, `moderation_reports`, `moderation_warnings`, `site_settings`, `notifications`, `pr_inquiries`, `chat_conversations`, `chat_messages`, and `staff_action_log`. Supabase-managed `auth.users` and the `pg_cron` extension are not app tables created by this script.
4. In Supabase **Authentication → Providers**, enable Discord and add the Discord OAuth client credentials. Add `http://localhost:5173` (or your deployed site URL) to the Supabase **Authentication → URL Configuration → Redirect URLs**.
5. Run `npm run dev`.

The site supports browsing open listings, Discord sign-in, applying to roles, a personal dashboard with an editable introduction and portfolio link, tracking applications, publishing and managing listings, a searchable tiered moderation workspace, account notifications, private lister/applicant chats, and Owner-controlled maintenance mode. Applicants can share their profile bio and portfolio link with listing owners alongside applications.

The public landing page includes a search-focused title and description, Open Graph metadata, WebSite structured data, a crawler policy, sitemap, and branded favicon. These improve technical discoverability but cannot guarantee search placement; rankings also depend on search-engine indexing, external references, content quality, and competition.

### GitHub Pages deployment

The `Deploy frontend to GitHub Pages` workflow deploys the `main` branch to https://adanexe.github.io/ModLink/. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Secrets and variables → Actions** as repository secrets or variables. The workflow accepts either type and fails with a clear error if either setting is missing. These Vite values are embedded in the public frontend bundle; use only a Supabase publishable/anon key, never a service-role key. Then add `https://adanexe.github.io/ModLink/` to the Supabase Authentication redirect URL allow-list and configure the Discord OAuth provider redirect URLs as required by Supabase. The local `.env` is ignored by Git and must never be committed.

### Staff permissions

- **Level 0 — User:** post standard listings and submit applications.
- **Level 1 — Trial Mod:** review and resolve flagged listing and chat reports.
- **Level 2 — Jr Mod:** close listings.
- **Level 3 — Mod:** hard-delete listings and issue member warnings.
- **Level 4 — Sr Mod:** temporarily suspend lower-ranked accounts from posting and applying (up to 30 days).
- **Level 5 — Sr Admin:** verify moderators, feature listings, and manage staff through Level 3.
- **Level 6 — Owner:** all staff controls, manage staff through Level 5, suspend accounts permanently or for up to a year, update site announcements/settings, and turn public maintenance mode on or off.
- **PR Manager — separate assignment:** an Owner can assign this non-moderation role to any member (including their own account). PR Managers can review and answer advertising, press, and partnership inquiries but receive no moderation permissions. Level 6 Owners always have full PR inbox access whether or not they have this separate flag.

Moderation RPCs enforce these levels in Postgres as well as in the UI. Report outcomes include a staff reply in the reporter's inbox; Senior Admins can broadcast a notice to all accounts. A private staff action history is visible only to Senior Admins and Owners and records the acting staff member's name, rank, target, and action.

### Promotion recommendations

The staff dashboard recommends a staff member for **human promotion review** when all of the following are true:

- They are currently Level 1 or higher.
- They have at least **five logged casework actions in the last 30 days**. Counted actions are resolving or dismissing a report, closing or deleting a listing, issuing a warning, and suspending or unsuspending a member.
- They do not currently have an active suspension.
- Their current level is within the viewing administrator's promotion authority. Level 5 Senior Admins see eligible Level 1–2 staff; Level 6 Owners see eligible Level 1–4 staff.

The **Promotion readiness** section and dashboard badge are prompts to review—not a score of staff quality and not an automatic promotion. Senior staff should inspect the attributed actions and their context, consider any pending staff-conduct reports and fairness, and make any rank change manually using staff access controls. Meeting the activity threshold alone does not mean a promotion is deserved or guaranteed.

Members can report a staff action from the related inbox notification. Staff-conduct reports are confidential: Level 5 staff can review reports about lower-ranked staff, and Level 6 Owners can review reports about staff below the Owner rank. A reported staff member cannot review their own report, and the report submitter cannot resolve it. Owner decisions have no higher site rank, so the inbox links those reports to the existing support channel.

The public opportunities page reserves a clearly labelled advertising space; visitors can contact PR about available placements. Level 6 Owners can manage one HTTPS sponsor placement from the staff workspace. It uses the existing `site_settings` row; the site does not record ad impressions or clicks. The PR contact page requires Discord sign-in, sends inquiries to assigned PR Managers, and lets requesters track replies there. A member can submit up to three inquiries per 24 hours. Inquiries are visible to their requester, assigned PR Managers, and the Owner. Answered inquiries are retained for 30 days; unresolved inquiries remain available until answered. PR role changes and replies are attributed in the staff action history. The Owner metrics and seven-day staff action chart are operational counts computed from data already loaded for the staff workspace, not visitor analytics or unique-user measurements. Inbox notifications are deleted after 20 days; staff action history is deleted after 30 days. Applicants and listing owners can chat after the owner starts a conversation and either participant can report it. Chat reports include a server-captured snapshot of up to 100 recent, unexpired messages for moderator review. Regular chat messages expire after 24 hours and `pg_cron` periodically removes expired message, conversation, notification, resolved inquiry, and staff audit data. The SQL setup enables `pg_cron` and schedules the cleanup job.

When maintenance mode is enabled, visitors see a maintenance page; Level 6 Owners can still access the staff workspace to turn it off.

Rerun the complete `supabase-setup.sql` after pulling schema/policy updates. The script expects Supabase's `pg_cron` extension to be available for scheduled cleanup and retention enforcement.

## First administrator

Sign in once using Discord, then find your account UUID under **Authentication → Users** in Supabase. Run this in the SQL Editor, replacing the placeholder with that UUID:

```sql
update public.profiles
set admin_level = 6
where id = 'YOUR-AUTH-USER-UUID';
```

Refresh the site to show the **Staff dashboard** in the **My workspace** menu. Level 6 (Owner) can grant lower roles and assign PR Managers from the staff workspace; role changes are deliberately restricted to trusted database functions.

## Netlify deployment

Connect the repository to Netlify and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the site's environment variables. Netlify uses `npm run build` and publishes the `dist` directory.
