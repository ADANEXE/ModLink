# ModLink

A React/Vite Discord staff and moderator hiring hub using Supabase Auth and Postgres.

## Local setup

1. Install dependencies with `npm install`.
2. Create a Supabase project and copy its project URL and anon/publishable key into the root `.env`:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. In the Supabase SQL Editor, run the complete `supabase-setup.sql` script. It is safe to rerun and includes profile backfill for existing accounts.
4. In Supabase **Authentication → Providers**, enable Discord and add the Discord OAuth client credentials. Add `http://localhost:5173` (or your deployed site URL) to the Supabase **Authentication → URL Configuration → Redirect URLs**.
5. Run `npm run dev`.

The site supports browsing open listings, Discord sign-in, applying to roles, tracking applications, publishing and managing listings, a tiered moderation workspace, account notifications, private lister/applicant chats, and Owner-controlled maintenance mode.

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

Moderation RPCs enforce these levels in Postgres as well as in the UI. Report outcomes include a staff reply in the reporter's inbox; Senior Admins can broadcast a notice to all accounts. A private staff action history is visible only to Senior Admins and Owners and records moderation, staff-rank, verification, feature, settings, and broadcast actions for promotion reviews. Inbox notifications are deleted after 20 days; staff action history is deleted after 30 days. Applicants and listing owners can chat after the owner starts a conversation and either participant can report it. Chat reports include a server-captured snapshot of up to 100 recent, unexpired messages for moderator review. Regular chat messages expire after 24 hours and `pg_cron` periodically removes expired message, conversation, notification, and staff audit data. The SQL setup enables `pg_cron` and schedules the cleanup job.

When maintenance mode is enabled, visitors see a maintenance page; Level 6 Owners can still access the staff workspace to turn it off.

Rerun the complete `supabase-setup.sql` after pulling schema/policy updates. The script expects Supabase's `pg_cron` extension to be available for scheduled cleanup and retention enforcement.

## First administrator

Sign in once using Discord, then find your account UUID under **Authentication → Users** in Supabase. Run this in the SQL Editor, replacing the placeholder with that UUID:

```sql
update public.profiles
set admin_level = 6
where id = 'YOUR-AUTH-USER-UUID';
```

Refresh the site to show the **Moderation** navigation item. Level 6 (Owner) can grant lower roles from the staff workspace; role changes are deliberately restricted to trusted database functions.

## Netlify deployment

Connect the repository to Netlify and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the site's environment variables. Netlify uses `npm run build` and publishes the `dist` directory.
