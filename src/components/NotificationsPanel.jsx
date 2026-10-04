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

export default function NotificationsPanel({ notifications, onOpen, onMarkRead, onMarkAllRead }) {
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
                <small>{new Date(notification.created_at).toLocaleString()}</small>
              </span>
              {!notification.read_at && <span className="notification-dot" aria-label="Unread" />}
            </button>
            {!notification.read_at && (
              <button className="notification-card__read" onClick={() => onMarkRead(notification.id)}>
                Mark read
              </button>
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
