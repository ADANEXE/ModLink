import { useEffect, useState } from 'react';

const TOPICS = [
  { value: 'advertising', label: 'Advertising & sponsorship' },
  { value: 'press', label: 'Press & media' },
  { value: 'general', label: 'General partnership question' },
];

export default function ContactPanel({
  user,
  profile,
  inquiries,
  initialTopic,
  onSignIn,
  onSubmit,
  onAnswer,
  onRefresh,
}) {
  const [topic, setTopic] = useState(initialTopic || 'general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});
  const [busyId, setBusyId] = useState('');
  const canManage = profile?.is_pr_manager || profile?.admin_level >= 6;

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
  }, [initialTopic]);

  async function submitInquiry(event) {
    event.preventDefault();
    setBusyId('new');
    const sent = await onSubmit(topic, subject.trim(), message.trim());
    setBusyId('');
    if (sent) {
      setSubject('');
      setMessage('');
    }
  }

  async function answerInquiry(event, inquiry) {
    event.preventDefault();
    const reply = (replyDrafts[inquiry.id] || '').trim();
    setBusyId(inquiry.id);
    const sent = await onAnswer(inquiry.id, reply);
    setBusyId('');
    if (sent) setReplyDrafts((current) => ({ ...current, [inquiry.id]: '' }));
  }

  const myInquiries = inquiries.filter((inquiry) => inquiry.requester_id === user?.id);
  const inbox = inquiries.filter((inquiry) => inquiry.requester_id !== user?.id);

  return (
    <section className="workspace-section contact-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PARTNERSHIPS & MEDIA</p>
          <h2>Contact the PR team</h2>
          <p className="section-heading__copy">Ask about advertising, sponsorships, press, or working with ModLink.</p>
        </div>
      </div>

      {!user ? (
        <article className="panel contact-signin">
          <h3>Sign in to send an inquiry</h3>
          <p>Use Discord to contact the PR team and track replies securely in your inbox.</p>
          <button className="button button--primary" type="button" onClick={onSignIn}>Continue with Discord</button>
        </article>
      ) : (
        <form className="panel form-panel contact-form" onSubmit={submitInquiry}>
          <label className="form-field">
            <span>Inquiry type</span>
            <select value={topic} onChange={(event) => setTopic(event.target.value)}>
              {TOPICS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
          {topic === 'advertising' && (
            <p className="contact-form__privacy">
              Include your advertiser name, campaign goal and audience, requested placement, final copy, HTTPS destination and media links, plus confirmation that you have rights to the creative. PR Managers review inquiries; the Owner makes the final campaign approval and publication decision.
            </p>
          )}
          <label className="form-field">
            <span>Subject</span>
            <input required minLength={3} maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What would you like to discuss?" />
          </label>
          <label className="form-field">
            <span>Message</span>
            <textarea required minLength={20} maxLength={2000} rows={6} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Share a few details so the team can route your inquiry." />
          </label>
          <p className="contact-form__privacy">Your Discord profile will be attached so the PR team can reply here. Inquiries are private to you, assigned PR Managers, and the Owner.</p>
          <button className="button button--primary" type="submit" disabled={busyId === 'new' || subject.trim().length < 3 || message.trim().length < 20}>
            {busyId === 'new' ? 'Sending inquiry…' : 'Send to the PR team'}
          </button>
        </form>
      )}

      {user && myInquiries.length > 0 && (
        <section className="contact-inquiries" aria-labelledby="my-pr-inquiries">
          <div className="subsection-heading"><h3 id="my-pr-inquiries">Your inquiries</h3><span>{myInquiries.length}</span></div>
          <div className="panel-list">
            {myInquiries.map((inquiry) => (
              <article className="panel contact-inquiry" key={inquiry.id}>
                <div className="contact-inquiry__heading">
                  <div><span className="contact-inquiry__topic">{TOPICS.find((item) => item.value === inquiry.topic)?.label || 'PR inquiry'}</span><h4>{inquiry.subject}</h4></div>
                  <span className={`state-pill state-pill--${inquiry.status}`}>{inquiry.status}</span>
                </div>
                <p>{inquiry.message}</p>
                {inquiry.staff_reply && <div className="contact-inquiry__reply"><strong>Reply from {inquiry.handler?.username || 'the PR team'}</strong><p>{inquiry.staff_reply}</p></div>}
                <small>Sent {new Date(inquiry.created_at).toLocaleString()}</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {canManage && (
        <section className="contact-inquiries" aria-labelledby="pr-manager-inbox">
          <div className="subsection-heading">
            <div><h3 id="pr-manager-inbox">PR team inbox</h3><span>{inbox.filter((inquiry) => inquiry.status === 'pending').length} awaiting reply</span></div>
            <button className="button button--outline" type="button" onClick={onRefresh}>Refresh inbox</button>
          </div>
          <p className="admin-subsection__description">Only assigned PR Managers and the Owner can access these inquiries. Replies are sent privately to the requester.</p>
          <div className="panel-list">
            {inbox.map((inquiry) => (
              <article className="panel contact-inquiry" key={inquiry.id}>
                <div className="contact-inquiry__heading">
                  <div><span className="contact-inquiry__topic">{TOPICS.find((item) => item.value === inquiry.topic)?.label || 'PR inquiry'}</span><h4>{inquiry.subject}</h4></div>
                  <span className={`state-pill state-pill--${inquiry.status}`}>{inquiry.status}</span>
                </div>
                <p className="contact-inquiry__requester">From {inquiry.requester?.username || 'Discord member'} · {new Date(inquiry.created_at).toLocaleString()}</p>
                <p>{inquiry.message}</p>
                {inquiry.staff_reply && <div className="contact-inquiry__reply"><strong>Replied by {inquiry.handler?.username || 'PR Manager'}</strong><p>{inquiry.staff_reply}</p></div>}
                {inquiry.status === 'pending' && (
                  <form className="contact-inquiry__reply-form" onSubmit={(event) => answerInquiry(event, inquiry)}>
                    <label className="form-field">
                      <span>Reply to requester</span>
                      <textarea required minLength={3} maxLength={2000} rows={4} value={replyDrafts[inquiry.id] || ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [inquiry.id]: event.target.value }))} placeholder="Write a helpful reply…" />
                    </label>
                    <button className="button button--primary" type="submit" disabled={busyId === inquiry.id || (replyDrafts[inquiry.id] || '').trim().length < 3}>
                      {busyId === inquiry.id ? 'Sending reply…' : 'Reply & mark answered'}
                    </button>
                  </form>
                )}
              </article>
            ))}
            {!inbox.length && <div className="empty-state empty-state--compact"><p>No PR inquiries have arrived yet.</p></div>}
          </div>
        </section>
      )}
    </section>
  );
}
