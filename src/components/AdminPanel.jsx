import { useEffect, useState } from 'react';
import AdminGuard from './AdminGuard.jsx';

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
};

function formatAuditValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function PermissionSection({ minLevel, profile, title, description, children }) {
  return (
    <AdminGuard minLevel={minLevel} profile={profile}>
      <section className="admin-subsection">
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
  const rank = currentProfile?.admin_level ?? 0;
  const canAssign = (member) => member.id !== currentProfile?.id
    && (rank === 6 ? member.admin_level <= 5 : member.admin_level <= 3);

  useEffect(() => {
    setAnnouncement(settings.announcement || '');
  }, [settings.announcement]);

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
      <div className="admin-stat-grid">
        <div className="panel admin-stat"><span>Open reports</span><strong>{reports.filter((report) => report.status === 'pending').length}</strong></div>
        <div className="panel admin-stat"><span>Listings</span><strong>{jobs.length}</strong></div>
        <div className="panel admin-stat"><span>Applications</span><strong>{applications.length}</strong></div>
      </div>

      <PermissionSection minLevel={1} profile={currentProfile} title="Moderation queue" description="Review user reports about listings and private chats.">
        <div className="panel-list">
          {reports.filter((report) => report.status === 'pending').map((report) => (
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
                  ) : report.job_listings ? (
                    <button className="report-listing-link" onClick={() => setSelectedListing(report.job_listings)}>
                      {report.job_listings.role_title} <span>↗ View listing</span>
                    </button>
                  ) : <h4>Removed listing</h4>}
                  {report.report_type !== 'chat' && <span className="job-card__server">{report.job_listings?.server_name || 'Listing unavailable'}</span>}
                </div>
                <p>{report.reason}</p>
                <small>Reported by {report.profiles?.username || 'Discord member'} · {new Date(report.created_at).toLocaleDateString()}</small>
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
                <label className="report-reply">
                  <span>Your response (sent privately to the reporter)</span>
                  <textarea rows={2} maxLength={1500} minLength={3} value={reportReplies[report.id] || ''} onChange={(event) => setReportReplies({ ...reportReplies, [report.id]: event.target.value })} placeholder="Explain what was reviewed or what action was taken…" />
                </label>
              </div>
              <div className="moderation-report__actions">
                {report.job_listings && (
                  <AdminGuard minLevel={2} profile={currentProfile}>
                    <button className="button button--outline" onClick={() => onCloseListing(report.job_id)}>Close listing</button>
                  </AdminGuard>
                )}
                {report.job_listings && (
                  <AdminGuard minLevel={3} profile={currentProfile}>
                    <button className="button button--danger" onClick={() => onDeleteListing(report.job_id)}>Delete</button>
                  </AdminGuard>
                )}
                <button className="button button--quiet" disabled={(reportReplies[report.id] || '').trim().length < 3} onClick={() => onResolveReport(report.id, 'dismissed', reportReplies[report.id])}>Dismiss & reply</button>
                <button className="button button--quiet" disabled={(reportReplies[report.id] || '').trim().length < 3} onClick={() => onResolveReport(report.id, 'reviewed', reportReplies[report.id])}>Resolve & reply</button>
              </div>
            </article>
          ))}
          {!reports.some((report) => report.status === 'pending') && <div className="empty-state empty-state--compact"><p>The moderation queue is clear.</p></div>}
        </div>
      </PermissionSection>

      <PermissionSection minLevel={2} profile={currentProfile} title="Job listing moderation" description="Level 2+ staff can close listings; Level 3+ can permanently delete rule-breaking listings.">
        <div className="panel-list">
          {jobs.map((job) => (
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
          {!jobs.length && <div className="empty-state empty-state--compact"><p>No listings to moderate.</p></div>}
        </div>
      </PermissionSection>

      <PermissionSection minLevel={3} profile={currentProfile} title="Member moderation" description="Issue warnings at Level 3+ and temporary suspensions at Level 4+. You can only act on members below your rank.">
        <div className="suspension-toolbar">
          <label>Suspension duration
            <select value={suspendHours} onChange={(event) => setSuspendHours(event.target.value)}>
              <option value="1">1 hour</option><option value="24">24 hours</option><option value="168">7 days</option><option value="720">30 days</option>
              {rank === 6 && <><option value="8760">365 days</option><option value="-1">Permanent ban</option></>}
            </select>
          </label>
        </div>
        <div className="panel-list">
          {profiles.filter((member) => member.id !== currentProfile?.id && member.admin_level < rank).map((member) => (
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
        </div>
      </PermissionSection>

      <PermissionSection minLevel={5} profile={currentProfile} title="Verified moderators & staff access" description="Senior Admins can manage staff through Level 3. Owners can manage staff through Level 5. Higher-ranked staff and your own account are protected.">
        <div className="panel-list">
          {profiles.filter(canAssign).map((member) => {
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
        </div>
      </PermissionSection>

      <PermissionSection minLevel={5} profile={currentProfile} title="Staff action history" description="Private audit trail for Senior Admins and Owners. Staff and administrative actions are retained for 30 days to support reviews and promotion decisions.">
        <div className="staff-audit-list">
          {staffActions.map((entry) => (
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
          {!staffActions.length && <div className="empty-state empty-state--compact"><p>No staff actions have been recorded in the last 30 days.</p></div>}
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
