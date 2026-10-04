-- Run this script in the Supabase SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  discord_id text unique,
  username text not null default '',
  avatar_url text,
  bio text not null default '',
  is_verified_moderator boolean not null default false,
  admin_level integer not null default 0 check (admin_level between 0 and 6),
  portfolio_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null,
  target_user_id uuid,
  target_name text,
  target_listing_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.job_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  server_name text not null,
  role_title text not null,
  description text not null default '',
  is_featured boolean not null default false,
  status text not null default 'open' check (status in ('open', 'closed', 'filled')),
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_listings (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  experience_summary text not null default '',
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (job_id, applicant_id)
);

alter table public.profiles
  add column if not exists suspended_until timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists is_suspended boolean not null default false;

update public.profiles
set is_suspended = true
where suspended_until > now() and is_suspended = false;

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.job_listings (id) on delete set null,
  report_type text not null default 'listing',
  conversation_id uuid,
  reported_user_id uuid references public.profiles (id) on delete set null,
  chat_excerpt jsonb not null default '[]'::jsonb,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 1000),
  staff_reply text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);

create table if not exists public.moderation_warnings (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  issued_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (key, value)
values ('maintenance_mode', 'false'::jsonb)
on conflict (key) do nothing;

alter table public.moderation_reports
  add column if not exists staff_reply text,
  add column if not exists report_type text not null default 'listing',
  add column if not exists conversation_id uuid,
  add column if not exists reported_user_id uuid references public.profiles (id) on delete set null,
  add column if not exists chat_excerpt jsonb not null default '[]'::jsonb;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  link_type text,
  link_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete cascade,
  listing_id uuid not null references public.job_listings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (owner_id <> applicant_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'moderation_reports_conversation_id_fkey'
      and conrelid = 'public.moderation_reports'::regclass
  ) then
    alter table public.moderation_reports
      add constraint moderation_reports_conversation_id_fkey
      foreign key (conversation_id) references public.chat_conversations (id) on delete set null;
  end if;
end;
$$;

create index if not exists job_listings_status_created_at_idx
  on public.job_listings (status, created_at desc);
create index if not exists applications_job_id_idx
  on public.applications (job_id);
create index if not exists applications_applicant_id_idx
  on public.applications (applicant_id);
create index if not exists moderation_reports_status_created_at_idx
  on public.moderation_reports (status, created_at);
create index if not exists moderation_warnings_target_user_id_idx
  on public.moderation_warnings (target_user_id, created_at desc);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists staff_action_log_created_at_idx
  on public.staff_action_log (created_at desc);
create index if not exists chat_messages_conversation_expiry_idx
  on public.chat_messages (conversation_id, expires_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, discord_id, username, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'provider_id',
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'preferred_username',
      ''
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  );
  return new;
end;
$$;

create or replace function public.submit_chat_report(target_conversation_id uuid, report_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter uuid := auth.uid();
  reported_user uuid;
  excerpt jsonb;
  report_id uuid;
begin
  if reporter is null then
    raise exception 'Sign in to report a conversation';
  end if;
  if report_reason is null or char_length(trim(report_reason)) < 10 or char_length(report_reason) > 1000 then
    raise exception 'Report details must be between 10 and 1000 characters';
  end if;
  select case when owner_id = reporter then applicant_id else owner_id end
    into reported_user
  from public.chat_conversations
  where id = target_conversation_id
    and (owner_id = reporter or applicant_id = reporter);
  if not found then
    raise exception 'Chat not found or access denied';
  end if;
  if exists (
    select 1 from public.profiles
    where id = reporter and is_suspended and (suspended_until is null or suspended_until > now())
  ) then
    raise exception 'Suspended accounts cannot submit reports';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sender_id', sender_id,
        'body', body,
        'created_at', created_at
      ) order by created_at
    ),
    '[]'::jsonb
  )
  into excerpt
  from (
    select sender_id, body, created_at
    from public.chat_messages
    where conversation_id = target_conversation_id
      and expires_at > now()
    order by created_at desc
    limit 100
  ) recent_messages;

  insert into public.moderation_reports (
    report_type, conversation_id, reported_user_id, chat_excerpt,
    reporter_id, reason
  )
  values (
    'chat', target_conversation_id, reported_user, excerpt, reporter, trim(report_reason)
  )
  returning id into report_id;
  return report_id;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill accounts created before this setup was installed.
