import { useEffect, useState } from 'react';

const RANKS = ['Community member', 'Trial Moderator', 'Junior Moderator', 'Moderator', 'Senior Moderator', 'Senior Admin', 'Owner'];

export default function ProfilePanel({
  profile,
  displayName,
  applications,
  listings,
  conversations,
  unreadCount,
  onSaveProfile,
  onNavigate,
}) {
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [website, setWebsite] = useState(profile?.portfolio_data?.website || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsername(profile?.username || '');
    setBio(profile?.bio || '');
    setWebsite(profile?.portfolio_data?.website || '');
  }, [profile]);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    await onSaveProfile({
      username: username.trim(),
      bio: bio.trim(),
      website: website.trim(),
    });
    setSaving(false);
  }

  const stats = [
    { label: 'Applications', value: applications.length, view: 'applications' },
    { label: 'Your listings', value: listings.length, view: 'employer' },
    { label: 'Conversations', value: conversations.length, view: 'messages' },
    { label: 'Unread inbox', value: unreadCount, view: 'notifications' },
  ];

  return (
    <section className="workspace-section profile-dashboard">
      <div className="profile-hero panel">
        <span className="profile-hero__avatar" aria-hidden="true">{(displayName || '?').slice(0, 1).toUpperCase()}</span>
        <div className="profile-hero__identity">
          <p className="eyebrow">YOUR MODLINK ACCOUNT</p>
          <h2>{displayName}</h2>
          <span>{RANKS[profile?.admin_level || 0]}{profile?.is_verified_moderator ? ' · Verified moderator' : ''}</span>
        </div>
        <button className="button button--outline" type="button" onClick={() => onNavigate('opportunities')}>Explore roles</button>
      </div>

      <div className="profile-stat-grid">
        {stats.map((stat) => (
          <button className="panel profile-stat" key={stat.label} type="button" onClick={() => onNavigate(stat.view)}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>View →</small>
          </button>
        ))}
      </div>

      <div className="profile-content-grid">
        <form className="panel form-panel profile-edit-form" onSubmit={saveProfile}>
          <div className="profile-section-heading">
            <div><p className="eyebrow">MAKE IT YOURS</p><h3>Profile details</h3></div>
            {profile?.is_verified_moderator && <span className="verified-badge">✓ Verified</span>}
          </div>
          <label className="form-field">
            <span>Display name</span>
            <input required minLength={2} maxLength={40} value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="form-field">
            <span>About you</span>
            <textarea rows={5} maxLength={500} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Share your moderation style, experience, or the communities you enjoy helping." />
            <small>{bio.length}/500 characters</small>
          </label>
          <label className="form-field">
            <span>Portfolio or community link</span>
            <input type="url" maxLength={500} value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" />
          </label>
          <button className="button button--primary" type="submit" disabled={saving || username.trim().length < 2}>
            {saving ? 'Saving profile…' : 'Save profile'}
          </button>
        </form>

        <aside className="panel profile-guidance">
          <p className="eyebrow">YOUR NEXT STEP</p>
          <h3>Build your community story.</h3>
          <p>A clear introduction and a link to your work help listing owners understand how you can contribute.</p>
          <div className="profile-completion">
            <span className={bio.trim() ? 'is-complete' : ''}>About section {bio.trim() ? 'complete' : 'to do'}</span>
            <span className={website.trim() ? 'is-complete' : ''}>Portfolio link {website.trim() ? 'added' : 'optional'}</span>
          </div>
          <button className="button button--outline button--full" type="button" onClick={() => onNavigate('applications')}>Track applications</button>
        </aside>
      </div>
    </section>
  );
}
