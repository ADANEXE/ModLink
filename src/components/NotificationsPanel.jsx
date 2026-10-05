import { useState } from 'react';

const NOTIFICATION_ICONS = {
  announcement: '✦',
  report_update: '⚑',
  application_update: '↗',
  new_application: '＋',
  moderation_warning: '!',
  account_suspension: '−',
  suspension_lifted: '✓',
  chat_message: '◌',
  chat_invitation: '◌',
  staff_role: '◆',
  moderator_verification: '✓',
  listing_featured: '✦',
};

export default function NotificationsPanel({ notifications, onOpen, onMarkRead, onMarkAllRead, onReportStaffAction }) {
  const [reportingId, setReportingId] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [sendingReport, setSendingReport] = useState(false);

  async function submitStaffReport(event, notification) {
    event.preventDefault();
    if (reportReason.trim().length < 10) return;
    setSendingReport(true);
    const sent = await onReportStaffAction(notification, reportReason.trim());
    setSendingReport(false);
    if (sent) {
      setReportingId(null);
      setReportReason('');
    }
  }

  return (
    <section className="workspace-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR ACTIVITY</p>
          <h2>Inbox</h2>
          <p className="section-heading__copy">Announcements, application updates, and staff responses—all in one place.</p>
        </div>
        {notifications.some((notification) => !notification.read_at) && (
          <button className="button button--outline" onClick={onMarkAllRead}>Mark all read</button>
        )}
      </div>
      <div className="notification-list">
        {notifications.map((notification) => (
          <article className={`notification-card${notification.read_at ? '' : ' is-unread'}`} key={notification.id}>
            <button className="notification-card__main" onClick={() => onOpen(notification)}>
              <span className={`notification-icon notification-icon--${notification.type}`} aria-hidden="true">
                {NOTIFICATION_ICONS[notification.type] || '•'}
              </span>
              <span className="notification-card__content">
                <strong>{notification.title}</strong>
                <span>{notification.body}</span>
                {notification.actor_id && <small className="notification-card__actor">Action by {notification.actor?.username || 'Staff member'}{notification.actor?.admin_level > 0 ? ` · Level ${notification.actor.admin_level}` : ''}</small>}
                <small>{new Date(notification.created_at).toLocaleString()}</small>
              </span>
              {!notification.read_at && <span className="notification-dot" aria-label="Unread" />}
            </button>
            {!notification.read_at && (
              <button className="notification-card__read" onClick={() => onMarkRead(notification.id)}>
                Mark read
              </button>
            )}
            {notification.actor?.admin_level > 0 && notification.actor_id !== notification.user_id && (
              notification.actor.admin_level >= 6 ? (
                <a className="notification-card__report" href="https://dsc.gg/modlinkdc" target="_blank" rel="noreferrer">Report an Owner decision</a>
              ) : (
                <button
                  className="notification-card__report"
                  type="button"
                  onClick={() => {
                    setReportingId((current) => current === notification.id ? null : notification.id);
                    setReportReason('');
                  }}
                >
                  {reportingId === notification.id ? 'Cancel report' : 'Report staff action'}
                </button>
              )
            )}
            {reportingId === notification.id && (
              <form className="notification-staff-report" onSubmit={(event) => submitStaffReport(event, notification)}>
                <label className="form-field">
                  <span>What feels unfair about this action?</span>
                  <textarea required minLength={10} maxLength={1000} rows={3} value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="Explain what should be reviewed. The staff member and original notification are attached." />
                </label>
                <small>Only a higher-ranked staff reviewer can review this report; the reported staff member cannot view it.</small>
                <button className="button button--danger" type="submit" disabled={sendingReport || reportReason.trim().length < 10}>
                  {sendingReport ? 'Sending report…' : 'Submit confidential report'}
                </button>
              </form>
            )}
          </article>
        ))}
        {!notifications.length && (
          <div className="empty-state">
            <span className="empty-state__icon" aria-hidden="true">✦</span>
            <h3>You’re all caught up</h3>
            <p>Important updates from applicants, listing owners, and staff will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}
