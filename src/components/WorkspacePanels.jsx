import { useState } from 'react';

export function EmployerPanel({ user, profile, jobs, applications, conversations, onStartChat, onCreateJob, onUpdateJob, onUpdateApplication }) {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ server_name: '', role_title: '', description: '' });
  const ownedJobs = jobs.filter((job) => job.owner_id === user?.id);
  const isSuspended = profile?.is_suspended
    && (!profile.suspended_until || new Date(profile.suspended_until) > new Date());

  async function createJob(event) {
    event.preventDefault();
    setBusy(true);
    const succeeded = await onCreateJob(form);
    setBusy(false);
    if (succeeded) {
      setForm({ server_name: '', role_title: '', description: '' });
      setShowForm(false);
    }
  }

  return (
    <section className="workspace-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">EMPLOYER WORKSPACE</p>
          <h2>Manage your listings</h2>
          <p className="section-heading__copy">Post a role and review people who apply.</p>
        </div>
        <button className="button button--primary" onClick={() => setShowForm(!showForm)} disabled={isSuspended}>
          {isSuspended ? 'Posting suspended' : showForm ? 'Close form' : '＋ Post a role'}
        </button>
      </div>
      {isSuspended && (
        <p className="suspension-notice">
          Your account is restricted from posting{profile.suspended_until ? ` until ${new Date(profile.suspended_until).toLocaleString()}` : ' permanently'}.
        </p>
      )}

      {showForm && (
        <form className="panel form-panel" onSubmit={createJob}>
          <h3>Create a listing</h3>
          <div className="form-grid">
            <label className="form-field">
              <span>Server or community name</span>
              <input required maxLength={100} value={form.server_name} onChange={(event) => setForm({ ...form, server_name: event.target.value })} placeholder="The Cozy Corner" />
            </label>
            <label className="form-field">
              <span>Role title</span>
              <input required maxLength={100} value={form.role_title} onChange={(event) => setForm({ ...form, role_title: event.target.value })} placeholder="Community Moderator" />
            </label>
          </div>
          <label className="form-field">
            <span>Role description</span>
            <textarea required minLength={30} maxLength={5000} rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe your community, responsibilities, requirements, and time commitment…" />
          </label>
          <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish listing'}</button>
        </form>
      )}

      <div className="panel-list">
        {ownedJobs.length ? ownedJobs.map((job) => (
          <article className="panel listing-row" key={job.id}>
            <div className="listing-row__main">
              <span className="server-avatar server-avatar--blue" aria-hidden="true">{job.server_name.slice(0, 2).toUpperCase()}</span>
              <div><h3>{job.role_title}</h3><p>{job.server_name}</p></div>
            </div>
            <div className="listing-row__actions">
              <span className={`state-pill state-pill--${job.status}`}>{job.status}</span>
              <select aria-label={`Set status for ${job.role_title}`} value={job.status} onChange={(event) => onUpdateJob(job.id, event.target.value)}>
                <option value="open">Open</option><option value="closed">Closed</option><option value="filled">Filled</option>
              </select>
            </div>
          </article>
        )) : <div className="empty-state empty-state--compact"><h3>No listings yet</h3><p>Post your first staff opening to start receiving applications.</p></div>}
      </div>

      <div className="subsection-heading"><h3>Applications received</h3><span>{applications.length}</span></div>
      <div className="panel-list">
        {applications.length ? applications.map((application) => (
          <article className="panel application-row" key={application.id}>
            <div className="application-row__copy">
              <div className="application-row__heading">
                <h3>{application.profiles?.username || 'Discord member'} {application.profiles?.is_verified_moderator && <span className="verified-badge">✓ Verified Moderator</span>}</h3>
                <span className="job-card__server">applied for {application.job_listings?.role_title}</span>
              </div>
              <p>{application.experience_summary}</p>
              <small>{new Date(application.created_at).toLocaleDateString()}</small>
            </div>
            <label className="sr-only" htmlFor={`app-${application.id}`}>Application status</label>
            <select id={`app-${application.id}`} value={application.status} onChange={(event) => onUpdateApplication(application.id, event.target.value)}>
              <option value="pending">Pending</option><option value="reviewing">Reviewing</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option>
            </select>
            <button
              className="button button--outline"
              onClick={() => onStartChat(application)}
              type="button"
            >
              {conversations.some((conversation) => conversation.application_id === application.id) ? 'Open chat' : 'Start private chat'}
            </button>
          </article>
        )) : <div className="empty-state empty-state--compact"><p>No applications received yet.</p></div>}
      </div>
    </section>
  );
}
