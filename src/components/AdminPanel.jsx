import { useEffect, useState } from 'react';
import AdminGuard from './AdminGuard.jsx';
import { getPromotionReviewCandidates, isPromotionCaseworkAction } from '../lib/staffPromotion.js';

const ROLES = ['User', 'Trial Mod', 'Jr Mod', 'Mod', 'Sr Mod', 'Sr Admin', 'Owner'];
const ACTION_LABELS = {
  staff_rank_changed: 'Staff rank changed',
  moderator_verified: 'Moderator verified',
  moderator_verification_removed: 'Moderator verification removed',
  listing_featured: 'Listing featured',
  listing_unfeatured: 'Featured placement removed',
  listing_closed: 'Listing closed',
  listing_deleted: 'Listing deleted',
  member_warned: 'Member warned',
  member_suspended: 'Member suspended',
  member_unsuspended: 'Member suspension lifted',
  report_reviewed: 'Report resolved',
  report_dismissed: 'Report dismissed',
  community_broadcast_sent: 'Community broadcast sent',
  site_setting_changed: 'Site setting changed',
  pr_manager_role_changed: 'PR Manager access changed',
  pr_inquiry_answered: 'PR inquiry answered',
};

function formatAuditValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function PermissionSection({ id, minLevel, profile, title, description, children }) {
  return (
    <AdminGuard minLevel={minLevel} profile={profile}>
      <section className="admin-subsection" id={id}>
        <div className="subsection-heading"><h3>{title}</h3><span>Level {minLevel}+</span></div>
        {description && <p className="admin-subsection__description">{description}</p>}
        {children}
      </section>
    </AdminGuard>
  );
}

