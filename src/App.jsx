import { useCallback, useEffect, useState } from 'react';
import AdminGuard from './components/AdminGuard.jsx';
import FloatingSupport from './components/FloatingSupport.jsx';
import Header from './components/Header.jsx';
import JobFeed from './components/JobFeed.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import NotificationsPanel from './components/NotificationsPanel.jsx';
import ProfilePanel from './components/ProfilePanel.jsx';
import { EmployerPanel } from './components/WorkspacePanels.jsx';
import { getPromotionReviewCandidates } from './lib/staffPromotion.js';
import { isSupabaseConfigured, supabaseClient } from './lib/supabaseClient.js';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [reports, setReports] = useState([]);
  const [staffActions, setStaffActions] = useState([]);
  const [promotionActivity, setPromotionActivity] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [settings, setSettings] = useState({});
  const [announcement, setAnnouncement] = useState('');
  const [publicAd, setPublicAd] = useState(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [focusListingId, setFocusListingId] = useState(null);
  const [activeView, setActiveView] = useState('opportunities');
  const [authBusy, setAuthBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!supabaseClient) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setMessage('');
    });

    supabaseClient.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setMessage(`Unable to restore your session: ${error.message}`);
        setLoading(false);
        return;
      }
      setSession(data.session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!supabaseClient) return;
    setLoading(true);
    setMessage('');

    const jobsRequest = supabaseClient
      .from('job_listings')
      .select('*')
      .order('created_at', { ascending: false });

    const requests = [jobsRequest];
    if (session?.user) {
      requests.push(
        supabaseClient
          .from('applications')
          .select('id, job_id, applicant_id, experience_summary, status, created_at, job_listings!inner(id, owner_id, server_name, role_title), profiles!applications_applicant_id_fkey(username, avatar_url, bio, portfolio_data, is_verified_moderator)')
          .order('created_at', { ascending: false }),
        supabaseClient
          .from('profiles')
          .select('id, discord_id, username, avatar_url, bio, portfolio_data, admin_level, is_verified_moderator, suspended_until, suspension_reason, is_suspended')
          .eq('id', session.user.id)
          .maybeSingle(),
        supabaseClient
          .from('notifications')
          .select('*, actor:profiles!notifications_actor_id_fkey(username, admin_level)')
          .order('created_at', { ascending: false })
          .limit(100),
        supabaseClient
          .from('chat_conversations')
          .select('id, application_id, listing_id, owner_id, applicant_id, created_at, last_message_at, owner:profiles!chat_conversations_owner_id_fkey(username, avatar_url), applicant:profiles!chat_conversations_applicant_id_fkey(username, avatar_url), job:job_listings!chat_conversations_listing_id_fkey(server_name, role_title)')
          .order('last_message_at', { ascending: false }),
      );
    }

    const results = await Promise.all(requests);
    const jobsResult = results[0];
    if (jobsResult.error) {
      setMessage(`Unable to load opportunities: ${jobsResult.error.message}`);
      setLoading(false);
      return;
    }
    setJobs(jobsResult.data || []);
    const { data: publicSettings, error: announcementError } = await supabaseClient
      .from('site_settings')
      .select('key, value')
      .in('key', ['announcement', 'maintenance_mode', 'ad_slot']);
    if (announcementError) setMessage(`Unable to load site announcement: ${announcementError.message}`);
    else {
      const publicSettingsByKey = Object.fromEntries((publicSettings || []).map((item) => [item.key, item.value]));
      setAnnouncement(typeof publicSettingsByKey.announcement === 'string' ? publicSettingsByKey.announcement : '');
      setMaintenanceMode(publicSettingsByKey.maintenance_mode === true);
      const adSetting = publicSettingsByKey.ad_slot;
      setPublicAd(adSetting && typeof adSetting === 'object' && adSetting.enabled === true ? adSetting : null);
    }

    if (session?.user) {
      const applicationsResult = results[1];
      const profileResult = results[2];
      const notificationsResult = results[3];
      const conversationsResult = results[4];
      if (applicationsResult.error) {
        setMessage(`Unable to load applications: ${applicationsResult.error.message}`);
      } else {
        setApplications(applicationsResult.data || []);
      }
      if (profileResult.error) {
        setMessage(`Unable to load your profile: ${profileResult.error.message}`);
      } else {
        setProfile(profileResult.data);
      }
      if (notificationsResult.error) setMessage(`Unable to load notifications: ${notificationsResult.error.message}`);
      else setNotifications(notificationsResult.data || []);
      if (conversationsResult.error) setMessage(`Unable to load chats: ${conversationsResult.error.message}`);
      else setConversations(conversationsResult.data || []);
      const { data: warningData, error: warningsError } = await supabaseClient
        .from('moderation_warnings')
        .select('id, reason, created_at')
        .eq('target_user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (warningsError) setMessage(`Unable to load your moderation notices: ${warningsError.message}`);
      else setWarnings(warningData || []);

      if (!profileResult.error && (profileResult.data?.admin_level ?? 0) >= 5) {
        const [profilesResult, reportsResult, settingsResult, staffActionsResult, promotionActivityResult] = await Promise.all([
          supabaseClient.from('profiles')
            .select('id, discord_id, username, avatar_url, admin_level, is_verified_moderator, suspended_until, suspension_reason, is_suspended')
            .order('username'),
          supabaseClient.from('moderation_reports')
            .select('id, job_id, conversation_id, reported_user_id, report_type, chat_excerpt, reporter_id, reason, staff_reply, status, created_at, job_listings(id, owner_id, server_name, role_title, description, status), profiles!moderation_reports_reporter_id_fkey(username), reported_user:profiles!moderation_reports_reported_user_id_fkey(username), resolved_staff:profiles!moderation_reports_resolved_by_fkey(username), conversation:chat_conversations!moderation_reports_conversation_id_fkey(id, owner_id, applicant_id, job:job_listings!chat_conversations_listing_id_fkey(role_title, server_name))')
            .order('created_at', { ascending: false }),
          (profileResult.data?.admin_level ?? 0) >= 6
            ? supabaseClient.from('site_settings').select('key, value')
            : Promise.resolve({ data: [], error: null }),
          supabaseClient.from('staff_action_log')
            .select('id, actor_id, actor_name, target_user_id, target_name, target_listing_id, action, details, created_at')
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(200),
          supabaseClient.rpc('admin_promotion_activity'),
        ]);
        if (profilesResult.error) setMessage(`Unable to load member directory: ${profilesResult.error.message}`);
        else setProfiles(profilesResult.data || []);
        if (reportsResult.error) setMessage(`Unable to load moderation queue: ${reportsResult.error.message}`);
        else setReports(reportsResult.data || []);
        if (settingsResult.error) setMessage(`Unable to load site settings: ${settingsResult.error.message}`);
        else setSettings(Object.fromEntries((settingsResult.data || []).map((item) => [item.key, item.value])));
        if (staffActionsResult.error) setMessage(`Unable to load staff action history: ${staffActionsResult.error.message}`);
        else setStaffActions(staffActionsResult.data || []);
        if (promotionActivityResult.error) {
          setMessage(`Unable to load promotion readiness data: ${promotionActivityResult.error.message}`);
          setPromotionActivity([]);
        } else setPromotionActivity(promotionActivityResult.data || []);
      } else {
        const level = profileResult.data?.admin_level ?? 0;
        if (level >= 3) {
          const { data, error } = await supabaseClient.from('profiles')
            .select('id, discord_id, username, avatar_url, admin_level, is_verified_moderator, suspended_until, suspension_reason, is_suspended')
            .order('username');
          if (error) setMessage(`Unable to load member directory: ${error.message}`);
          else setProfiles(data || []);
        } else setProfiles([]);
        if (level >= 1) {
          const { data, error } = await supabaseClient
            .from('moderation_reports')
            .select('id, job_id, conversation_id, reported_user_id, report_type, chat_excerpt, reporter_id, reason, staff_reply, status, created_at, job_listings(id, owner_id, server_name, role_title, description, status), profiles!moderation_reports_reporter_id_fkey(username), reported_user:profiles!moderation_reports_reported_user_id_fkey(username), resolved_staff:profiles!moderation_reports_resolved_by_fkey(username), conversation:chat_conversations!moderation_reports_conversation_id_fkey(id, owner_id, applicant_id, job:job_listings!chat_conversations_listing_id_fkey(role_title, server_name))')
            .order('created_at', { ascending: false });
          if (error) setMessage(`Unable to load moderation queue: ${error.message}`);
          else setReports(data || []);
        } else {
          setReports([]);
          setWarnings([]);
        }
        setSettings({});
        setStaffActions([]);
        setPromotionActivity([]);
      }
    } else {
      setApplications([]);
      setProfile(null);
      setProfiles([]);
      setReports([]);
      setStaffActions([]);
      setPromotionActivity([]);
      setWarnings([]);
      setSettings({});
      setNotifications([]);
      setConversations([]);
      setAnnouncement('');
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!supabaseClient || !session?.user) return undefined;
    let active = true;
    const refreshNotifications = async () => {
      const { data, error } = await supabaseClient
        .from('notifications')
        .select('*, actor:profiles!notifications_actor_id_fkey(username, admin_level)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!active) return;
      if (error) setMessage(`Unable to refresh notifications: ${error.message}`);
      else setNotifications(data || []);
    };
    const timer = window.setInterval(refreshNotifications, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [session?.user?.id]);

  async function handleSignIn() {
    if (!supabaseClient) {
      setMessage('Add your Supabase URL and anon key to .env, then restart the dev server to enable Discord sign-in.');
      return;
    }
    setAuthBusy(true);
    setMessage('');
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
    if (error) setMessage(`Discord sign-in failed: ${error.message}`);
    setAuthBusy(false);
  }

  async function handleSignOut() {
    if (!supabaseClient) return;
    setAuthBusy(true);
    const { error } = await supabaseClient.auth.signOut();
    if (error) setMessage(`Sign-out failed: ${error.message}`);
    else {
      setActiveView('opportunities');
      setNotice('You have signed out.');
    }
    setAuthBusy(false);
  }

  async function handleApply(job, experienceSummary) {
    const { error } = await supabaseClient
      .from('applications')
      .insert({ job_id: job.id, applicant_id: session.user.id, experience_summary: experienceSummary });
    if (error) {
      setMessage(error.code === '23505'
        ? 'You have already applied to this listing.'
        : `Unable to submit your application: ${error.message}`);
      return false;
    }

    setNotice(`Your application for ${job.role_title} was sent.`);
    await loadData();
    return true;
  }

  async function handleReport(job, reason) {
    if (!session?.user) {
      setMessage('Sign in with Discord to report a listing.');
      return false;
    }
    const { error } = await supabaseClient
      .from('moderation_reports')
      .insert({ job_id: job.id, reporter_id: session.user.id, reason });
    if (error) {
      setMessage(`Unable to submit report: ${error.message}`);
      return false;
    }
    setNotice('Thanks. Your report was sent to the moderation team.');
    return true;
  }

  async function handleReportStaffAction(notification, details) {
    const staffId = notification.actor_id;
    if (!session?.user || !staffId || staffId === session.user.id) {
      setMessage('This staff action cannot be reported from this account.');
      return false;
    }
    const reason = [
      details.trim().slice(0, 450),
      '',
      `Reported notification: ${notification.title}\nAction details: ${notification.body}`.slice(0, 500),
    ].join('\n').trim().slice(0, 1000);
    const { error } = await supabaseClient.from('moderation_reports').insert({
      report_type: 'staff_conduct',
      reported_user_id: staffId,
      reporter_id: session.user.id,
      reason,
    });
    if (error) {
      setMessage(`Unable to submit staff conduct report: ${error.message}`);
      return false;
    }
    setNotice('Your report was sent for review by a higher-ranked administrator.');
    return true;
  }

  async function handleStartChat(application) {
    const { data, error } = await supabaseClient.rpc('listing_owner_start_chat', {
      target_application_id: application.id,
    });
    if (error) {
      setMessage(`Unable to open chat: ${error.message}`);
      return;
    }
    setSelectedConversationId(data);
    setActiveView('messages');
    setNotice('A private 24-hour chat is ready.');
    await loadData();
  }

  async function handleChatReport(conversationId, reason) {
    const { error } = await supabaseClient.rpc('submit_chat_report', {
      target_conversation_id: conversationId,
      report_reason: reason,
    });
    if (error) {
      setMessage(`Unable to report conversation: ${error.message}`);
      return false;
    }
    setNotice('Your report was sent to the moderation team.');
    await loadData();
    return true;
  }

  async function handleMarkNotificationRead(notificationId) {
    const readAt = new Date().toISOString();
    const { error } = await supabaseClient
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', notificationId);
    if (error) {
      setMessage(`Unable to update notification: ${error.message}`);
      return false;
    }
    setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, read_at: readAt } : item));
    return true;
  }

  async function handleMarkAllNotificationsRead() {
    const readAt = new Date().toISOString();
    const { error } = await supabaseClient
      .from('notifications')
      .update({ read_at: readAt })
      .is('read_at', null);
    if (error) setMessage(`Unable to update notifications: ${error.message}`);
    else setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
  }

  async function handleOpenNotification(notification) {
    const markedRead = notification.read_at ? true : await handleMarkNotificationRead(notification.id);
    if (!markedRead) return;
    if (notification.link_type === 'chat') {
      setSelectedConversationId(notification.link_id);
      setActiveView('messages');
    } else if (notification.link_type === 'listing') {
      setFocusListingId(notification.link_id);
      setActiveView('opportunities');
    } else if (notification.link_type === 'application') {
      setActiveView(notification.type === 'new_application' ? 'employer' : 'applications');
    }
  }

  async function handleCreateJob(values) {
    const { error } = await supabaseClient
      .from('job_listings')
      .insert({ ...values, owner_id: session.user.id });
    if (error) {
      setMessage(`Unable to publish listing: ${error.message}`);
      return false;
    }
    setNotice('Your role is now listed in open opportunities.');
    await loadData();
    return true;
  }

  async function handleSaveProfile(values) {
    const existingPortfolio = profile?.portfolio_data;
    const portfolioData = existingPortfolio && typeof existingPortfolio === 'object' && !Array.isArray(existingPortfolio)
      ? { ...existingPortfolio }
      : {};
    if (values.website) portfolioData.website = values.website;
    else delete portfolioData.website;
    const { data, error } = await supabaseClient
      .from('profiles')
      .update({ username: values.username, bio: values.bio, portfolio_data: portfolioData })
      .eq('id', session.user.id)
      .select('id, discord_id, username, avatar_url, bio, portfolio_data, admin_level, is_verified_moderator, suspended_until, suspension_reason, is_suspended')
      .single();
    if (error) {
      setMessage(`Unable to save profile: ${error.message}`);
      return false;
    }
    setProfile(data);
    setNotice('Your profile has been updated.');
    return true;
  }

  async function handleUpdateJob(jobId, status) {
    const { error } = await supabaseClient.from('job_listings').update({ status }).eq('id', jobId);
    if (error) setMessage(`Unable to update listing: ${error.message}`);
    else {
      setNotice('Listing status updated.');
      await loadData();
    }
  }

  async function handleUpdateApplication(applicationId, status) {
    const { error } = await supabaseClient.from('applications').update({ status }).eq('id', applicationId);
    if (error) setMessage(`Unable to update application: ${error.message}`);
    else {
      setNotice('Application status updated.');
      await loadData();
    }
  }

  async function handleAdminAction(rpcName, args, successMessage) {
    const { error } = await supabaseClient.rpc(rpcName, args);
    if (error) {
      setMessage(`Unable to complete admin action: ${error.message}`);
      return false;
    }
    else {
      setNotice(successMessage);
      await loadData();
      return true;
    }
  }

  async function handleBroadcast(title, body) {
    const { data, error } = await supabaseClient.rpc('admin_broadcast_notification', {
      broadcast_title: title,
      broadcast_body: body,
    });
    if (error) {
      setMessage(`Unable to send notification: ${error.message}`);
      return false;
    }
    setNotice(`Notification sent to ${data} account${data === 1 ? '' : 's'}.`);
    await loadData();
    return true;
  }

  async function handleSaveSetting(key, value) {
    return handleAdminAction('owner_set_site_setting', { setting_key: key, setting_value: value }, 'Site setting saved.');
  }

  const adminLevel = profile?.admin_level ?? 0;
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const adminReviewCount = adminLevel >= 5
    ? getPromotionReviewCandidates(profiles, promotionActivity, adminLevel).length
    : 0;
  const ownedApplications = applications.filter((application) =>
    application.job_listings?.owner_id === session?.user?.id,
  );
  const displayName = profile?.username || session?.user?.user_metadata?.full_name || 'Discord member';

  if (maintenanceMode && adminLevel < 6) {
    return (
      <div className="maintenance-page">
        <a className="brand" href="/" aria-label="ModLink home"><span className="brand__mark" aria-hidden="true">M</span><span>mod<span className="brand__accent">link</span></span></a>
        <main className="maintenance-card">
          <span className="maintenance-card__icon" aria-hidden="true">⚙</span>
          <p className="eyebrow">WE’LL BE RIGHT BACK</p>
          <h1>ModLink is under maintenance.</h1>
          <p>We’re making a few improvements to the community. Please check back soon.</p>
          {session
            ? <button className="button button--outline" onClick={handleSignOut} disabled={authBusy}>{authBusy ? 'Signing out…' : 'Sign out'}</button>
            : <button className="button button--primary" onClick={handleSignIn} disabled={authBusy}>{authBusy ? 'Connecting…' : 'Staff sign in'}</button>}
        </main>
        {message && <p className="maintenance-error" role="alert">{message}</p>}
        <a className="maintenance-support" href="https://dsc.gg/modlinkdc" target="_blank" rel="noreferrer">Need help? Contact support</a>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header
        user={session?.user}
        displayName={displayName}
        profile={profile}
        activeView={activeView}
        onNavigate={setActiveView}
        adminLevel={adminLevel}
        adminReviewCount={adminReviewCount}
        unreadCount={unreadCount}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        authBusy={authBusy}
      />
      <main>
        {activeView === 'opportunities' && (
          <>
            <section className="hero">
              <div className="hero__content">
                <span className="hero__badge"><span aria-hidden="true">✦</span> THE COMMUNITY STAFF NETWORK</span>
                <h1>Discord moderator jobs<br />for <span>great communities.</span></h1>
                <p className="hero__copy">
                  Find Discord moderator and community staff jobs, meet experienced teams, and discover your next opportunity to make online communities better.
                </p>
                <div className="hero__actions">
                  <a className="button button--primary button--large" href="#opportunities">
                    Explore opportunities <span aria-hidden="true">→</span>
                  </a>
                  <button className="button button--outline button--large" onClick={session ? () => setActiveView('employer') : handleSignIn} disabled={authBusy}>
                    {session ? 'Post a staff role' : 'Join the community'}
                  </button>
                </div>
                <div className="hero__proof">
                  <span className="proof-avatars" aria-hidden="true"><span>J</span><span>M</span><span>A</span><span>+</span></span>
                  <span>Built for the people behind the communities</span>
                </div>
              </div>
              <div className="hero__visual" aria-hidden="true">
                <div className="orbit orbit--outer" /><div className="orbit orbit--inner" />
                <div className="visual-card visual-card--main">
                  <span className="visual-card__icon">✦</span><div className="visual-card__lines"><i /><i /><i /></div><span className="visual-card__check">✓</span>
                </div>
                <div className="visual-card visual-card--floating"><span className="status-dot" /><span>Community first</span></div>
                <span className="sparkle sparkle--one">✦</span><span className="sparkle sparkle--two">✧</span>
              </div>
            </section>
            <div className="stats-bar" aria-label="ModLink community">
              <div><strong>Find</strong><span>your next role</span></div>
              <div><strong>Meet</strong><span>your next teammate</span></div>
              <div><strong>Build</strong><span>healthier communities</span></div>
            </div>
            {announcement && <p className="site-announcement"><span aria-hidden="true">✦</span>{announcement}</p>}
            {publicAd?.enabled && publicAd.title && /^https:\/\//i.test(publicAd.url || '') && (
              <a className="sponsored-placement" href={publicAd.url} target="_blank" rel="sponsored noopener noreferrer">
                <span className="sponsored-placement__label">SPONSORED · {publicAd.sponsor || 'COMMUNITY PARTNER'}</span>
                <span className="sponsored-placement__title">{publicAd.title}</span>
                {publicAd.description && <span className="sponsored-placement__copy">{publicAd.description}</span>}
                <span className="sponsored-placement__cta">Learn more ↗</span>
              </a>
            )}
            {isSupabaseConfigured && <JobFeed jobs={jobs} focusListingId={focusListingId} onClearFocus={() => setFocusListingId(null)} loading={loading} user={session?.user} profile={profile} onApply={handleApply} onReport={handleReport} onSignIn={handleSignIn} />}
            {!isSupabaseConfigured && (
              <p className="config-notice" role="status">
                Supabase isn’t configured yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code>, then restart Vite to enable accounts and live listings.
              </p>
            )}
          </>
        )}

        {activeView === 'employer' && session && (
          <EmployerPanel user={session.user} profile={profile} jobs={jobs} applications={ownedApplications} conversations={conversations} onStartChat={handleStartChat} onCreateJob={handleCreateJob} onUpdateJob={handleUpdateJob} onUpdateApplication={handleUpdateApplication} />
        )}
        {activeView === 'profile' && session && (
          <ProfilePanel
            profile={profile}
            displayName={displayName}
            applications={applications.filter((application) => application.applicant_id === session.user.id)}
            listings={jobs.filter((job) => job.owner_id === session.user.id)}
            conversations={conversations}
            unreadCount={unreadCount}
            onSaveProfile={handleSaveProfile}
            onNavigate={setActiveView}
          />
        )}
        {activeView === 'notifications' && session && (
          <NotificationsPanel
            notifications={notifications}
            onOpen={handleOpenNotification}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
            onReportStaffAction={handleReportStaffAction}
          />
        )}
        {activeView === 'messages' && session && (
          <ChatPanel
            conversations={conversations}
            currentUserId={session.user.id}
            selectedConversationId={selectedConversationId}
            onSelectConversation={setSelectedConversationId}
            onReportChat={handleChatReport}
            onRefresh={loadData}
          />
        )}
        {activeView === 'applications' && session && (
          <section className="workspace-section">
            <div className="section-heading">
              <div><p className="eyebrow">YOUR ACTIVITY</p><h2>My applications</h2><p className="section-heading__copy">Keep track of the roles you’ve applied for.</p></div>
            </div>
            <div className="panel-list">
              {warnings.length > 0 && (
                <section className="warning-list" aria-labelledby="warning-title">
                  <h3 id="warning-title">Moderation notices</h3>
                  {warnings.map((warning) => (
                    <article className="warning-card" key={warning.id}>
                      <p>{warning.reason}</p>
                      <small>Issued {new Date(warning.created_at).toLocaleDateString()}</small>
                    </article>
                  ))}
                </section>
              )}
              {applications.filter((application) => application.applicant_id === session.user.id).map((application) => (
                <article className="panel application-row" key={application.id}>
                  <div className="application-row__copy"><h3>{application.job_listings?.role_title || 'Staff role'}</h3><p>{application.job_listings?.server_name}</p><small>Applied {new Date(application.created_at).toLocaleDateString()}</small></div>
                  <span className={`state-pill state-pill--${application.status}`}>{application.status}</span>
                </article>
              ))}
              {!applications.some((application) => application.applicant_id === session.user.id) && <div className="empty-state"><h3>No applications yet</h3><p>Explore open opportunities and apply to find your next community.</p><button className="button button--primary" onClick={() => setActiveView('opportunities')}>Explore roles</button></div>}
            </div>
          </section>
        )}
        {activeView === 'admin' && (
          <AdminGuard minLevel={1} profile={profile}>
            <AdminPanel
              currentProfile={profile}
              profiles={profiles}
              jobs={jobs}
              reports={reports}
              staffActions={staffActions}
              promotionActivity={promotionActivity}
              applications={applications}
              settings={settings}
              onCloseListing={(jobId) => handleAdminAction('moderator_close_listing', { target_listing_id: jobId }, 'Listing closed.')}
              onDeleteListing={(jobId) => handleAdminAction('moderator_delete_listing', { target_listing_id: jobId }, 'Listing permanently deleted.')}
              onWarn={(targetId, reason) => handleAdminAction('moderator_issue_warning', { target_user_id: targetId, warning_reason: reason }, 'Warning issued.')}
              onSuspend={(targetId, hours, reason) => handleAdminAction('senior_mod_suspend_profile', { target_user_id: targetId, duration_hours: hours, suspension_reason: reason }, hours ? 'Profile suspended.' : 'Profile suspension removed.')}
              onSetAdminLevel={(targetId, level) => handleAdminAction('admin_set_member_level', { target_user_id: targetId, new_level: level }, 'Member role updated.')}
              onSetVerified={(targetId, verified) => handleAdminAction('admin_set_moderator_verified', { target_user_id: targetId, verified }, verified ? 'Moderator verified.' : 'Moderator verification removed.')}
              onSetFeatured={(jobId, featured) => handleAdminAction('admin_set_listing_featured', { target_listing_id: jobId, featured }, featured ? 'Listing featured.' : 'Featured status removed.')}
              onResolveReport={(reportId, status, reply) => handleAdminAction('moderator_resolve_report', { target_report_id: reportId, new_status: status, staff_reply: reply }, `Report ${status} and response sent.`)}
              onSaveSetting={handleSaveSetting}
              onBroadcast={handleBroadcast}
            />
          </AdminGuard>
        )}

        {(message || notice) && (
          <div className={`toast${message ? ' toast--error' : ''}`} role={message ? 'alert' : 'status'}>
            <span>{message || notice}</span><button type="button" onClick={() => { setMessage(''); setNotice(''); }} aria-label="Dismiss notification">×</button>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <a className="brand brand--footer" href="/" aria-label="ModLink home"><span className="brand__mark" aria-hidden="true">M</span><span>mod<span className="brand__accent">link</span></span></a>
        <span>Made for the people who make communities.</span>
      </footer>
      <FloatingSupport />
    </div>
  );
}
