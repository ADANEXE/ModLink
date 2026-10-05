import { useEffect, useMemo, useState } from 'react';
import SponsoredCampaign from './SponsoredCampaign.jsx';

export default function JobFeed({ jobs, ads = [], focusListingId, onClearFocus, loading, user, profile, onApply, onReport, onSignIn }) {
  const [search, setSearch] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [dialogMode, setDialogMode] = useState('apply');
  const [experience, setExperience] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!focusListingId) return;
    const focusedJob = jobs.find((job) => job.id === focusListingId);
    if (focusedJob) {
      setSelectedJob(focusedJob);
      setDialogMode('apply');
      onClearFocus();
    }
  }, [focusListingId, jobs, onClearFocus]);

  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesSearch = !query
        || `${job.server_name} ${job.role_title} ${job.description}`.toLowerCase().includes(query);
      return job.status === 'open' && matchesSearch && (!featuredOnly || job.is_featured);
    });
  }, [jobs, search, featuredOnly]);
  const listingAds = ads.filter((campaign) => campaign.placements?.includes('listing_feed'));
  const listingItems = [];
  let nextAdIndex = 0;

  function renderJobCard(job) {
    return (
      <article className="job-card" key={`job-${job.id}`}>
        <div className="job-card__top">
          <span className="server-avatar server-avatar--violet job-card__server-mark" aria-hidden="true">
            {job.server_name.slice(0, 2).toUpperCase()}
          </span>
          {job.is_featured
            ? <span className="featured-label job-card__featured"><span aria-hidden="true">✦</span> Featured role</span>
            : <span className="job-status job-card__open"><i /> Accepting applications</span>}
        </div>
        <p className="job-card__server"><span aria-hidden="true">◈</span> {job.server_name}</p>
        <h3 className="job-card__title">{job.role_title}</h3>
        <p className="job-card__detail job-card__description">{job.description || 'Join this community and help make it a welcoming place.'}</p>
        <div className="job-card__posted">
          <span>Discord community role</span>
          {job.created_at && <time dateTime={job.created_at}>Posted {new Date(job.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>}
        </div>
        <div className="job-card__actions">
          <button className="job-card__action" type="button" onClick={() => { setDialogMode('apply'); setSelectedJob(job); }}>
            View role & application details <span aria-hidden="true">→</span>
          </button>
          {user && (
            <button className="report-link" type="button" onClick={() => { setDialogMode('report'); setSelectedJob(job); }}>
              Report listing
            </button>
          )}
        </div>
      </article>
    );
  }

  visibleJobs.forEach((job, index) => {
    listingItems.push(renderJobCard(job));
    if ((index + 1) % 3 === 0 && listingAds[nextAdIndex]) {
      const campaign = listingAds[nextAdIndex];
      listingItems.push(<SponsoredCampaign campaign={campaign} key={`ad-${campaign.id}`} />);
      nextAdIndex += 1;
    }
  });
  listingAds.slice(nextAdIndex).forEach((campaign) => {
    listingItems.push(<SponsoredCampaign campaign={campaign} key={`ad-${campaign.id}`} />);
  });

  async function submitApplication(event) {
    event.preventDefault();
    setSubmitting(true);
    const succeeded = await onApply(selectedJob, experience);
    setSubmitting(false);
    if (succeeded) {
      setSelectedJob(null);
      setExperience('');
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    setSubmitting(true);
    const succeeded = await onReport(selectedJob, reportReason);
    setSubmitting(false);
    if (succeeded) {
      setSelectedJob(null);
      setReportReason('');
    }
  }

  return (
    <section className="opportunities" id="opportunities" aria-labelledby="feed-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">FIND YOUR NEXT COMMUNITY ROLE</p>
          <h2 id="feed-title">Open Discord staff opportunities</h2>
          <p className="section-heading__copy">Browse moderator jobs and community team openings posted by Discord servers.</p>
        </div>
        <label className="search-field">
          <span className="sr-only">Search jobs</span>
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roles or servers" />
        </label>
      </div>
      <div className="feed-toolbar">
        <span>{loading ? 'Loading opportunities…' : `${visibleJobs.length} open ${visibleJobs.length === 1 ? 'role' : 'roles'}`}</span>
        <label className="filter-toggle">
          <input type="checkbox" checked={featuredOnly} onChange={(event) => setFeaturedOnly(event.target.checked)} />
          Featured only
        </label>
      </div>
      <div className="role-search-chips" aria-label="Popular role searches">
        <span>Popular:</span>
        {['Moderator', 'Community', 'Support', 'Gaming'].map((term) => (
          <button
            className={search.toLowerCase() === term.toLowerCase() ? 'is-active' : ''}
            type="button"
            key={term}
            aria-pressed={search.toLowerCase() === term.toLowerCase()}
            onClick={() => setSearch(search.toLowerCase() === term.toLowerCase() ? '' : term)}
          >
            {term}
          </button>
        ))}
        {search && <button className="role-search-chips__clear" type="button" onClick={() => setSearch('')}>Clear filters</button>}
      </div>
      {loading ? (
        <div className="empty-state"><span className="loading-spinner" />Loading opportunities</div>
      ) : visibleJobs.length ? (
        <div className="job-grid">
          {listingItems}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">✦</span>
          <h3>{jobs.length ? 'No matching roles' : 'Your next community starts here'}</h3>
          <p>{jobs.length ? 'Try changing your search or featured filter.' : 'There are no open listings yet. Sign in to post an opportunity or check back soon.'}</p>
        </div>
      )}
      {!loading && !visibleJobs.length && listingAds.length > 0 && (
        <div className="job-grid job-grid--sponsored" aria-label="Sponsored campaigns between job listings">
          {listingAds.map((campaign) => <SponsoredCampaign campaign={campaign} key={campaign.id} />)}
        </div>
      )}

      {selectedJob && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedJob(null);
        }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="apply-title">
            <button className="dialog__close" type="button" onClick={() => setSelectedJob(null)} aria-label="Close">×</button>
            <p className="eyebrow">{selectedJob.server_name}</p>
            <h2 id="apply-title">{selectedJob.role_title}</h2>
            <div className="listing-dialog__meta">
              <span className={`state-pill state-pill--${selectedJob.status}`}>{selectedJob.status}</span>
              {selectedJob.is_featured && <span className="featured-label">✦ Featured opportunity</span>}
              <span className="job-card__server">Posted {new Date(selectedJob.created_at).toLocaleDateString()}</span>
            </div>
            <p className="dialog__description">{selectedJob.description}</p>
            {dialogMode === 'report' ? (
              <form onSubmit={submitReport}>
                <label className="form-field">
                  <span>Why are you reporting this listing?</span>
                  <textarea required minLength={10} maxLength={1000} rows={4} value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="Describe the rule-breaking content or concern…" />
                </label>
                <button className="button button--primary button--full" type="submit" disabled={submitting}>
                  {submitting ? 'Sending report…' : 'Submit report'}
                </button>
              </form>
            ) : selectedJob.status !== 'open' ? (
              <p className="suspension-notice">This listing is no longer accepting applications.</p>
            ) : user ? (
              profile?.is_suspended && (!profile.suspended_until || new Date(profile.suspended_until) > new Date()) ? (
                <p className="suspension-notice">
                  Your account is restricted from applying{profile.suspended_until ? ` until ${new Date(profile.suspended_until).toLocaleString()}` : ' permanently'}.
                </p>
              ) : (
              <form onSubmit={submitApplication}>
                <label className="form-field">
                  <span>Tell the team about your experience</span>
                  <textarea required minLength={20} maxLength={3000} rows={5} value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="Share relevant moderation experience, availability, and what makes you a good fit…" />
                  <small>At least 20 characters. Your Discord profile will be shared with the listing owner.</small>
                </label>
                <button className="button button--primary button--full" type="submit" disabled={submitting}>
                  {submitting ? 'Sending application…' : 'Submit application'}
                </button>
              </form>
              )
            ) : (
              <div className="dialog__signin">
                <p>Sign in with Discord to send your application.</p>
                <button className="button button--primary button--full" onClick={onSignIn}>Continue with Discord</button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