export default function AdminPanel({
  currentProfile,
  profiles,
  jobs,
  reports,
  staffActions,
  promotionActivity,
  applications,
  settings,
  onCloseListing,
  onDeleteListing,
  onWarn,
  onSuspend,
  onSetAdminLevel,
  onSetVerified,
  onSetFeatured,
  onResolveReport,
  onSetPrManager,
  onSaveSetting,
  onBroadcast,
}) {
  const [announcement, setAnnouncement] = useState(settings.announcement || '');
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [reportReplies, setReportReplies] = useState({});
  const [selectedListing, setSelectedListing] = useState(null);
  const [suspendHours, setSuspendHours] = useState('24');
  const [saving, setSaving] = useState(false);
  const [reportStatus, setReportStatus] = useState('pending');
  const [reportType, setReportType] = useState('all');
  const [reportSearch, setReportSearch] = useState('');
  const [listingStatus, setListingStatus] = useState('all');
  const [listingSearch, setListingSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [prManagerSearch, setPrManagerSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditType, setAuditType] = useState('all');
  const [adSlot, setAdSlot] = useState({
    enabled: false,
    sponsor: '',
    title: '',
    description: '',
    url: '',
    ...(settings.ad_slot || {}),
  });
  const rank = currentProfile?.admin_level ?? 0;
  const canAssign = (member) => member.id !== currentProfile?.id
    && (rank === 6 ? member.admin_level <= 5 : member.admin_level <= 3);
  const pendingReports = reports.filter((report) => report.status === 'pending').length;
  const openListings = jobs.filter((job) => job.status === 'open').length;
  const activeApplications = applications.filter((application) => ['pending', 'reviewing'].includes(application.status)).length;
  const promotionCandidates = getPromotionReviewCandidates(profiles, promotionActivity, rank);
  const reviewableActions = staffActions.filter((action) => isPromotionCaseworkAction(action.action));
  const filteredAudit = staffActions.filter((entry) => {
    if (auditType !== 'all' && entry.action !== auditType) return false;
    const query = auditSearch.trim().toLowerCase();
    return !query || [
      entry.actor_name,
      entry.target_name,
      entry.action.replaceAll('_', ' '),
      JSON.stringify(entry.details || {}),
    ].some((value) => value?.toLowerCase().includes(query));
  });
  const activityByDay = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - index));
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    return {
      day,
      count: staffActions.filter((action) => {
        const createdAt = new Date(action.created_at);
        return createdAt >= day && createdAt < nextDay;
      }).length,
    };
  });
  const peakActivity = Math.max(1, ...activityByDay.map((item) => item.count));
  const newListings30d = jobs.filter((job) => new Date(job.created_at) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length;
  const newApplications30d = applications.filter((application) => new Date(application.created_at) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length;
  const filteredReports = reports.filter((report) => {
    if (reportStatus !== 'all' && report.status !== reportStatus) return false;
    if (reportType !== 'all' && report.report_type !== reportType) return false;
    const query = reportSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      report.reason,
      report.job_listings?.role_title,
      report.job_listings?.server_name,
      report.conversation?.job?.role_title,
      report.conversation?.job?.server_name,
      report.profiles?.username,
      report.reported_user?.username,
    ].some((value) => value?.toLowerCase().includes(query));
  });
  const filteredListings = jobs.filter((job) => {
    if (listingStatus !== 'all' && job.status !== listingStatus) return false;
    const query = listingSearch.trim().toLowerCase();
    return !query || `${job.role_title} ${job.server_name}`.toLowerCase().includes(query);
  });
  const filterMembers = (members) => members.filter((member) =>
    `${member.username} ${member.discord_id || ''}`.toLowerCase().includes(memberSearch.trim().toLowerCase()),
  );

  useEffect(() => {
    setAnnouncement(settings.announcement || '');
  }, [settings.announcement]);

  useEffect(() => {
    setAdSlot({
      enabled: false,
      sponsor: '',
      title: '',
      description: '',
      url: '',
      ...(settings.ad_slot || {}),
    });
  }, [settings.ad_slot]);

  async function saveAdSlot(event) {
    event.preventDefault();
    setSaving(true);
    await onSaveSetting('ad_slot', adSlot);
    setSaving(false);
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    setSaving(true);
    await onSaveSetting('announcement', announcement);
    setSaving(false);
  }

  async function toggleMaintenance() {
    setMaintenanceSaving(true);
    await onSaveSetting('maintenance_mode', settings.maintenance_mode !== true);
    setMaintenanceSaving(false);
  }

  async function sendBroadcast(event) {
    event.preventDefault();
    setSaving(true);
    const sent = await onBroadcast(broadcastTitle, broadcastBody);
    setSaving(false);
    if (sent) {
      setBroadcastTitle('');
      setBroadcastBody('');
    }
  }

  async function setPrManager(member) {
    setSaving(true);
    await onSetPrManager(member.id, !member.is_pr_manager);
    setSaving(false);
  }

  return (
    <section className="workspace-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MODERATION & STAFF</p>
          <h2>Staff workspace</h2>
          <p className="section-heading__copy">Your controls are determined by your verified staff rank.</p>
        </div>
        <span className="admin-level-pill">Level {rank} · {ROLES[rank]}</span>
      </div>
      <div className={`admin-stat-grid${rank < 5 ? ' admin-stat-grid--compact' : ''}`}>
        <a className="panel admin-stat" href="#admin-reports"><span>Needs review</span><strong>{pendingReports}</strong><small>Open moderation queue →</small></a>
        <div className="panel admin-stat"><span>Your access</span><strong>{rank}</strong><small>{ROLES[rank]}</small></div>
        {rank >= 2 && <a className="panel admin-stat" href="#admin-listings"><span>Open listings</span><strong>{openListings}</strong><small>Review job posts →</small></a>}
        {rank >= 3 && <a className="panel admin-stat" href="#admin-members"><span>Active applications</span><strong>{activeApplications}</strong><small>Review staff & members →</small></a>}
        {rank >= 5 && <a className="panel admin-stat" href="#admin-audit"><span>Staff actions · 30 days</span><strong>{staffActions.length}</strong><small>Review audit trail →</small></a>}
      </div>

      <PermissionSection id="admin-reports" minLevel={1} profile={currentProfile} title="Moderation queue" description="Search, filter, and review reports about listings and private chats.">
        <div className="admin-filter-bar">
          <label className="search-field">
            <span className="sr-only">Search reports</span><span aria-hidden="true">⌕</span>
            <input value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="Search reports, listings, or members" />
          </label>
          <label className="admin-filter-select">Status
            <select value={reportStatus} onChange={(event) => setReportStatus(event.target.value)}>
              <option value="pending">Needs review</option><option value="reviewed">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All reports</option>
            </select>
          </label>
          <label className="admin-filter-select">Type
            <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
              <option value="all">All types</option><option value="listing">Listings</option><option value="chat">Chats</option><option value="staff_conduct">Staff conduct</option>
            </select>
          </label>
        </div>
        <div className="panel-list">
          {filteredReports.map((report) => {
            const ownStaffReport = report.report_type === 'staff_conduct' && report.reporter_id === currentProfile?.id;
            return (
              <article className="panel moderation-report" key={report.id}>
              <div className="moderation-report__content">
                <div className="application-row__heading">
                  {report.report_type === 'chat' ? (
                    <div>
                      <h4>Reported conversation</h4>
                      <span className="job-card__server">
                        {report.conversation?.job?.role_title || 'Private chat'}
                        {report.conversation?.job?.server_name ? ` · ${report.conversation.job.server_name}` : ''}
                        {' · reported account: '}{report.reported_user?.username || 'Discord member'}
                      </span>
                    </div>
                  ) : report.report_type === 'staff_conduct' ? (
                    <div>
                      <h4>Staff conduct report</h4>
                      <span className="job-card__server">Reported staff member: {report.reported_user?.username || 'Staff account'}</span>
                    </div>
                  ) : report.job_listings ? (
                    <button className="report-listing-link" onClick={() => setSelectedListing(report.job_listings)}>
                      {report.job_listings.role_title} <span>↗ View listing</span>
                    </button>
                  ) : <h4>Removed listing</h4>}
                  {report.report_type === 'listing' && <span className="job-card__server">{report.job_listings?.server_name || 'Listing unavailable'}</span>}
                </div>
                <p>{report.reason}</p>
                <small>Reported by {report.profiles?.username || 'Discord member'} · {new Date(report.created_at).toLocaleDateString()}</small>
                {report.status !== 'pending' && (
                  <div className="admin-report-resolution">
                    <span className={`state-pill state-pill--${report.status}`}>{report.status}{report.resolved_staff?.username ? ` · reviewed by ${report.resolved_staff.username}` : ''}</span>
                    {report.staff_reply && <p><strong>Staff reply:</strong> {report.staff_reply}</p>}
                  </div>
                )}
                {report.report_type === 'chat' && (
                  <div className="reported-chat-excerpt">
                    <strong>Recent messages captured with this report</strong>
                    {report.chat_excerpt?.length ? report.chat_excerpt.map((message, index) => (
                      <p key={`${message.created_at}-${index}`}>
                        <b>{message.sender_id === report.reporter_id ? 'Reporter' : 'Reported member'}</b>
                        <span>{message.body}</span>
                        <small>{new Date(message.created_at).toLocaleString()}</small>
                      </p>
                    )) : <p>No unexpired messages were available when the report was submitted.</p>}
                  </div>
                )}
                {report.status === 'pending' && ownStaffReport
                  ? <p className="admin-subsection__description">You submitted this report. Another eligible Senior Admin must review it.</p>
                  : report.status === 'pending' && (
                    <label className="report-reply">
                      <span>Your response (sent privately to the reporter)</span>
                      <textarea rows={2} maxLength={1500} minLength={3} value={reportReplies[report.id] || ''} onChange={(event) => setReportReplies({ ...reportReplies, [report.id]: event.target.value })} placeholder="Explain what was reviewed or what action was taken…" />
                    </label>
                  )}
              </div>
              {report.status === 'pending' && !ownStaffReport && (
                <div className="moderation-report__actions">
                  {report.report_type !== 'staff_conduct' && report.job_listings && (
                    <AdminGuard minLevel={2} profile={currentProfile}>
                      <button className="button button--outline" onClick={() => onCloseListing(report.job_id)}>Close listing</button>
                    </AdminGuard>
                  )}
                  {report.report_type !== 'staff_conduct' && report.job_listings && (
                    <AdminGuard minLevel={3} profile={currentProfile}>
                      <button className="button button--danger" onClick={() => onDeleteListing(report.job_id)}>Delete</button>
                    </AdminGuard>
                  )}
                  <button className="button button--quiet" disabled={(reportReplies[report.id] || '').trim().length < 3} onClick={() => onResolveReport(report.id, 'dismissed', reportReplies[report.id])}>Dismiss & reply</button>
                  <button className="button button--quiet" disabled={(reportReplies[report.id] || '').trim().length < 3} onClick={() => onResolveReport(report.id, 'reviewed', reportReplies[report.id])}>Resolve & reply</button>
                </div>
              )}
              </article>
            );
          })}
          {!filteredReports.length && <div className="empty-state empty-state--compact"><p>No reports match these filters.</p></div>}
        </div>
      </PermissionSection>

      <PermissionSection id="admin-listings" minLevel={2} profile={currentProfile} title="Job listing moderation" description="Level 2+ staff can close listings; Level 3+ can permanently delete rule-breaking listings.">
        <div className="admin-filter-bar">
          <label className="search-field">
            <span className="sr-only">Search listings</span><span aria-hidden="true">⌕</span>
            <input value={listingSearch} onChange={(event) => setListingSearch(event.target.value)} placeholder="Search role or server" />
          </label>
          <label className="admin-filter-select">Status
            <select value={listingStatus} onChange={(event) => setListingStatus(event.target.value)}>
              <option value="all">All listings</option><option value="open">Open</option><option value="closed">Closed</option><option value="filled">Filled</option>
            </select>
          </label>
        </div>
        <div className="panel-list">
          {filteredListings.map((job) => (
            <article className="panel listing-row" key={job.id}>
              <div className="listing-row__main">
                <span className="server-avatar server-avatar--violet" aria-hidden="true">{job.server_name.slice(0, 2).toUpperCase()}</span>
                <div><button className="report-listing-link" onClick={() => setSelectedListing(job)}>{job.role_title} <span>↗ View details</span></button><p>{job.server_name} · {job.status}</p></div>
              </div>
              <div className="listing-row__actions">
                {job.status !== 'closed' && (
                  <AdminGuard minLevel={2} profile={currentProfile}>
                    <button className="button button--outline" onClick={() => onCloseListing(job.id)}>Close listing</button>
                  </AdminGuard>
                )}
                <AdminGuard minLevel={3} profile={currentProfile}>
                  <button className="button button--danger" onClick={() => {
                    if (window.confirm(`Permanently delete "${job.role_title}"? This also deletes its applications.`)) onDeleteListing(job.id);
                  }}>Delete</button>
                </AdminGuard>
                <AdminGuard minLevel={5} profile={currentProfile}>
                  <button className={`button ${job.is_featured ? 'button--primary' : 'button--outline'}`} onClick={() => onSetFeatured(job.id, !job.is_featured)}>
                    {job.is_featured ? '✦ Featured' : 'Feature'}
                  </button>
                </AdminGuard>
              </div>
            </article>
          ))}
          {!filteredListings.length && <div className="empty-state empty-state--compact"><p>No listings match these filters.</p></div>}
        </div>
      </PermissionSection>

      <PermissionSection id="admin-members" minLevel={3} profile={currentProfile} title="Member moderation" description="Issue warnings at Level 3+ and temporary suspensions at Level 4+. You can only act on members below your rank.">
        <label className="search-field admin-directory-search">
          <span className="sr-only">Search members</span><span aria-hidden="true">⌕</span>
          <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search members by name or Discord ID" />
        </label>
        <div className="suspension-toolbar">
          <label>Suspension duration
            <select value={suspendHours} onChange={(event) => setSuspendHours(event.target.value)}>
              <option value="1">1 hour</option><option value="24">24 hours</option><option value="168">7 days</option><option value="720">30 days</option>
              {rank === 6 && <><option value="8760">365 days</option><option value="-1">Permanent ban</option></>}
            </select>
          </label>
        </div>
        <div className="panel-list">
          {filterMembers(profiles.filter((member) => member.id !== currentProfile?.id && member.admin_level < rank)).map((member) => (
            <article className="panel member-row" key={member.id}>
              <div className="member-row__identity">
                {member.avatar_url ? <img className="member-avatar" src={member.avatar_url} alt="" /> : <span className="member-avatar member-avatar--fallback">{(member.username || '?').slice(0, 1).toUpperCase()}</span>}
                <div>
                  <h3>{member.username || 'Discord member'}</h3>
                  <p>{ROLES[member.admin_level]} · {member.is_suspended && (!member.suspended_until || new Date(member.suspended_until) > new Date())
                    ? member.suspended_until ? `Suspended until ${new Date(member.suspended_until).toLocaleString()}` : 'Permanently suspended'
                    : 'Active'}</p>
                  {member.suspension_reason && <p className="member-row__reason">{member.suspension_reason}</p>}
                </div>
              </div>
              <div className="member-row__controls">
                <AdminGuard minLevel={3} profile={currentProfile}>
                  <button className="button button--outline" onClick={() => {
                    const reason = window.prompt(`Warning reason for ${member.username || 'member'}:`);
                    if (reason?.trim()) onWarn(member.id, reason.trim());
                  }}>Issue warning</button>
                </AdminGuard>
                <AdminGuard minLevel={4} profile={currentProfile}>
                  {member.is_suspended && (!member.suspended_until || new Date(member.suspended_until) > new Date()) ? (
                    <button className="button button--quiet" onClick={() => onSuspend(member.id, 0, 'Suspension lifted by staff')}>Unsuspend</button>
                  ) : (
                    <button className="button button--danger" onClick={() => {
                      const reason = window.prompt(`Suspension reason for ${member.username || 'member'}:`);
                      if (reason?.trim()) onSuspend(member.id, Number(suspendHours), reason.trim());
                    }}>Suspend</button>
                  )}
                </AdminGuard>
              </div>
            </article>
          ))}
          {!filterMembers(profiles.filter((member) => member.id !== currentProfile?.id && member.admin_level < rank)).length && <div className="empty-state empty-state--compact"><p>No members match your search.</p></div>}
        </div>
      </PermissionSection>

      {rank >= 5 && (
        <section className="admin-subsection promotion-review-section" aria-labelledby="promotion-review-title">
          <div className="subsection-heading">
            <h3 id="promotion-review-title">Promotion readiness</h3>
            <span>{promotionCandidates.length} ready for review</span>
          </div>
          <p className="admin-subsection__description">
            This is a review prompt, never an automatic promotion. The signal uses at least five recorded casework actions in the last 30 days and an active account. Senior staff must assess decision quality, context, and fairness before changing a rank.
          </p>
          {promotionCandidates.length ? (
            <div className="promotion-candidate-list" role="status" aria-live="polite">
              {promotionCandidates.map((member) => (
                <article className="panel promotion-candidate" key={member.id}>
                  <div>
                    <strong>{member.username || 'Discord member'}</strong>
                    <span>{ROLES[member.admin_level]} · Level {member.admin_level}</span>
                  </div>
                  <span className="promotion-candidate__evidence">{member.promotionActivity} casework actions · 30d</span>
                </article>
              ))}
              <p className="promotion-review-hint">Review evidence in the audit log, check pending staff-conduct reports, then use staff access controls to make any promotion. Each change records the acting staff member.</p>
              <a className="button button--outline" href="#admin-staff-management">Review staff access</a>
            </div>
          ) : (
            <div className="empty-state empty-state--compact"><p>No one currently meets the activity baseline for a promotion review.</p></div>
          )}
        </section>
      )}

      <PermissionSection id="admin-staff-management" minLevel={5} profile={currentProfile} title="Verified moderators & staff access" description="Senior Admins can manage staff through Level 3. Owners can manage staff through Level 5. Higher-ranked staff and your own account are protected.">
        <div className="panel-list">
          {filterMembers(profiles.filter(canAssign)).map((member) => {
            const maxManagedLevel = rank === 6 ? 5 : 3;
            const canChangeRole = member.admin_level <= maxManagedLevel;
            return (
              <article className="panel member-row" key={member.id}>
                <div className="member-row__identity">
                  {member.avatar_url ? <img className="member-avatar" src={member.avatar_url} alt="" /> : <span className="member-avatar member-avatar--fallback">{(member.username || '?').slice(0, 1).toUpperCase()}</span>}
                  <div><h3>{member.username || 'Discord member'}</h3><p>{member.discord_id ? `Discord ID ${member.discord_id}` : member.id}</p></div>
                </div>
                <div className="member-row__controls">
                  {canChangeRole && (
                    <label className="staff-role-select">Staff rank
                      <select value={member.admin_level} onChange={(event) => onSetAdminLevel(member.id, Number(event.target.value))}>
                        {ROLES.map((role, level) => level <= maxManagedLevel && <option value={level} key={role}>{role} · Level {level}</option>)}
                      </select>
                    </label>
                  )}
                  <button
                    className={`verify-toggle${member.is_verified_moderator ? ' is-verified' : ''}`}
                    type="button"
                    onClick={() => onSetVerified(member.id, !member.is_verified_moderator)}
                  >
                    {member.is_verified_moderator ? '✓ Verified' : 'Verify moderator'}
                  </button>
                </div>
              </article>
            );
          })}
          {!filterMembers(profiles.filter(canAssign)).length && <div className="empty-state empty-state--compact"><p>No staff members match your search.</p></div>}
        </div>
      </PermissionSection>

      <PermissionSection minLevel={6} profile={currentProfile} title="PR Manager access" description="Assign the separate PR Manager role to members who should receive advertising, press, and partnership inquiries. This role does not grant moderation or staff-level permissions.">
        <label className="search-field admin-directory-search">
          <span className="sr-only">Search PR Manager accounts</span><span aria-hidden="true">⌕</span>
          <input value={prManagerSearch} onChange={(event) => setPrManagerSearch(event.target.value)} placeholder="Find an account by name or Discord ID" />
        </label>
        <div className="panel-list">
          {profiles.filter((member) => `${member.username} ${member.discord_id || ''}`.toLowerCase().includes(prManagerSearch.trim().toLowerCase())).map((member) => (
            <article className="panel pr-manager-row" key={member.id}>
              <div>
                <strong>{member.username || 'Discord member'}</strong>
                <span>{member.discord_id ? `Discord ID ${member.discord_id}` : member.id}</span>
              </div>
              <button className={`button ${member.is_pr_manager ? 'button--primary' : 'button--outline'}`} type="button" onClick={() => setPrManager(member)} disabled={saving || member.id === currentProfile?.id}>
                {member.is_pr_manager ? 'Remove PR Manager' : 'Assign PR Manager'}
              </button>
            </article>
          ))}
          {!profiles.some((member) => `${member.username} ${member.discord_id || ''}`.toLowerCase().includes(prManagerSearch.trim().toLowerCase())) && <div className="empty-state empty-state--compact"><p>No accounts match this search.</p></div>}
        </div>
      </PermissionSection>

      <PermissionSection id="admin-audit" minLevel={5} profile={currentProfile} title="Staff action history" description="Private audit trail for Senior Admins and Owners. Each event identifies the acting staff member and target. Records are kept for 30 days.">
        <div className="staff-audit-summary">
          <article className="panel staff-audit-summary__metric"><span>Recorded actions</span><strong>{staffActions.length}</strong><small>Rolling 30-day window</small></article>
          <article className="panel staff-audit-summary__metric"><span>Casework actions</span><strong>{reviewableActions.length}</strong><small>Used for promotion review signals</small></article>
        </div>
        <div className="staff-activity-chart" aria-label="Staff action counts for the last seven days">
          {activityByDay.map(({ day, count }) => (
            <div className="staff-activity-chart__day" key={day.toISOString()} title={`${day.toLocaleDateString()}: ${count} actions`}>
              <div className="staff-activity-chart__bar-wrap"><span className="staff-activity-chart__bar" style={{ height: `${Math.max(4, count / peakActivity * 100)}%` }} /></div>
              <small>{day.toLocaleDateString(undefined, { weekday: 'short' })}</small>
              <b>{count}</b>
            </div>
          ))}
        </div>
        <div className="admin-filter-bar">
          <label className="search-field">
            <span className="sr-only">Search staff action history</span><span aria-hidden="true">⌕</span>
            <input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Search staff, members, or action details" />
          </label>
          <label className="admin-filter-select">Action
            <select value={auditType} onChange={(event) => setAuditType(event.target.value)}>
              <option value="all">All actions</option>
              {Array.from(new Set(staffActions.map((entry) => entry.action))).sort().map((action) => <option value={action} key={action}>{ACTION_LABELS[action] || action.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
        </div>
        <div className="staff-audit-list">
          {filteredAudit.map((entry) => (
            <article className="panel staff-audit-entry" key={entry.id}>
              <div className="staff-audit-entry__heading">
                <div>
                  <strong>{ACTION_LABELS[entry.action] || entry.action.replaceAll('_', ' ')}</strong>
                  <span>{entry.actor_name}{entry.target_name ? ` → ${entry.target_name}` : ''}</span>
                </div>
                <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
              </div>
              {Object.entries(entry.details || {}).length > 0 && (
                <dl className="staff-audit-entry__details">
                  {Object.entries(entry.details).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key.replaceAll('_', ' ')}</dt>
                      <dd>{formatAuditValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          ))}
          {!filteredAudit.length && <div className="empty-state empty-state--compact"><p>No staff actions match this search.</p></div>}
        </div>
      </PermissionSection>

      <PermissionSection minLevel={6} profile={currentProfile} title="Site settings" description="Owner-only configuration visible only to Level 6.">
        <div className="panel maintenance-setting">
          <div>
            <strong>Maintenance mode</strong>
            <p>{settings.maintenance_mode === true
              ? 'The public site is hidden from members until you turn maintenance off.'
              : 'The public site is currently available to all members.'}</p>
            <span className={`maintenance-status${settings.maintenance_mode === true ? ' is-active' : ''}`}>
              {settings.maintenance_mode === true ? 'Maintenance is on' : 'Maintenance is off'}
            </span>
          </div>
          <button className={`button ${settings.maintenance_mode === true ? 'button--danger' : 'button--outline'}`} type="button" onClick={toggleMaintenance} disabled={maintenanceSaving}>
            {maintenanceSaving ? 'Updating…' : settings.maintenance_mode === true ? 'Turn maintenance off' : 'Turn maintenance on'}
          </button>
        </div>
        <form className="panel form-panel" onSubmit={saveAnnouncement}>
          <label className="form-field">
            <span>Site announcement</span>
            <textarea rows={3} maxLength={1000} value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="Optional announcement shown to the community…" />
          </label>
          <button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        </form>
        <form className="panel form-panel ad-manager-form" onSubmit={saveAdSlot}>
          <div className="profile-section-heading">
            <div><p className="eyebrow">SPONSORED PLACEMENT</p><h3>Homepage ad slot</h3></div>
            <label className="ad-enabled-toggle"><input type="checkbox" checked={adSlot.enabled} onChange={(event) => setAdSlot({ ...adSlot, enabled: event.target.checked })} /> Publish</label>
          </div>
          <p className="admin-subsection__description">Manage one clearly labelled sponsor placement on the public opportunities page. The placement uses the existing settings row and does not collect impression or click data.</p>
          <label className="form-field"><span>Sponsor name</span><input maxLength={60} value={adSlot.sponsor || ''} onChange={(event) => setAdSlot({ ...adSlot, sponsor: event.target.value })} placeholder="Sponsor or partner" /></label>
          <label className="form-field"><span>Headline</span><input required={adSlot.enabled} maxLength={100} value={adSlot.title || ''} onChange={(event) => setAdSlot({ ...adSlot, title: event.target.value })} placeholder="A short, clear sponsor message" /></label>
          <label className="form-field"><span>Description</span><textarea rows={3} maxLength={300} value={adSlot.description || ''} onChange={(event) => setAdSlot({ ...adSlot, description: event.target.value })} placeholder="What should visitors know about this partner?" /></label>
          <label className="form-field"><span>Destination URL (HTTPS)</span><input type="url" required={adSlot.enabled} maxLength={500} pattern="https://.+" value={adSlot.url || ''} onChange={(event) => setAdSlot({ ...adSlot, url: event.target.value })} placeholder="https://example.com" /></label>
          <button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving ad slot…' : 'Save ad placement'}</button>
        </form>
      </PermissionSection>

      <PermissionSection minLevel={6} profile={currentProfile} title="Website metrics" description="Operational snapshot calculated from data already loaded for the staff workspace. Counts are not a privacy-safe unique visitor metric and no analytics events are written.">
        <div className="site-metrics-grid">
          <article className="panel site-metric"><span>Registered accounts</span><strong>{profiles.length}</strong></article>
          <article className="panel site-metric"><span>All listings</span><strong>{jobs.length}</strong></article>
          <article className="panel site-metric"><span>Open listings</span><strong>{openListings}</strong></article>
          <article className="panel site-metric"><span>Featured placements</span><strong>{jobs.filter((job) => job.is_featured).length}</strong></article>
          <article className="panel site-metric"><span>Applications</span><strong>{applications.length}</strong></article>
          <article className="panel site-metric"><span>Applications · 30 days</span><strong>{newApplications30d}</strong></article>
          <article className="panel site-metric"><span>New listings · 30 days</span><strong>{newListings30d}</strong></article>
          <article className="panel site-metric"><span>Reports awaiting review</span><strong>{pendingReports}</strong></article>
        </div>
        <p className="site-metrics-note">For promotion and marketing decisions, use these operational counts alongside actual campaign data. This dashboard deliberately avoids per-visitor tracking, extra analytics tables, and high-volume database writes.</p>
      </PermissionSection>

      <PermissionSection minLevel={5} profile={currentProfile} title="Community broadcast" description="Send a notice to every registered account. It will appear in their inbox immediately.">
        <form className="panel form-panel" onSubmit={sendBroadcast}>
          <label className="form-field">
            <span>Notification title</span>
            <input required minLength={3} maxLength={100} value={broadcastTitle} onChange={(event) => setBroadcastTitle(event.target.value)} placeholder="A quick update from the ModLink team" />
          </label>
          <label className="form-field">
            <span>Message to everyone</span>
            <textarea required minLength={3} maxLength={2000} rows={4} value={broadcastBody} onChange={(event) => setBroadcastBody(event.target.value)} placeholder="Share important community news, maintenance updates, or announcements…" />
          </label>
          <button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Sending…' : 'Send to all accounts'}</button>
        </form>
      </PermissionSection>

      {selectedListing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedListing(null);
        }}>
          <section className="dialog listing-dialog" role="dialog" aria-modal="true" aria-labelledby="moderation-listing-title">
            <button className="dialog__close" type="button" onClick={() => setSelectedListing(null)} aria-label="Close listing">×</button>
            <p className="eyebrow">{selectedListing.server_name}</p>
            <h2 id="moderation-listing-title">{selectedListing.role_title}</h2>
            <div className="listing-dialog__meta">
              <span className={`state-pill state-pill--${selectedListing.status}`}>{selectedListing.status}</span>
              {selectedListing.is_featured && <span className="featured-label">✦ Featured</span>}
            </div>
            <p className="dialog__description">{selectedListing.description}</p>
            <div className="listing-dialog__actions">
              {selectedListing.status !== 'closed' && (
                <AdminGuard minLevel={2} profile={currentProfile}>
                  <button className="button button--outline" onClick={() => { onCloseListing(selectedListing.id); setSelectedListing(null); }}>Close listing</button>
                </AdminGuard>
              )}
              <AdminGuard minLevel={3} profile={currentProfile}>
                <button className="button button--danger" onClick={() => {
                  if (window.confirm(`Permanently delete "${selectedListing.role_title}"?`)) {
                    onDeleteListing(selectedListing.id);
                    setSelectedListing(null);
                  }
                }}>Delete listing</button>
              </AdminGuard>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