insert into public.profiles (id, discord_id, username, avatar_url)
select
  users.id,
  users.raw_user_meta_data ->> 'provider_id',
  coalesce(
    users.raw_user_meta_data ->> 'full_name',
    users.raw_user_meta_data ->> 'name',
    users.raw_user_meta_data ->> 'preferred_username',
    ''
  ),
  coalesce(
    users.raw_user_meta_data ->> 'avatar_url',
    users.raw_user_meta_data ->> 'picture'
  )
from auth.users as users
on conflict (id) do nothing;

create or replace function public.current_admin_level()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select profiles.admin_level from public.profiles where profiles.id = auth.uid()),
    0
  );
$$;

revoke all on function public.current_admin_level() from public;
grant execute on function public.current_admin_level() to anon, authenticated;

create or replace function public.record_staff_action(
  action_name text,
  target_user uuid default null,
  target_member_name text default null,
  target_listing uuid default null,
  action_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_admin_level() < 1 then
    raise exception 'Staff access required to write the staff action log';
  end if;
  insert into public.staff_action_log (
    actor_id, actor_name, target_user_id, target_name, target_listing_id, action, details
  )
  values (
    auth.uid(),
    coalesce(nullif(trim((select username from public.profiles where id = auth.uid())), ''), 'Staff member'),
    target_user,
    nullif(trim(target_member_name), ''),
    target_listing,
    action_name,
    coalesce(action_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_staff_action(text, uuid, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.admin_set_member_level(target_user_id uuid, new_level integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_level integer := public.current_admin_level();
  target_level integer;
  target_name text;
begin
  if actor_level < 5 then
    raise exception 'Administrator access required';
  end if;
  if new_level is null
    or new_level < 0
    or (actor_level = 5 and new_level > 3)
    or (actor_level = 6 and new_level > 5)
    or (actor_level > 6) then
    raise exception 'Role is outside your staff-management range';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;

  select profiles.admin_level, profiles.username into target_level, target_name
  from public.profiles
  where profiles.id = target_user_id;

  if not found then
    raise exception 'Member not found';
  end if;
  if (actor_level = 5 and target_level > 3)
    or (actor_level = 6 and target_level > 5) then
    raise exception 'Member is outside your staff-management range';
  end if;

  update public.profiles
  set admin_level = new_level
  where id = target_user_id;
  insert into public.notifications (user_id, actor_id, type, title, body)
  values (
    target_user_id,
    auth.uid(),
    'staff_role',
    'Your staff rank changed',
    'Your rank is now level ' || new_level || '.'
  );
  perform public.record_staff_action(
    'staff_rank_changed',
    target_user_id,
    target_name,
    null,
    jsonb_build_object('previous_level', target_level, 'new_level', new_level)
  );
end;
$$;

create or replace function public.admin_set_moderator_verified(target_user_id uuid, verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_admin_level() < 5 then
    raise exception 'Administrator access required';
  end if;

  if public.current_admin_level() < 6 and exists (
    select 1 from public.profiles
    where profiles.id = target_user_id and profiles.admin_level >= 5
  ) then
    raise exception 'You cannot change verification for equal or higher staff';
  end if;

  update public.profiles
  set is_verified_moderator = verified
  where id = target_user_id;

  if not found then
    raise exception 'Member not found';
  end if;
  insert into public.notifications (user_id, actor_id, type, title, body)
  values (
    target_user_id,
    auth.uid(),
    'moderator_verification',
    case when verified then 'Moderator status verified' else 'Moderator verification updated' end,
    case when verified then 'Your profile now has a Verified Moderator badge.' else 'Your Verified Moderator badge was removed.' end
  );
  perform public.record_staff_action(
    case when verified then 'moderator_verified' else 'moderator_verification_removed' end,
    target_user_id,
    (select username from public.profiles where id = target_user_id),
    null,
    jsonb_build_object('verified', verified)
  );
end;
$$;

create or replace function public.admin_set_listing_featured(target_listing_id uuid, featured boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_level integer := public.current_admin_level();
  owner_level integer;
  listing_title text;
  listing_owner uuid;
begin
  if actor_level < 5 then
    raise exception 'Administrator access required';
  end if;

  select profiles.admin_level, job_listings.role_title, job_listings.owner_id
    into owner_level, listing_title, listing_owner
  from public.job_listings
  join public.profiles on profiles.id = job_listings.owner_id
  where job_listings.id = target_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;
  insert into public.notifications (user_id, actor_id, type, title, body, link_type, link_id)
  select owner_id, auth.uid(), 'listing_featured',
    case when featured then 'Your listing was featured' else 'Featured placement removed' end,
    case when featured then 'Your listing "' || role_title || '" is now featured.' else 'Featured placement was removed from "' || role_title || '".' end,
    'listing', id
  from public.job_listings
  where id = target_listing_id;
  if actor_level < 6 and owner_level >= 5 then
    raise exception 'You cannot feature a listing owned by senior staff';
  end if;

  update public.job_listings
  set is_featured = featured
  where id = target_listing_id;

  if not found then
    raise exception 'Listing not found';
  end if;
  perform public.record_staff_action(
    case when featured then 'listing_featured' else 'listing_unfeatured' end,
    null,
    (select username from public.profiles where id = listing_owner),
    target_listing_id,
    jsonb_build_object(
      'role_title', listing_title,
      'owner_id', listing_owner,
      'owner_level', owner_level
    )
  );
end;
$$;

create or replace function public.moderator_close_listing(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_level integer := public.current_admin_level();
  owner_level integer;
  listing_title text;
begin
  if actor_level < 2 then
    raise exception 'Junior Moderator access required';
  end if;
  select profiles.admin_level, job_listings.role_title into owner_level, listing_title
  from public.job_listings
  join public.profiles on profiles.id = job_listings.owner_id
  where job_listings.id = target_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;
  if actor_level < 6 and owner_level >= actor_level then
    raise exception 'You cannot moderate a listing owned by equal or higher staff';
  end if;
  update public.job_listings set status = 'closed' where id = target_listing_id;
  perform public.record_staff_action(
    'listing_closed',
    null,
    null,
    target_listing_id,
    jsonb_build_object('role_title', listing_title)
  );
end;
$$;

create or replace function public.moderator_delete_listing(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_level integer := public.current_admin_level();
  owner_level integer;
  listing_title text;
begin
  if actor_level < 3 then
    raise exception 'Moderator access required';
  end if;
  select profiles.admin_level, job_listings.role_title into owner_level, listing_title
  from public.job_listings
  join public.profiles on profiles.id = job_listings.owner_id
  where job_listings.id = target_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;
  if actor_level < 6 and owner_level >= actor_level then
    raise exception 'You cannot moderate a listing owned by equal or higher staff';
  end if;
  insert into public.notifications (user_id, actor_id, type, title, body)
  select affected.user_id, auth.uid(), 'listing_removed', 'A listing you followed was removed',
    'The listing "' || affected.role_title || '" was removed after a moderation review.'
  from (
    select distinct job_listings.owner_id as user_id, job_listings.role_title
    from public.job_listings where job_listings.id = target_listing_id
    union
    select applications.applicant_id as user_id, job_listings.role_title
    from public.applications
    join public.job_listings on job_listings.id = applications.job_id
    where job_listings.id = target_listing_id
  ) as affected;
  perform public.record_staff_action(
    'listing_deleted',
    null,
    null,
    target_listing_id,
    jsonb_build_object('role_title', listing_title)
  );
  delete from public.job_listings where id = target_listing_id;
end;
$$;

create or replace function public.moderator_issue_warning(target_user_id uuid, warning_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_level integer := public.current_admin_level();
  target_level integer;
  target_name text;
begin
  if actor_level < 3 then
    raise exception 'Moderator access required';
  end if;
  if warning_reason is null
    or char_length(trim(warning_reason)) < 3
    or char_length(warning_reason) > 1000 then
    raise exception 'Warning reason must be between 3 and 1000 characters';
  end if;
  select profiles.admin_level, profiles.username into target_level, target_name
  from public.profiles where profiles.id = target_user_id;
  if not found then
    raise exception 'Member not found';
  end if;
  if target_user_id = auth.uid() or (actor_level < 6 and target_level >= actor_level) then
    raise exception 'You cannot warn yourself or equal/higher staff';
  end if;
  insert into public.moderation_warnings (target_user_id, issued_by, reason)
  values (target_user_id, auth.uid(), trim(warning_reason));
  insert into public.notifications (user_id, actor_id, type, title, body)
  values (target_user_id, auth.uid(), 'moderation_warning', 'You received a staff warning', trim(warning_reason));
  perform public.record_staff_action(
    'member_warned',
    target_user_id,
    target_name,
    null,
    jsonb_build_object('reason', trim(warning_reason))
  );
end;
$$;

create or replace function public.senior_mod_suspend_profile(
  target_user_id uuid,
  duration_hours integer,
  suspension_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_level integer := public.current_admin_level();
  target_level integer;
  target_name text;
begin
  if actor_level < 4 then
    raise exception 'Senior Moderator access required';
  end if;
  if duration_hours is null then
    raise exception 'Suspension duration is required';
  end if;
  if (actor_level = 6 and (duration_hours < -1 or duration_hours > 8760))
    or (actor_level < 6 and (duration_hours < 0 or duration_hours > 720)) then
    raise exception 'Suspension duration is outside your permitted range';
  end if;
  if duration_hours <> 0
    and (
      suspension_reason is null
      or char_length(trim(suspension_reason)) < 3
      or char_length(suspension_reason) > 1000
    ) then
    raise exception 'Suspension reason must be between 3 and 1000 characters';
  end if;
  select profiles.admin_level, profiles.username into target_level, target_name
  from public.profiles where profiles.id = target_user_id;
  if not found then
    raise exception 'Member not found';
  end if;
  if target_user_id = auth.uid() or (actor_level < 6 and target_level >= actor_level) then
    raise exception 'You cannot suspend yourself or equal/higher staff';
  end if;

  update public.profiles
  set is_suspended = duration_hours <> 0,
      suspended_until = case
        when duration_hours <= 0 then null
        else now() + make_interval(hours => duration_hours)
      end,
      suspension_reason = case when duration_hours = 0 then null else trim(suspension_reason) end
  where id = target_user_id;

  insert into public.notifications (user_id, actor_id, type, title, body)
  values (
    target_user_id,
    auth.uid(),
    case when duration_hours = 0 then 'suspension_lifted' else 'account_suspension' end,
    case when duration_hours = 0 then 'Account suspension lifted' else 'Account temporarily restricted' end,
    case when duration_hours = 0 then 'A staff member lifted the restriction on your account.' else 'Reason: ' || trim(suspension_reason) end
  );
  perform public.record_staff_action(
    case when duration_hours = 0 then 'member_unsuspended' else 'member_suspended' end,
    target_user_id,
    target_name,
    null,
    jsonb_build_object('duration_hours', duration_hours, 'reason', nullif(trim(suspension_reason), ''))
  );
end;
$$;

drop function if exists public.moderator_resolve_report(uuid, text);
create or replace function public.moderator_resolve_report(
  target_report_id uuid,
  new_status text,
  staff_reply text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_row public.moderation_reports%rowtype;
  listing_title text;
begin
  if public.current_admin_level() < 1 then
    raise exception 'Trial Moderator access required';
  end if;
  if new_status not in ('reviewed', 'dismissed') then
    raise exception 'Invalid report status';
  end if;
  if $3 is null or char_length(trim($3)) < 3 or char_length($3) > 1500 then
    raise exception 'A reply between 3 and 1500 characters is required';
  end if;
  select * into report_row
  from public.moderation_reports
  where id = target_report_id and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending report not found';
  end if;
  select role_title into listing_title from public.job_listings where id = report_row.job_id;

  update public.moderation_reports
  set status = new_status, staff_reply = trim($3), resolved_by = auth.uid(), resolved_at = now()
  where id = target_report_id;

  insert into public.notifications (user_id, actor_id, type, title, body, link_type, link_id)
  values (
    report_row.reporter_id,
    auth.uid(),
    'report_update',
    case when new_status = 'dismissed' then 'Report reviewed' else 'Action taken on your report' end,
    coalesce(listing_title, case when report_row.report_type = 'chat' then 'A reported chat conversation' else 'The reported listing' end) || ': ' || trim($3),
    case when report_row.report_type = 'chat' then 'chat' else 'listing' end,
    case when report_row.report_type = 'chat' then report_row.conversation_id else report_row.job_id end
  );
  perform public.record_staff_action(
    'report_' || new_status,
    report_row.reported_user_id,
    null,
    report_row.job_id,
    jsonb_build_object(
      'report_id', target_report_id,
      'report_type', report_row.report_type,
      'staff_reply', trim($3)
    )
  );
end;
$$;

create or replace function public.admin_broadcast_notification(broadcast_title text, broadcast_body text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients integer;
begin
  if public.current_admin_level() < 5 then
    raise exception 'Senior Admin access required';
  end if;
  if broadcast_title is null or char_length(trim(broadcast_title)) < 3 or char_length(broadcast_title) > 100 then
    raise exception 'Notification title must be between 3 and 100 characters';
  end if;
  if broadcast_body is null or char_length(trim(broadcast_body)) < 3 or char_length(broadcast_body) > 2000 then
    raise exception 'Notification message must be between 3 and 2000 characters';
  end if;

  insert into public.notifications (user_id, actor_id, type, title, body)
  select profiles.id, auth.uid(), 'announcement', trim(broadcast_title), trim(broadcast_body)
  from public.profiles;
  get diagnostics recipients = row_count;
  perform public.record_staff_action(
    'community_broadcast_sent',
    null,
    null,
    null,
    jsonb_build_object(
      'title', trim(broadcast_title),
      'message', trim(broadcast_body),
      'recipient_count', recipients
    )
  );
  return recipients;
end;
$$;

create or replace function public.notification_application_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing public.job_listings%rowtype;
begin
  select * into listing from public.job_listings where id = new.job_id;
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, actor_id, type, title, body, link_type, link_id)
    values (
      listing.owner_id,
      new.applicant_id,
      'new_application',
      'New application received',
      'Someone applied for ' || listing.role_title || ' at ' || listing.server_name || '.',
      'application',
      new.id
    );
  elsif new.status is distinct from old.status then
    insert into public.notifications (user_id, actor_id, type, title, body, link_type, link_id)
    values (
      new.applicant_id,
      listing.owner_id,
      'application_update',
      'Application status updated',
      'Your application for ' || listing.role_title || ' is now ' || new.status || '.',
      'application',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists application_notification_event on public.applications;
drop trigger if exists application_notification_insert_event on public.applications;
drop trigger if exists application_notification_update_event on public.applications;
create trigger application_notification_insert_event
  after insert on public.applications
  for each row execute function public.notification_application_event();

create trigger application_notification_update_event
  after update of status on public.applications
  for each row execute function public.notification_application_event();

create or replace function public.notification_listing_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('closed', 'filled') then
    insert into public.notifications (user_id, actor_id, type, title, body, link_type, link_id)
    select recipients.user_id,
      auth.uid(),
      'listing_status',
      'A listing you follow was ' || new.status,
      '"' || new.role_title || '" at ' || new.server_name || ' is now ' || new.status || '.',
      'listing',
      new.id
    from (
      select new.owner_id as user_id
      union
      select applications.applicant_id
      from public.applications
      where applications.job_id = new.id
    ) as recipients;
  end if;
  return new;
end;
$$;

drop trigger if exists job_listing_status_notification on public.job_listings;
create trigger job_listing_status_notification
  after update of status on public.job_listings
  for each row execute function public.notification_listing_status();

create or replace function public.chat_message_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  listing_id uuid;
  listing public.job_listings%rowtype;
begin
  update public.chat_conversations
  set last_message_at = new.created_at
  where id = new.conversation_id
  returning case when owner_id = new.sender_id then applicant_id else owner_id end,
    chat_conversations.listing_id into recipient, listing_id;

  select * into listing from public.job_listings where id = listing_id;
  insert into public.notifications (user_id, actor_id, type, title, body, link_type, link_id)
  values (
    recipient,
    new.sender_id,
    'chat_message',
    'New message',
    'You have a new message about ' || listing.role_title || '.',
    'chat',
    new.conversation_id
  );
  return new;
end;
$$;

drop trigger if exists chat_message_notification_event on public.chat_messages;
create trigger chat_message_notification_event
  after insert on public.chat_messages
  for each row execute function public.chat_message_expiry();

create or replace function public.listing_owner_start_chat(target_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_row public.applications%rowtype;
  conversation_id uuid;
begin
  select * into application_row
  from public.applications
  where id = target_application_id
  for share;
  if not found then
    raise exception 'Application not found';
  end if;
  if not exists (
    select 1 from public.job_listings
    where id = application_row.job_id and owner_id = auth.uid()
  ) then
    raise exception 'Only the listing owner can start this chat';
  end if;
  if application_row.applicant_id = auth.uid() then
    raise exception 'You cannot start a chat with yourself';
  end if;

  insert into public.chat_conversations (application_id, listing_id, owner_id, applicant_id)
  select application_row.id, job_listings.id, job_listings.owner_id, application_row.applicant_id
  from public.job_listings
  where job_listings.id = application_row.job_id
  on conflict (application_id) do update
    set last_message_at = now()
  returning id into conversation_id;

  insert into public.notifications (user_id, actor_id, type, title, body, link_type, link_id)
  values (
    application_row.applicant_id,
    auth.uid(),
    'chat_invitation',
    'An employer opened a chat',
    'The listing owner would like to chat about your application.',
    'chat',
    conversation_id
  );
  return conversation_id;
end;
$$;

create or replace function public.send_chat_message(target_conversation_id uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_id uuid;
begin
  if message_body is null or char_length(trim(message_body)) < 1 or char_length(message_body) > 2000 then
    raise exception 'Message must be between 1 and 2000 characters';
  end if;
  if not exists (
    select 1 from public.chat_conversations
    where id = target_conversation_id
      and (owner_id = auth.uid() or applicant_id = auth.uid())
  ) then
    raise exception 'Chat not found or access denied';
  end if;
  if exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_suspended
      and (suspended_until is null or suspended_until > now())
  ) then
    raise exception 'Suspended accounts cannot send chat messages';
  end if;

  insert into public.chat_messages (conversation_id, sender_id, body)
  values (target_conversation_id, auth.uid(), trim(message_body))
  returning id into message_id;
  return message_id;
end;
$$;

create or replace function public.cleanup_expired_chat_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.chat_messages where expires_at <= now();
  delete from public.chat_conversations
  where last_message_at <= now() - interval '24 hours'
    and not exists (
      select 1 from public.chat_messages
      where chat_messages.conversation_id = chat_conversations.id
    );
  delete from public.notifications where created_at <= now() - interval '20 days';
  delete from public.staff_action_log where created_at <= now() - interval '30 days';
end;
$$;

create or replace function public.owner_set_site_setting(setting_key text, setting_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_value jsonb;
begin
  if public.current_admin_level() < 6 then
    raise exception 'Owner access required';
  end if;
  if setting_key not in ('announcement', 'maintenance_mode') then
    raise exception 'Unknown site setting';
  end if;
  if setting_key = 'maintenance_mode' and jsonb_typeof(setting_value) is distinct from 'boolean' then
    raise exception 'Maintenance mode must be true or false';
  end if;
  select value into previous_value
  from public.site_settings
  where key = setting_key;
  insert into public.site_settings (key, value, updated_by, updated_at)
  values (setting_key, setting_value, auth.uid(), now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform public.record_staff_action(
    'site_setting_changed',
    null,
    null,
    null,
    jsonb_build_object(
      'setting_key', setting_key,
      'previous_value', previous_value,
      'new_value', setting_value
    )
  );
end;
$$;

revoke all on function public.admin_set_member_level(uuid, integer) from public;
revoke all on function public.admin_set_moderator_verified(uuid, boolean) from public;
revoke all on function public.admin_set_listing_featured(uuid, boolean) from public;
revoke all on function public.moderator_close_listing(uuid) from public;
revoke all on function public.moderator_delete_listing(uuid) from public;
revoke all on function public.moderator_issue_warning(uuid, text) from public;
revoke all on function public.senior_mod_suspend_profile(uuid, integer, text) from public;
revoke all on function public.moderator_resolve_report(uuid, text, text) from public;
revoke all on function public.owner_set_site_setting(text, jsonb) from public;
revoke all on function public.admin_broadcast_notification(text, text) from public;
revoke all on function public.listing_owner_start_chat(uuid) from public;
revoke all on function public.send_chat_message(uuid, text) from public;
revoke all on function public.submit_chat_report(uuid, text) from public;
revoke all on function public.cleanup_expired_chat_data() from public;
grant execute on function public.admin_set_member_level(uuid, integer) to authenticated;
grant execute on function public.admin_set_moderator_verified(uuid, boolean) to authenticated;
grant execute on function public.admin_set_listing_featured(uuid, boolean) to authenticated;
grant execute on function public.moderator_close_listing(uuid) to authenticated;
grant execute on function public.moderator_delete_listing(uuid) to authenticated;
grant execute on function public.moderator_issue_warning(uuid, text) to authenticated;
grant execute on function public.senior_mod_suspend_profile(uuid, integer, text) to authenticated;
grant execute on function public.moderator_resolve_report(uuid, text, text) to authenticated;
grant execute on function public.owner_set_site_setting(text, jsonb) to authenticated;
grant execute on function public.admin_broadcast_notification(text, text) to authenticated;
grant execute on function public.listing_owner_start_chat(uuid) to authenticated;
grant execute on function public.send_chat_message(uuid, text) to authenticated;
grant execute on function public.submit_chat_report(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.job_listings enable row level security;
alter table public.applications enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.moderation_warnings enable row level security;
alter table public.site_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.staff_action_log enable row level security;

grant select on public.profiles to authenticated;
grant select on public.job_listings to anon, authenticated;
grant delete on public.job_listings to authenticated;
grant select, insert, update on public.applications to authenticated;
revoke all on public.moderation_reports from anon, authenticated;
revoke all on public.moderation_warnings from anon, authenticated;
revoke all on public.site_settings from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke all on public.chat_conversations from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;
revoke all on public.staff_action_log from anon, authenticated;
grant select, insert on public.moderation_reports to authenticated;
grant select on public.moderation_warnings to authenticated;
grant select on public.site_settings to anon, authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select on public.chat_conversations to authenticated;
grant select on public.chat_messages to authenticated;
grant select on public.staff_action_log to authenticated;

-- Profile role and verification fields are managed by trusted server-side tooling.
revoke update on public.profiles from authenticated;
revoke update (admin_level, is_verified_moderator) on public.profiles from authenticated;
grant update (discord_id, username, avatar_url, bio, portfolio_data)
  on public.profiles to authenticated;

-- Featured listings and application decisions are not applicant-controlled.
revoke insert, update on public.job_listings from authenticated;
grant insert (owner_id, server_name, role_title, description)
  on public.job_listings to authenticated;
grant update (server_name, role_title, description, status)
  on public.job_listings to authenticated;

revoke insert, update on public.applications from authenticated;
grant insert (job_id, applicant_id, experience_summary)
  on public.applications to authenticated;
grant update (status) on public.applications to authenticated;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "Users can create their own base profile" on public.profiles;
create policy "Users can create their own base profile"
  on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and admin_level = 0
    and is_verified_moderator = false
  );

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users can read their warnings and moderators can read warnings" on public.moderation_warnings;
create policy "Users can read their warnings and moderators can read warnings"
  on public.moderation_warnings for select to authenticated
  using (
    target_user_id = (select auth.uid())
    or (select public.current_admin_level()) >= 3
  );

drop policy if exists "Reporters and moderators can read reports" on public.moderation_reports;
create policy "Reporters and moderators can read reports"
  on public.moderation_reports for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or (select public.current_admin_level()) >= 1
  );

drop policy if exists "Active members can submit listing reports" on public.moderation_reports;
create policy "Active members can submit listing reports"
  on public.moderation_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and (profiles.is_suspended = false or profiles.suspended_until <= now())
    )
  );

drop policy if exists "Owners can read site settings" on public.site_settings;
create policy "Owners can read site settings"
  on public.site_settings for select to authenticated
  using ((select public.current_admin_level()) >= 6);

drop policy if exists "Community can read the site announcement" on public.site_settings;
create policy "Community can read the site announcement"
  on public.site_settings for select to anon, authenticated
  using (key in ('announcement', 'maintenance_mode'));

drop policy if exists "Users can read their notifications" on public.notifications;
create policy "Users can read their notifications"
  on public.notifications for select to authenticated
  using (
    user_id = (select auth.uid())
    and created_at > now() - interval '20 days'
  );

drop policy if exists "Users can mark their notifications read" on public.notifications;
create policy "Users can mark their notifications read"
  on public.notifications for update to authenticated
  using (
    user_id = (select auth.uid())
    and created_at > now() - interval '20 days'
  )
  with check (
    user_id = (select auth.uid())
    and created_at > now() - interval '20 days'
  );

drop policy if exists "Senior admins can read staff action history" on public.staff_action_log;
create policy "Senior admins can read staff action history"
  on public.staff_action_log for select to authenticated
  using (
    (select public.current_admin_level()) >= 5
    and created_at > now() - interval '30 days'
  );

drop policy if exists "Chat participants can read conversations" on public.chat_conversations;
create policy "Chat participants can read conversations"
  on public.chat_conversations for select to authenticated
  using (owner_id = (select auth.uid()) or applicant_id = (select auth.uid()));

drop policy if exists "Chat participants can read unexpired messages" on public.chat_messages;
create policy "Chat participants can read unexpired messages"
  on public.chat_messages for select to authenticated
  using (
    expires_at > now()
    and exists (
      select 1 from public.chat_conversations
      where chat_conversations.id = chat_messages.conversation_id
        and (
          chat_conversations.owner_id = (select auth.uid())
          or chat_conversations.applicant_id = (select auth.uid())
        )
    )
  );

drop policy if exists "Anyone can read open job listings" on public.job_listings;
create policy "Anyone can read open job listings"
  on public.job_listings for select to anon, authenticated
  using (
    status = 'open'
    or (select auth.uid()) is not null
    or (select public.current_admin_level()) >= 5
  );

drop policy if exists "Users can create job listings for themselves" on public.job_listings;
create policy "Users can create job listings for themselves"
  on public.job_listings for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and is_featured = false
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and (profiles.is_suspended = false or profiles.suspended_until <= now())
    )
  );

drop policy if exists "Owners can update their job listings" on public.job_listings;
create policy "Owners can update their job listings"
  on public.job_listings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can delete their job listings" on public.job_listings;
create policy "Owners can delete their job listings"
  on public.job_listings for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Applicants and listing owners can read applications" on public.applications;
create policy "Applicants and listing owners can read applications"
  on public.applications for select to authenticated
  using (
    applicant_id = (select auth.uid())
    or exists (
      select 1
      from public.job_listings
      where job_listings.id = applications.job_id
        and job_listings.owner_id = (select auth.uid())
    )
    or (select public.current_admin_level()) >= 5
  );

drop policy if exists "Users can apply as themselves to open jobs" on public.applications;
create policy "Users can apply as themselves to open jobs"
  on public.applications for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and (profiles.is_suspended = false or profiles.suspended_until <= now())
    )
    and exists (
      select 1
      from public.job_listings
      where job_listings.id = applications.job_id
        and job_listings.status = 'open'
    )
  );

drop policy if exists "Listing owners can update application status" on public.applications;
create policy "Listing owners can update application status"
  on public.applications for update to authenticated
  using (
    exists (
      select 1
      from public.job_listings
      where job_listings.id = applications.job_id
        and job_listings.owner_id = (select auth.uid())
    )
    or (select public.current_admin_level()) >= 5
  )
  with check (
    exists (
      select 1
      from public.job_listings
      where job_listings.id = applications.job_id
        and job_listings.owner_id = (select auth.uid())
    )
    or (select public.current_admin_level()) >= 5
  );

create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid)
from cron.job
where jobname = 'modlink-expire-chat-data';

select cron.schedule(
  'modlink-expire-chat-data',
  '*/15 * * * *',
  'select public.cleanup_expired_chat_data()'
);

-- Levels 0-6: User, Trial Mod, Jr Mod, Mod, Sr Mod, Sr Admin, Owner.

with required_tables(table_name) as (
  values
    ('profiles'),
    ('job_listings'),
    ('applications'),
    ('moderation_reports'),
    ('moderation_warnings'),
    ('site_settings'),
    ('notifications'),
    ('chat_conversations'),
    ('chat_messages'),
    ('staff_action_log')
)
select
  table_name,
  to_regclass(format('public.%I', table_name)) is not null as exists_in_public_schema
from required_tables
order by table_name;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles',
    'job_listings',
    'applications',
    'moderation_reports',
    'moderation_warnings',
    'site_settings',
    'notifications',
    'chat_conversations',
    'chat_messages',
    'staff_action_log'
  )
order by table_name, ordinal_position;
