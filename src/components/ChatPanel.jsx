import { useEffect, useState } from 'react';
import { supabaseClient } from '../lib/supabaseClient.js';

function getOtherParticipant(conversation, currentUserId) {
  return conversation.owner_id === currentUserId
    ? conversation.applicant
    : conversation.owner;
}

export default function ChatPanel({
  conversations,
  currentUserId,
  selectedConversationId,
  onSelectConversation,
  onReportChat,
  onRefresh,
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState('');
  const activeConversation = conversations.find((conversation) => conversation.id === selectedConversationId);

  useEffect(() => {
    if (!activeConversation) {
      setMessages([]);
      return undefined;
    }

    let active = true;
    async function fetchMessages() {
      const { data, error: queryError } = await supabaseClient
        .from('chat_messages')
        .select('id, sender_id, body, created_at, expires_at')
        .eq('conversation_id', activeConversation.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at');
      if (!active) return;
      if (queryError) setError(`Unable to load messages: ${queryError.message}`);
      else {
        setMessages(data || []);
        setError('');
      }
      setLoading(false);
    }

    setLoading(true);
    fetchMessages();
    const timer = window.setInterval(fetchMessages, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeConversation]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!activeConversation || !draft.trim()) return;
    setSending(true);
    setError('');
    const { error: sendError } = await supabaseClient.rpc('send_chat_message', {
      target_conversation_id: activeConversation.id,
      message_body: draft.trim(),
    });
    if (sendError) {
      setError(`Unable to send message: ${sendError.message}`);
    } else {
      setDraft('');
      await onRefresh();
      const { data, error: queryError } = await supabaseClient
        .from('chat_messages')
        .select('id, sender_id, body, created_at, expires_at')
        .eq('conversation_id', activeConversation.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at');
      if (queryError) setError(`Message sent, but refresh failed: ${queryError.message}`);
      else setMessages(data || []);
    }
    setSending(false);
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!activeConversation || reportReason.trim().length < 10) return;
    setReporting(true);
    setError('');
    const submitted = await onReportChat(activeConversation.id, reportReason.trim());
    if (submitted) {
      setReportReason('');
      setReportOpen(false);
    } else {
      setError('Unable to submit your report. Please try again.');
    }
    setReporting(false);
  }

  return (
    <section className="workspace-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PRIVATE CONVERSATIONS</p>
          <h2>Messages</h2>
          <p className="section-heading__copy">Chats are private to the applicant and listing owner. Messages expire after 24 hours.</p>
        </div>
        <span className="chat-retention"><span aria-hidden="true">◷</span> 24-hour messages</span>
      </div>
      <div className="chat-layout">
        <aside className="chat-sidebar" aria-label="Conversations">
          {conversations.map((conversation) => {
            const other = getOtherParticipant(conversation, currentUserId);
            const title = conversation.job?.role_title || 'Staff role';
            return (
              <button
                className={`chat-thread${conversation.id === selectedConversationId ? ' is-selected' : ''}`}
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
              >
                <span className="member-avatar member-avatar--fallback">{(other?.username || '?').slice(0, 1).toUpperCase()}</span>
                <span className="chat-thread__copy">
                  <strong>{other?.username || 'Discord member'}</strong>
                  <span>{conversation.job?.role_title || title}</span>
                  <small>{conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleString() : 'Chat opened'}</small>
                </span>
              </button>
            );
          })}
          {!conversations.length && <p className="chat-sidebar__empty">When a listing owner opens a chat about your application, it will show up here.</p>}
        </aside>
        <div className="chat-window">
          {activeConversation ? (
            <>
              <header className="chat-window__header">
                <span className="member-avatar member-avatar--fallback">
                  {(getOtherParticipant(activeConversation, currentUserId)?.username || '?').slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{getOtherParticipant(activeConversation, currentUserId)?.username || 'Discord member'}</strong>
                  <span>{activeConversation.job?.role_title} · {activeConversation.job?.server_name}</span>
                </div>
                <span className="chat-retention">Auto-clears in 24h</span>
                <button className="button button--quiet chat-report-button" type="button" onClick={() => setReportOpen((open) => !open)}>
                  {reportOpen ? 'Cancel report' : 'Report chat'}
                </button>
              </header>
              {reportOpen && (
                <form className="chat-report-form" onSubmit={submitReport}>
                  <label className="form-field">
                    <span>Why are you reporting this conversation?</span>
                    <textarea required minLength={10} maxLength={1000} rows={3} value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="Describe the behavior or messages that need moderator review…" />
                  </label>
                  <p>Moderators Level 1 and above will receive your report and a private snapshot of recent messages.</p>
                  <button className="button button--danger" type="submit" disabled={reporting || reportReason.trim().length < 10}>{reporting ? 'Sending report…' : 'Submit report'}</button>
                </form>
              )}
              <div className="chat-messages" aria-live="polite">
                {loading && !messages.length && <div className="empty-state empty-state--compact">Loading conversation…</div>}
                {messages.map((message) => (
                  <article className={`chat-bubble${message.sender_id === currentUserId ? ' chat-bubble--mine' : ''}`} key={message.id}>
                    <p>{message.body}</p>
                    <small>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · expires {new Date(message.expires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                  </article>
                ))}
                {!loading && !messages.length && <div className="empty-state empty-state--compact"><p>Say hello to start the conversation. Messages are automatically removed after 24 hours.</p></div>}
              </div>
              {error && <p className="chat-error" role="alert">{error}</p>}
              <form className="chat-composer" onSubmit={sendMessage}>
                <label className="sr-only" htmlFor="chat-message">Message</label>
                <textarea id="chat-message" rows={2} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a thoughtful message…" />
                <button className="button button--primary" type="submit" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</button>
              </form>
            </>
          ) : (
            <div className="empty-state chat-empty">
              <span className="empty-state__icon" aria-hidden="true">◌</span>
              <h3>A more personal introduction</h3>
              <p>Listing owners can start a private conversation from an application. Messages disappear automatically after 24 hours.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
