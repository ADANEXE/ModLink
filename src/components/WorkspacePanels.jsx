import { useState } from 'react';

function getSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const LISTING_CATEGORIES = [
  ['moderation', 'Moderation & safety'],
  ['community', 'Community management'],
  ['support', 'Member support'],
  ['events', 'Events & engagement'],
  ['development', 'Development & bots'],
  ['other', 'Other'],
];

export function EmployerPanel({ user, profile, jobs, applications, conversations, onStartChat, onCreateJob, onUpdateJob, onUpdateApplication, onRenewJob }) {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renewingId, setRenewingId] = useState(null);
  const [form, setForm] = useState({
    server_name: '',
    role_title: '',
    description: '',
    category: 'moderation',
    responsibilities: '',
    requirements: '',
    experience_level: 'any',
    time_commitment: '',
    location: 'Remote',
    compensation_type: 'unspecified',
    compensation_details: '',
  });
  const ownedJobs = jobs.filter((job) => job.owner_id === user?.id);
  const isExpired = (job) => Boolean(job.expired_at) || new Date(job.expires_at) <= new Date();
  const isSuspended = profile?.is_suspended
    && (!profile.suspended_until || new Date(profile.suspended_until) > new Date());

  async function createJob(event) {
    event.preventDefault();
    setBusy(true);
    const succeeded = await onCreateJob(form);
    setBusy(false);
    if (succeeded) {
      setForm({
        server_name: '',
        role_title: '',
        description: '',
        category: 'moderation',
        responsibilities: '',
        requirements: '',
        experience_level: 'any',
        time_commitment: '',
        location: 'Remote',
        compensation_type: 'unspecified',
        compensation_details: '',
      });
      setShowForm(false);
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function renewJob(jobId) {
    setRenewingId(jobId);
    await onRenewJob(jobId);
    setRenewingId(null);
  }

  return (
    <section className="workspace-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">EMPLOYER WORKSPACE</p>
          <h2>Manage your listings</h2>
          <p className="section-heading__copy">Post a role and review people who apply.</p>
        </div>
        <button className="button button--primary employer-post-button" onClick={() => setShowForm(!showForm)} disabled={isSuspended}>
          {isSuspended ? 'Posting suspended' : showForm ? 'Close form' : '＋ Post a role'}
        </button>
      </div>
      {isSuspended && (
        <p className="suspension-notice">
          Your account is restricted from posting{profile.suspended_until ? ` until ${new Date(profile.suspended_until).toLocaleString()}` : ' permanently'}.
        </p>
      )}

      {showForm && (
        <form className="panel form-panel listing-builder" onSubmit={createJob}>
          <div className="listing-builder__heading">
            <div><p className="eyebrow">CREATE A CLEAR, TRUSTWORTHY ROLE</p><h3>Build your staff listing</h3></div>
            <span className="listing-builder__steps">Required details first · extras improve applicant fit</span>
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span>Server or community name</span>
              <input required minLength={2} maxLength={100} value={form.server_name} onChange={(event) => updateForm('server_name', event.target.value)} placeholder="The Cozy Corner" />
            </label>
            <label className="form-field">
              <span>Role title</span>
              <input required minLength={3} maxLength={100} value={form.role_title} onChange={(event) => updateForm('role_title', event.target.value)} placeholder="Community Moderator" />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              <span>Role category</span>
              <select value={form.category} onChange={(event) => updateForm('category', event.target.value)}>
                {LISTING_CATEGORIES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Experience level</span>
              <select value={form.experience_level} onChange={(event) => updateForm('experience_level', event.target.value)}>
                <option value="any">Open to all experience levels</option>
                <option value="entry">Entry level / training provided</option>
                <option value="intermediate">Some experience preferred</option>
                <option value="experienced">Experienced applicants</option>
              </select>
            </label>
          </div>
          <label className="form-field">
            <span>About the community and role</span>
            <textarea required minLength={30} maxLength={5000} rows={5} value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Introduce your server, explain why the role is open, and describe what success looks like…" />
            <small>{form.description.length}/5000 · Avoid sharing private invites, passwords, or sensitive member information.</small>
          </label>
          <details className="listing-builder__extras" open>
            <summary>Role expectations & conditions <span>Help people decide if this role is right for them</span></summary>
            <label className="form-field">
              <span>Responsibilities</span>
              <textarea maxLength={4000} rows={4} value={form.responsibilities} onChange={(event) => updateForm('responsibilities', event.target.value)} placeholder={'Welcome new members\nHelp enforce community guidelines\nEscalate difficult cases to senior staff'} />
              <small>{form.responsibilities.length}/4000 · Use a new line for each responsibility.</small>
            </label>
            <label className="form-field">
              <span>Requirements & preferred skills</span>
              <textarea maxLength={4000} rows={4} value={form.requirements} onChange={(event) => updateForm('requirements', event.target.value)} placeholder={'Be respectful and reliable\nHave a few hours available each week\nPrior moderation experience is helpful, not required'} />
              <small>{form.requirements.length}/4000 · Separate essentials from nice-to-haves.</small>
            </label>
            <div className="form-grid">
              <label className="form-field">
                <span>Expected time commitment</span>
                <input maxLength={120} value={form.time_commitment} onChange={(event) => updateForm('time_commitment', event.target.value)} placeholder="About 4 hours per week" />
              </label>
              <label className="form-field">
                <span>Location / time zone</span>
                <input required minLength={2} maxLength={100} value={form.location} onChange={(event) => updateForm('location', event.target.value)} placeholder="Remote · Any time zone" />
              </label>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>Compensation</span>
                <select value={form.compensation_type} onChange={(event) => updateForm('compensation_type', event.target.value)}>
                  <option value="unspecified">Not specified</option>
                  <option value="volunteer">Volunteer role</option>
                  <option value="unpaid">Unpaid role</option>
                  <option value="paid">Paid role</option>
                </select>
              </label>
              {form.compensation_type === 'paid' && (
                <label className="form-field">
                  <span>Pay details (be specific)</span>
                  <input required minLength={3} maxLength={250} value={form.compensation_details} onChange={(event) => updateForm('compensation_details', event.target.value)} placeholder="e.g. $15 USD per week; paid monthly" />
                </label>
              )}
            </div>
          </details>
          <aside className="listing-builder-preview" aria-live="polite">
            <span className="eyebrow">LIVE PREVIEW</span>
            <strong>{form.role_title || 'Your role title'}</strong>
            <span>{form.server_name || 'Your community'} · {LISTING_CATEGORIES.find(([value]) => value === form.category)?.[1]}</span>
            <p>{form.description || 'Your role description will appear here.'}</p>
            <div>
              <span>{form.location || 'Location not set'}</span>
              <span>{form.time_commitment || 'Time commitment not set'}</span>
              <span>{form.experience_level === 'any' ? 'All experience levels' : `${form.experience_level} experience`}</span>
              <span>{form.compensation_type === 'paid' ? form.compensation_details || 'Paid · add details' : form.compensation_type === 'unspecified' ? 'Compensation not specified' : form.compensation_type}</span>
            </div>
          </aside>
          <small>Listings stay open for 30 days. You can have 5 active roles and publish up to 3 listings per day; duplicate open roles are blocked.</small>
          <div className="listing-builder__actions">
            <button className="button button--primary" type="submit" disabled={busy || (form.compensation_type === 'paid' && form.compensation_details.trim().length < 3)}>
              {busy ? 'Publishing listing…' : 'Publish staff role'}
            </button>
            <button className="button button--outline" type="button" onClick={() => setShowForm(false)} disabled={busy}>Cancel</button>
          </div>
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
              <span className={`state-pill state-pill--${isExpired(job) ? 'expired' : job.status}`}>{isExpired(job) ? 'expired' : job.status}</span>
              <select aria-label={`Set status for ${job.role_title}`} value={job.status} disabled={isExpired(job)} onChange={(event) => onUpdateJob(job.id, event.target.value)}>
                <option value="open">Open</option><option value="closed">Closed</option><option value="filled">Filled</option>
              </select>
              {job.expired_at && (
                <button className="button button--outline" type="button" onClick={() => renewJob(job.id)} disabled={renewingId === job.id}>
                  {renewingId === job.id ? 'Renewing…' : 'Renew for 30 days'}
                </button>
              )}
              {isExpired(job) && !job.expired_at && <small>Renewal unlocks after expiry processing.</small>}
            </div>
            <div className="listing-row__review">
              {job.expired_at
                ? `Expired ${new Date(job.expired_at).toLocaleDateString()}`
                : `Expires ${new Date(job.expires_at).toLocaleDateString()}`}
              <span>{job.last_reviewed_at
                ? `Last staff reviewed ${new Date(job.last_reviewed_at).toLocaleDateString()}`
                : 'Not yet reviewed by staff'}</span>
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
              {application.profiles?.bio && <p className="applicant-profile-bio">{application.profiles.bio}</p>}
              {getSafeExternalUrl(application.profiles?.portfolio_data?.website) && (
                <a className="applicant-portfolio-link" href={getSafeExternalUrl(application.profiles.portfolio_data.website)} target="_blank" rel="noreferrer">
                  View applicant portfolio ↗
                </a>
              )}
              <small>{new Date(application.created_at).toLocaleDateString()}</small>
            </div>
            <label className="sr-only" htmlFor={`app-${application.id}`}>Application status</label>
            <select id={`app-${application.id}`} value={application.status} onChange={(event) => onUpdateApplication(application.id, event.target.value)}>
              <option value="pending">New</option><option value="reviewing">Reviewing</option><option value="interview">Interview</option><option value="accepted">Accepted</option><option value="rejected">Declined</option>
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
