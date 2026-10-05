import { useState } from 'react';

export default function Header({
  user,
  displayName,
  profile,
  activeView,
  onNavigate,
  adminLevel,
  unreadCount = 0,
  onSignIn,
  onSignOut,
  authBusy,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigation = [
    { id: 'opportunities', label: 'Find a role' },
    ...(user ? [
      { id: 'profile', label: 'My profile' },
      { id: 'applications', label: 'My applications' },
      { id: 'employer', label: 'Employer tools' },
      { id: 'notifications', label: 'Inbox', badge: unreadCount },
      { id: 'messages', label: 'Messages' },
    ] : []),
    ...(user && adminLevel >= 1 ? [{ id: 'admin', label: 'Moderation' }] : []),
  ];

  return (
    <header className="site-header">
      <button className="brand brand-button" onClick={() => onNavigate('opportunities')} aria-label="ModLink home">
        <span className="brand__mark" aria-hidden="true">M</span>
        <span>mod<span className="brand__accent">link</span></span>
      </button>
      <button
        className="mobile-menu-toggle"
        type="button"
        aria-expanded={mobileMenuOpen}
        aria-controls="site-navigation"
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        <span aria-hidden="true">{mobileMenuOpen ? '×' : '☰'}</span>
        <span>{mobileMenuOpen ? 'Close menu' : 'Menu'}</span>
      </button>
      <nav
        className={`site-header__nav${mobileMenuOpen ? ' is-mobile-open' : ''}`}
        id="site-navigation"
        aria-label="Main navigation"
      >
        <div className="main-nav">
          {navigation.map((item) => (
            <button
              className={`site-header__link${activeView === item.id ? ' is-active' : ''}`}
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                setMobileMenuOpen(false);
              }}
            >
              {item.label}
              {item.badge > 0 && <span className="nav-count">{item.badge > 99 ? '99+' : item.badge}</span>}
            </button>
          ))}
        </div>
        {user ? (
          <div className="account-actions">
            <span className="account-actions__name" title={displayName}>{displayName}</span>
            {profile?.admin_level > 0 && (
              <span className="rank-badge" title={`Admin level ${profile.admin_level}`}>
                {['', 'Trial Mod', 'Jr Mod', 'Moderator', 'Sr Mod', 'Sr Admin', 'Owner'][profile.admin_level]}
              </span>
            )}
            {profile?.is_verified_moderator && (
              <span className="verified-badge" title="Verified moderator">✓ Verified</span>
            )}
            <button className="button button--quiet" onClick={onSignOut} disabled={authBusy}>
              {authBusy ? 'Please wait…' : 'Sign out'}
            </button>
          </div>
        ) : (
          <button className="button button--primary" onClick={onSignIn} disabled={authBusy}>
            {authBusy ? 'Please wait…' : 'Continue with Discord'}
          </button>
        )}
      </nav>
    </header>
  );
}
