import { useCallback, useEffect, useState } from 'react';
import AdminGuard from './components/AdminGuard.jsx';
import FloatingSupport from './components/FloatingSupport.jsx';
import Header from './components/Header.jsx';
import JobFeed from './components/JobFeed.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import NotificationsPanel from './components/NotificationsPanel.jsx';
import ContactPanel from './components/ContactPanel.jsx';
import AffiliatePanel from './components/AffiliatePanel.jsx';
import ProfilePanel from './components/ProfilePanel.jsx';
import SponsoredCampaign from './components/SponsoredCampaign.jsx';
import { EmployerPanel } from './components/WorkspacePanels.jsx';
import { getPromotionReviewCandidates } from './lib/staffPromotion.js';
import { isSupabaseConfigured, supabaseClient } from './lib/supabaseClient.js';

const trackedAdEvents = new Set();

function readAffiliateCode() {
  const urlCode = new URLSearchParams(window.location.search).get('ref')?.trim().toLowerCase();
  if (urlCode && /^[a-f0-9]{12}$/.test(urlCode)) {
    try {
      window.localStorage.setItem('modlink-affiliate-referral', JSON.stringify({
        code: urlCode,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }));
    } catch {
      return urlCode;
    }
    return urlCode;
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem('modlink-affiliate-referral') || 'null');
    if (stored?.expiresAt > Date.now() && /^[a-f0-9]{12}$/.test(stored.code)) return stored.code;
    window.localStorage.removeItem('modlink-affiliate-referral');
  } catch {
    return null;
  }
  return null;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [reports, setReports] = useState([]);
  const [staffActions, setStaffActions] = useState([]);
  const [promotionActivity, setPromotionActivity] = useState([]);
  const [prInquiries, setPrInquiries] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [settings, setSettings] = useState({});
  const [announcement, setAnnouncement] = useState('');
  const [adCampaigns, setAdCampaigns] = useState([]);
  const [adminAdCampaigns, setAdminAdCampaigns] = useState([]);
  const [adCampaignStats, setAdCampaignStats] = useState([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState([]);
  const [notificationPreferences, setNotificationPreferences] = useState({ weekly_digest: false, role_keywords: [] });
  const [affiliateDashboard, setAffiliateDashboard] = useState({ application: null, account: null, referral_count: 0, commissions: [] });
  const [ownerAffiliateDashboard, setOwnerAffiliateDashboard] = useState({ applications: [], accounts: [], commissions: [] });
  const [affiliateReferralCode] = useState(readAffiliateCode);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [focusListingId, setFocusListingId] = useState(() => new URLSearchParams(window.location.search).get('listing'));
  const [activeView, setActiveView] = useState('opportunities');
  const [contactTopic, setContactTopic] = useState('general');
  const [authBusy, setAuthBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const syncListingFromUrl = () => setFocusListingId(new URLSearchParams(window.location.search).get('listing'));
    window.addEventListener('popstate', syncListingFromUrl);
    return () => window.removeEventListener('popstate', syncListingFromUrl);
  }, []);

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
          .select('id, discord_id, username, avatar_url, bio, portfolio_data, admin_level, is_verified_moderator, is_pr_manager, suspended_until, suspension_reason, is_suspended')
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
        supabaseClient
          .from('user_notification_preferences')
          .select('weekly_digest_enabled, role_keywords')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        supabaseClient.rpc('my_affiliate_dashboard'),
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
      .in('key', ['announcement', 'maintenance_mode']);
    if (announcementError) setMessage(`Unable to load site announcement: ${announcementError.message}`);
    else {
      const publicSettingsByKey = Object.fromEntries((publicSettings || []).map((item) => [item.key, item.value]));
      setAnnouncement(typeof publicSettingsByKey.announcement === 'string' ? publicSettingsByKey.announcement : '');
      setMaintenanceMode(publicSettingsByKey.maintenance_mode === true);
    }
    const { data: activeAdCampaigns, error: campaignsError } = await supabaseClient
      .from('ad_campaigns')
      .select('id, advertiser_name, title, description, destination_url, media_type, media_url, placements, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (campaignsError) {
      const signedInLevel = session?.user ? results[2]?.data?.admin_level ?? 0 : 0;
      if (signedInLevel >= 6) {
        setMessage(`Unable to load advertising campaigns. Run the latest supabase-setup.sql to install the ad campaign table. Details: ${campaignsError.message}`);
      }
      setAdCampaigns([]);
    } else setAdCampaigns(activeAdCampaigns || []);

    if (session?.user) {
      const applicationsResult = results[1];
      const profileResult = results[2];
      const notificationsResult = results[3];
      const conversationsResult = results[4];
      const preferencesResult = results[5];
      const affiliateResult = results[6];
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
      if (preferencesResult.error) setMessage(`Unable to load notification preferences: ${preferencesResult.error.message}`);
      else setNotificationPreferences({
        weekly_digest: preferencesResult.data?.weekly_digest_enabled ?? false,
        role_keywords: preferencesResult.data?.role_keywords ?? [],
      });
      if (affiliateResult.error) setMessage(`Unable to load your affiliate status: ${affiliateResult.error.message}`);
      else setAffiliateDashboard(affiliateResult.data || { application: null, account: null, referral_count: 0, commissions: [] });
      const { data: warningData, error: warningsError } = await supabaseClient
        .from('moderation_warnings')
        .select('id, reason, created_at')
        .eq('target_user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (warningsError) setMessage(`Unable to load your moderation notices: ${warningsError.message}`);
      else setWarnings(warningData || []);
      const { data: prInquiryData, error: prInquiryError } = await supabaseClient
        .from('pr_inquiries')
        .select('id, requester_id, topic, subject, message, status, staff_reply, handled_by, created_at, resolved_at, requester:profiles!pr_inquiries_requester_id_fkey(username), handler:profiles!pr_inquiries_handled_by_fkey(username)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (prInquiryError) {
        setMessage(`Unable to load PR inquiries: ${prInquiryError.message}`);
        setPrInquiries([]);
      } else setPrInquiries(prInquiryData || []);

      if (!profileResult.error && (profileResult.data?.admin_level ?? 0) >= 5) {
        const [profilesResult, reportsResult, settingsResult, staffActionsResult, promotionActivityResult, adCampaignsResult, adStatsResult, webhookDeliveriesResult, affiliateDashboardResult] = await Promise.all([
          supabaseClient.from('profiles')
            .select('id, discord_id, username, avatar_url, admin_level, is_verified_moderator, is_pr_manager, suspended_until, suspension_reason, is_suspended')
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
          (profileResult.data?.admin_level ?? 0) >= 6
            ? supabaseClient.from('ad_campaigns').select('*').order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          (profileResult.data?.admin_level ?? 0) >= 6
            ? supabaseClient.rpc('owner_ad_campaign_stats')
            : Promise.resolve({ data: [], error: null }),
          (profileResult.data?.admin_level ?? 0) >= 6
            ? supabaseClient.rpc('owner_recent_discord_webhook_deliveries')
            : Promise.resolve({ data: [], error: null }),
          (profileResult.data?.admin_level ?? 0) >= 6
            ? supabaseClient.rpc('owner_affiliate_dashboard')
            : Promise.resolve({ data: { applications: [], accounts: [], commissions: [] }, error: null }),
        ]);
        if (profilesResult.error) setMessage(`Unable to load member directory: ${profilesResult.error.message}`);
        else setProfiles(profilesResult.data || []);
        if (reportsResult.error) setMessage(`Unable to load moderation queue: ${reportsResult.error.message}`);
        else setReports(reportsResult.data || []);
        if (settingsResult.error) setMessage(`Unable to load site settings: ${settingsResult.error.message}`);
        else setSettings(Object.fromEntries((settingsResult.data || []).map((item) => [item.key, item.value])));
        if (adCampaignsResult.error) setMessage(`Unable to load ad campaigns: ${adCampaignsResult.error.message}`);
        else setAdminAdCampaigns(adCampaignsResult.data || []);
        if (adStatsResult.error) setMessage(`Unable to load ad campaign metrics: ${adStatsResult.error.message}`);
        else setAdCampaignStats(adStatsResult.data || []);
        if (webhookDeliveriesResult.error) setMessage(`Unable to load Discord delivery status: ${webhookDeliveriesResult.error.message}`);
        else setWebhookDeliveries(webhookDeliveriesResult.data || []);
        if (affiliateDashboardResult.error) setMessage(`Unable to load affiliate program data: ${affiliateDashboardResult.error.message}`);
        else setOwnerAffiliateDashboard(affiliateDashboardResult.data || { applications: [], accounts: [], commissions: [] });
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
            .select('id, discord_id, username, avatar_url, admin_level, is_verified_moderator, is_pr_manager, suspended_until, suspension_reason, is_suspended')
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
        setAdminAdCampaigns([]);
        setAdCampaignStats([]);
        setWebhookDeliveries([]);
        setOwnerAffiliateDashboard({ applications: [], accounts: [], commissions: [] });
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
      setAdminAdCampaigns([]);
      setAdCampaignStats([]);
      setWebhookDeliveries([]);
      setNotificationPreferences({ weekly_digest: false, role_keywords: [] });
      setAffiliateDashboard({ application: null, account: null, referral_count: 0, commissions: [] });
      setOwnerAffiliateDashboard({ applications: [], accounts: [], commissions: [] });
      setNotifications([]);
      setConversations([]);
      setPrInquiries([]);
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
    const { error } = await supabaseClient.rpc('submit_job_application', {
      target_job_id: job.id,
      experience_text: experienceSummary,
    });
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

  async function handleSubmitPrInquiry(topic, subject, inquiryMessage) {
    const { error } = await supabaseClient.rpc('submit_pr_inquiry', {
      inquiry_topic: topic,
      inquiry_subject: subject,
      inquiry_message: inquiryMessage,
      provided_referral_code: topic === 'advertising' ? affiliateReferralCode : null,
    });
    if (error) {
      setMessage(`Unable to send PR inquiry: ${error.message}`);
      return false;
    }
    setNotice('Your inquiry was sent to the PR team. You can track replies here.');
    await loadData();
    return true;
  }

  async function handleAnswerPrInquiry(inquiryId, reply) {
    const { error } = await supabaseClient.rpc('answer_pr_inquiry', {
      target_inquiry_id: inquiryId,
      reply_message: reply,
    });
    if (error) {
      setMessage(`Unable to reply to PR inquiry: ${error.message}`);
      return false;
    }
    setNotice('Your reply was sent to the requester.');
    await loadData();
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
      handleOpenListing(notification.link_id);
      setActiveView('opportunities');
    } else if (notification.link_type === 'application') {
      setActiveView(notification.type === 'new_application' ? 'employer' : 'applications');
    } else if (notification.link_type === 'pr_inquiry') {
      await loadData();
      setActiveView('pr-contact');
    } else if (notification.link_type === 'digest') {
      setActiveView('opportunities');
    }
  }

  async function handleCreateJob(values) {
    const { error } = await supabaseClient.rpc('create_job_listing', {
      listing_server_name: values.server_name,
      listing_role_title: values.role_title,
      listing_description: values.description,
      listing_category: values.category,
      listing_responsibilities: values.responsibilities,
      listing_requirements: values.requirements,
      listing_experience_level: values.experience_level,
      listing_time_commitment: values.time_commitment,
      listing_location: values.location,
      listing_compensation_type: values.compensation_type,
      listing_compensation_details: values.compensation_details,
    });
    if (error) {
      setMessage(`Unable to publish listing: ${error.message}`);
      return false;
    }
    setNotice('Your role is now listed in open opportunities.');
    await loadData();
    return true;
  }

  async function handleRenewJob(jobId) {
    const { error } = await supabaseClient.rpc('renew_job_listing', { target_listing_id: jobId });
    if (error) {
      setMessage(`Unable to renew listing: ${error.message}`);
      return false;
    }
    setNotice('Listing renewed for another 30 days.');
    await loadData();
    return true;
  }

  async function refreshAffiliateDashboards() {
    const { data: personalData, error: personalError } = await supabaseClient.rpc('my_affiliate_dashboard');
    if (personalError) {
      setMessage(`Unable to refresh affiliate dashboard: ${personalError.message}`);
      return false;
    }
    setAffiliateDashboard(personalData || { application: null, account: null, referral_count: 0, commissions: [] });
    if ((profile?.admin_level ?? 0) >= 6) {
      const { data: ownerData, error: ownerError } = await supabaseClient.rpc('owner_affiliate_dashboard');
      if (ownerError) {
        setMessage(`Unable to refresh Owner affiliate dashboard: ${ownerError.message}`);
        return false;
      }
      setOwnerAffiliateDashboard(ownerData || { applications: [], accounts: [], commissions: [] });
    }
    return true;
  }

  async function handleApplyAffiliate(reason, channels) {
    const { error } = await supabaseClient.rpc('submit_affiliate_application', {
      application_reason: reason,
      application_channels: channels,
    });
    if (error) {
      setMessage(`Unable to submit affiliate application: ${error.message}`);
      return false;
    }
    setNotice('Affiliate application submitted for Owner review.');
    await refreshAffiliateDashboards();
    return true;
  }

  async function handleReviewAffiliateApplication(userId, decision) {
    const { error } = await supabaseClient.rpc('owner_review_affiliate_application', {
      target_user_id: userId,
      decision,
    });
    if (error) {
      setMessage(`Unable to ${decision} affiliate application: ${error.message}`);
      return false;
    }
    setNotice(decision === 'approve' ? 'Affiliate approved and referral link created.' : 'Affiliate application rejected.');
    await refreshAffiliateDashboards();
    return true;
  }

  async function handleRecordAffiliateCommission(commission) {
    const { error } = await supabaseClient.rpc('owner_record_affiliate_commission', {
      target_affiliate_user_id: commission.affiliate_user_id,
      target_referral_id: commission.referral_id,
      commission_description: commission.description,
      commission_amount: commission.amount,
      commission_notes: commission.notes,
    });
    if (error) {
      setMessage(`Unable to record affiliate commission: ${error.message}`);
      return false;
    }
    setNotice('Pending affiliate commission recorded.');
    await refreshAffiliateDashboards();
    return true;
  }

  async function handleSetAffiliateCommissionStatus(id, status) {
    const { error } = await supabaseClient.rpc('owner_set_affiliate_commission_status', {
      target_commission_id: id,
      new_status: status,
    });
    if (error) {
      setMessage(`Unable to update affiliate commission: ${error.message}`);
      return false;
    }
    setNotice(status === 'paid' ? 'Commission marked paid externally.' : `Commission ${status}.`);
    await refreshAffiliateDashboards();
    return true;
  }

  async function handleSaveNotificationPreferences(preferences) {
    const { data, error } = await supabaseClient.rpc('save_notification_preferences', {
      weekly_digest_enabled: preferences.weekly_digest,
      role_keywords: preferences.role_keywords,
    });
    if (error) {
      setMessage(`Unable to save notification preferences: ${error.message}`);
      return false;
    }
    setNotificationPreferences({
      weekly_digest: data.weekly_digest,
      role_keywords: data.role_keywords,
    });
    setNotice('Notification preferences saved.');
    return true;
  }

  function handleOpenListing(jobId) {
    const url = new URL(window.location.href);
    url.searchParams.set('listing', jobId);
    window.history.pushState({}, '', url);
    setFocusListingId(jobId);
  }

  function handleClearListingFocus() {
    const url = new URL(window.location.href);
    url.searchParams.delete('listing');
    window.history.replaceState({}, '', url);
    setFocusListingId(null);
  }

  async function handleAdEvent(campaignId, eventKind) {
    const day = new Date().toISOString().slice(0, 10);
    const storageKey = `modlink-ad-${eventKind}-${campaignId}-${day}`;
    if (trackedAdEvents.has(storageKey)) return;
    try {
      if (window.sessionStorage.getItem(storageKey)) {
        trackedAdEvents.add(storageKey);
        return;
      }
      window.sessionStorage.setItem(storageKey, '1');
    } catch {
      // Storage may be disabled by browser privacy settings; still record the event.
    }
    trackedAdEvents.add(storageKey);
    const { error } = await supabaseClient.rpc('record_ad_campaign_event', {
      target_campaign_id: campaignId,
      event_kind: eventKind,
    });
    if (error) {
      trackedAdEvents.delete(storageKey);
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        setMessage(`Unable to record ad ${eventKind}: ${error.message}`);
        return;
      }
      setMessage(`Unable to record ad ${eventKind}: ${error.message}`);
    }
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
      .select('id, discord_id, username, avatar_url, bio, portfolio_data, admin_level, is_verified_moderator, is_pr_manager, suspended_until, suspension_reason, is_suspended')
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

  async function handleSaveAdCampaign(campaignId, campaignValue) {
    return handleAdminAction(
      'owner_save_ad_campaign',
      { campaign_id: campaignId, campaign_value: campaignValue },
      campaignValue.is_active ? 'Ad campaign published.' : 'Ad campaign saved as a draft.',
    );
  }

  async function handleTestDiscordWebhook() {
    const { data, error } = await supabaseClient.rpc('owner_test_discord_webhook');
    if (error) {
      setMessage(`Unable to queue Discord webhook test: ${error.message}`);
      return null;
    }
    setNotice(`Discord test alert queued (request ${data}). Check the target channel; delivery is asynchronous.`);
    return data;
  }

  async function handleDeleteAdCampaign(campaignId) {
    return handleAdminAction(
      'owner_delete_ad_campaign',
      { campaign_id: campaignId },
      'Ad campaign deleted.',
    );
  }

  const adminLevel = profile?.admin_level ?? 0;
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const prInboxCount = prInquiries.filter((inquiry) => inquiry.status === 'pending' && inquiry.requester_id !== session?.user?.id).length;
  const adminReviewCount = adminLevel >= 5
    ? getPromotionReviewCandidates(profiles, promotionActivity, adminLevel).length
    : 0;
  const ownedApplications = applications.filter((application) =>
    application.job_listings?.owner_id === session?.user?.id,
  );
  const displayName = profile?.username || session?.user?.user_metadata?.full_name || 'Discord member';
  const openJobs = jobs
    .filter((job) => job.status === 'open'
      && new Date(job.expires_at) > new Date()
      && !job.expired_at)
    .sort((first, second) => new Date(second.created_at) - new Date(first.created_at));
  const featuredJobs = openJobs.filter((job) => job.is_featured);
  const focusedJob = openJobs.find((job) => job.id === focusListingId);
  const listingCanonical = new URL(import.meta.env.BASE_URL, window.location.origin);
  if (focusedJob) listingCanonical.searchParams.set('listing', focusedJob.id);
  const jobPosting = focusedJob ? {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: focusedJob.role_title,
    description: focusedJob.description,
    datePosted: focusedJob.created_at,
    validThrough: focusedJob.expires_at,
    directApply: true,
    identifier: {
      '@type': 'PropertyValue',
      name: focusedJob.server_name,
      value: focusedJob.id,
    },
    hiringOrganization: {
      '@type': 'Organization',
      name: focusedJob.server_name,
    },
    url: listingCanonical.href,
  } : null;
  const homepageJobList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Open Discord community staff opportunities on ModLink',
    numberOfItems: openJobs.length,
    itemListElement: openJobs.slice(0, 20).map((job, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: `${job.role_title} at ${job.server_name}`,
      description: job.description || `Open ${job.role_title} opportunity at ${job.server_name}.`,
    })),
  };

  useEffect(() => {
    const title = focusedJob
      ? `${focusedJob.role_title} at ${focusedJob.server_name} | ModLink`
      : 'Discord Moderator Jobs & Community Staff Roles | ModLink';
    const description = focusedJob
      ? `${focusedJob.description.slice(0, 145)}${focusedJob.description.length > 145 ? '…' : ''}`
      : 'Find Discord moderator jobs, gaming server staff roles, and online community management opportunities with ModLink.';
    document.title = title;
    const updateMeta = (selector, attribute, value) => {
      const element = document.querySelector(selector);
      if (element) element.setAttribute(attribute, value);
    };
    updateMeta('meta[name="description"]', 'content', description);
    updateMeta('meta[property="og:title"]', 'content', title);
    updateMeta('meta[property="og:description"]', 'content', description);
    updateMeta('meta[name="twitter:title"]', 'content', title);
    updateMeta('meta[name="twitter:description"]', 'content', description);
    updateMeta('meta[property="og:url"]', 'content', listingCanonical.href);
    updateMeta('link[rel="canonical"]', 'href', listingCanonical.href);
  }, [focusedJob, listingCanonical.href]);

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
        prInboxCount={prInboxCount}
        unreadCount={unreadCount}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        authBusy={authBusy}
      />
      <main>
        {jobPosting && <script type="application/ld+json">{JSON.stringify(jobPosting).replaceAll('<', '\\u003c')}</script>}
        {activeView === 'opportunities' && (
          <>
            <section className="hero">
              <div className="hero__content">
                <span className="hero__badge"><span aria-hidden="true">✦</span> THE DISCORD COMMUNITY STAFF NETWORK</span>
                <h1>Discord moderator jobs for <span>great communities.</span></h1>
                <p className="hero__copy">
                  Explore Discord moderator jobs and community staff roles—from moderation and support to community leadership. Meet the teams behind gaming communities and help make online spaces better.
                </p>
                <div className="hero__actions">
                  <a className="button button--primary button--large" href="#opportunities">
                    Browse open roles <span aria-hidden="true">→</span>
                  </a>
                  <button className="button button--outline button--large" onClick={session ? () => setActiveView('employer') : handleSignIn} disabled={authBusy}>
                    {session ? 'Post a staff role' : 'Hire community staff'}
                  </button>
                </div>
                <div className="hero__trust">
                  <span><span aria-hidden="true">✓</span> Discord-first hiring</span>
                  <span><span aria-hidden="true">✓</span> Roles from community teams</span>
                  <span><span aria-hidden="true">✓</span> Apply with your experience</span>
                </div>
              </div>
              <div className="hero__visual" aria-label="ModLink Discord community roles overview">
                <div className="hero-orbit hero-orbit--one" aria-hidden="true" />
                <div className="hero-orbit hero-orbit--two" aria-hidden="true" />
                <article className="hero-opportunity-card">
                  <div className="hero-opportunity-card__top">
                    <span className="hero-opportunity-card__icon" aria-hidden="true">M</span>
                    <span className="hero-opportunity-card__live"><i /> {loading ? 'Finding roles' : `${openJobs.length} open ${openJobs.length === 1 ? 'role' : 'roles'}`}</span>
                  </div>
                  <p className="eyebrow">COMMUNITY OPPORTUNITIES</p>
                  <h2>{featuredJobs[0]?.role_title || 'Find your place on the team'}</h2>
                  <p className="hero-opportunity-card__server">{featuredJobs[0]?.server_name || 'Moderation · support · community'}</p>
                  <div className="hero-opportunity-card__divider" />
                  <div className="hero-opportunity-card__bottom">
                    <span><span aria-hidden="true">✦</span> {featuredJobs.length ? 'Featured opportunity' : 'A better way to find your team'}</span>
                    <a href="#opportunities" aria-label="Explore Discord community staff roles">Explore <span aria-hidden="true">↗</span></a>
                  </div>
                  {featuredJobs[0]?.description && <p className="hero-opportunity-card__description">{featuredJobs[0].description}</p>}
                </article>
                <div className="hero-float-card hero-float-card--top"><span className="hero-float-card__sparkle" aria-hidden="true">✦</span><span><strong>Built for Discord</strong><small>Community teams start here</small></span></div>
                <div className="hero-float-card hero-float-card--bottom"><span className="hero-float-card__check" aria-hidden="true">✓</span><span><strong>Your next chapter</strong><small>Find a role that fits</small></span></div>
                <div className="hero-visual-glow" aria-hidden="true" />
                <span className="hero-visual-spark hero-visual-spark--one" aria-hidden="true">✦</span>
                <span className="hero-visual-spark hero-visual-spark--two" aria-hidden="true">✧</span>
              </div>
            </section>
            <div className="stats-bar stats-bar--live" aria-label="Live ModLink opportunity summary">
              <div><strong>{loading ? '—' : openJobs.length}</strong><span>open staff {openJobs.length === 1 ? 'role' : 'roles'}</span></div>
              <div><strong>{loading ? '—' : featuredJobs.length}</strong><span>featured {featuredJobs.length === 1 ? 'opportunity' : 'opportunities'}</span></div>
              <div><strong>Discord</strong><span>moderator & community teams</span></div>
            </div>
            <section className="home-role-strip" aria-label="Community staff roles">
              <span>Find your next opportunity</span>
              <div>
                <span>Discord moderator jobs</span>
                <span>Community manager roles</span>
                <span>Gaming server staff</span>
                <span>Online community support</span>
              </div>
            </section>
            {announcement && <p className="site-announcement"><span aria-hidden="true">✦</span>{announcement}</p>}
            {adCampaigns.some((campaign) => campaign.placements?.includes('homepage')) && (
              <div className="sponsored-grid" aria-label="Sponsored campaigns">
                {adCampaigns
                  .filter((campaign) => campaign.placements?.includes('homepage'))
                  .map((campaign) => <SponsoredCampaign campaign={campaign} onEvent={handleAdEvent} key={campaign.id} />)}
              </div>
            )}
            <section className="sponsored-placement sponsored-placement--empty" aria-label="Advertising opportunity">
              <span className="sponsored-placement__label">ADVERTISING OPPORTUNITY</span>
              <span className="sponsored-placement__title">Reach Discord community teams</span>
              <span className="sponsored-placement__copy">Ask the PR team about image, video, and text placements on ModLink.</span>
              <button className="sponsored-placement__cta button" type="button" onClick={() => { setContactTopic('advertising'); setActiveView('pr-contact'); }}>Ask about advertising ↗</button>
            </section>
            {isSupabaseConfigured && <JobFeed
              jobs={jobs}
              ads={adCampaigns}
              focusListingId={focusListingId}
              onOpenListing={handleOpenListing}
              onCloseListing={handleClearListingFocus}
              onAdEvent={handleAdEvent}
              loading={loading}
              user={session?.user}
              profile={profile}
              onApply={handleApply}
              onReport={handleReport}
              onSignIn={handleSignIn}
            />}
            {!isSupabaseConfigured && (
              <p className="config-notice" role="status">
                Supabase isn’t configured yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code>, then restart Vite to enable accounts and live listings.
              </p>
            )}
            <section className="home-how-it-works" aria-labelledby="home-how-heading">
              <div className="home-section-heading">
                <p className="eyebrow">A BETTER WAY TO BUILD YOUR TEAM</p>
                <h2 id="home-how-heading">Good communities grow with good people.</h2>
                <p>Whether you’re looking for your first moderator role or building a trusted staff team, ModLink brings Discord community opportunities together in one place.</p>
              </div>
              <div className="home-benefit-grid">
                <article className="home-benefit-card">
                  <span className="home-benefit-card__icon" aria-hidden="true">⌕</span>
                  <p className="eyebrow">FOR COMMUNITY STAFF</p>
                  <h3>Find a role that fits you</h3>
                  <p>Discover open Discord moderator, server staff, community support, and leadership opportunities. Search role titles and server descriptions, then share your relevant experience when you apply.</p>
                  <a href="#opportunities">Explore open opportunities <span aria-hidden="true">→</span></a>
                </article>
                <article className="home-benefit-card home-benefit-card--accent">
                  <span className="home-benefit-card__icon" aria-hidden="true">✦</span>
                  <p className="eyebrow">FOR COMMUNITY OWNERS</p>
                  <h3>Meet your next teammate</h3>
                  <p>Publish a staff opening for your Discord server, explain the role and expectations, and review applications from people ready to help your community thrive.</p>
                  <button type="button" onClick={session ? () => setActiveView('employer') : handleSignIn} disabled={authBusy}>
                    {session ? 'Create a staff listing' : 'Sign in to post a role'} <span aria-hidden="true">→</span>
                  </button>
                </article>
              </div>
            </section>
            <section className="home-faq" aria-labelledby="home-faq-heading">
              <div className="home-section-heading">
                <p className="eyebrow">MODLINK FAQ</p>
                <h2 id="home-faq-heading">Questions about Discord staff roles?</h2>
              </div>
              <div className="home-faq__list">
                <details>
                  <summary>What is ModLink?</summary>
                  <p>ModLink is a hiring hub for Discord moderators and online community staff. Community teams can post openings, and applicants can find roles and submit their experience.</p>
                </details>
                <details>
                  <summary>What kinds of community jobs can I find?</summary>
                  <p>Listings are posted by community teams and can include Discord moderator, server staff, community support, and other community-management roles. Search open listings for the roles and communities that interest you.</p>
                </details>
                <details>
                  <summary>How do I apply for a Discord moderator role?</summary>
                  <p>Browse open opportunities, select a role to review its description, then sign in with Discord to submit your application and relevant experience.</p>
                </details>
                <details>
                  <summary>How can my Discord server hire staff?</summary>
                  <p>Sign in with Discord, choose “Post a role,” and publish an opening with your server name, role title, and description. You can review applications in your workspace.</p>
                </details>
              </div>
            </section>
            {isSupabaseConfigured && !loading && openJobs.length > 0 && (
              <script type="application/ld+json">{JSON.stringify(homepageJobList)}</script>
            )}
          </>
        )}

        {activeView === 'employer' && session && (
          <EmployerPanel user={session.user} profile={profile} jobs={jobs} applications={ownedApplications} conversations={conversations} onStartChat={handleStartChat} onCreateJob={handleCreateJob} onUpdateJob={handleUpdateJob} onUpdateApplication={handleUpdateApplication} onRenewJob={handleRenewJob} />
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
            notificationPreferences={notificationPreferences}
            onSaveNotificationPreferences={handleSaveNotificationPreferences}
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
        {activeView === 'pr-contact' && (
          <ContactPanel
            user={session?.user}
            profile={profile}
            inquiries={prInquiries}
            initialTopic={contactTopic}
            affiliateReferralCode={affiliateReferralCode}
            onSignIn={handleSignIn}
            onSubmit={handleSubmitPrInquiry}
            onAnswer={handleAnswerPrInquiry}
            onRefresh={loadData}
          />
        )}
        {activeView === 'affiliates' && (
          <AffiliatePanel
            dashboard={affiliateDashboard}
            onApply={handleApplyAffiliate}
            onSignIn={handleSignIn}
            user={session?.user}
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
                  <span className={`state-pill state-pill--${application.status}`}>{{ pending: 'New', reviewing: 'Reviewing', interview: 'Interview', accepted: 'Accepted', rejected: 'Declined' }[application.status] || application.status}</span>
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
              onSetPrManager={(targetId, enabled) => handleAdminAction('owner_set_pr_manager', { target_user_id: targetId, enabled }, enabled ? 'PR Manager access granted.' : 'PR Manager access removed.')}
              applications={applications}
              settings={settings}
              adCampaigns={adminAdCampaigns}
              adCampaignStats={adCampaignStats}
              webhookDeliveries={webhookDeliveries}
              affiliateDashboard={ownerAffiliateDashboard}
              onReviewAffiliateApplication={handleReviewAffiliateApplication}
              onRecordAffiliateCommission={handleRecordAffiliateCommission}
              onSetAffiliateCommissionStatus={handleSetAffiliateCommissionStatus}
              onRefreshWebhookStatus={loadData}
              onCloseListing={(jobId) => handleAdminAction('moderator_close_listing', { target_listing_id: jobId }, 'Listing closed.')}
              onDeleteListing={(jobId) => handleAdminAction('moderator_delete_listing', { target_listing_id: jobId }, 'Listing permanently deleted.')}
              onWarn={(targetId, reason) => handleAdminAction('moderator_issue_warning', { target_user_id: targetId, warning_reason: reason }, 'Warning issued.')}
              onSuspend={(targetId, hours, reason) => handleAdminAction('senior_mod_suspend_profile', { target_user_id: targetId, duration_hours: hours, suspension_reason: reason }, hours ? 'Profile suspended.' : 'Profile suspension removed.')}
              onSetAdminLevel={(targetId, level) => handleAdminAction('admin_set_member_level', { target_user_id: targetId, new_level: level }, 'Member role updated.')}
              onSetVerified={(targetId, verified) => handleAdminAction('admin_set_moderator_verified', { target_user_id: targetId, verified }, verified ? 'Moderator verified.' : 'Moderator verification removed.')}
              onSetFeatured={(jobId, featured) => handleAdminAction('admin_set_listing_featured', { target_listing_id: jobId, featured }, featured ? 'Listing featured.' : 'Featured status removed.')}
              onResolveReport={(reportId, status, reply) => handleAdminAction('moderator_resolve_report', { target_report_id: reportId, new_status: status, staff_reply: reply }, `Report ${status} and response sent.`)}
              onSaveSetting={handleSaveSetting}
              onSaveAdCampaign={handleSaveAdCampaign}
              onDeleteAdCampaign={handleDeleteAdCampaign}
              onTestDiscordWebhook={handleTestDiscordWebhook}
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
