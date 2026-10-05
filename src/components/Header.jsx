import { useState } from 'react';

export default function Header({
  user,
  displayName,
  profile,
  activeView,
  onNavigate,
  adminLevel,
  adminReviewCount = 0,
  prInboxCount = 0,
  unreadCount = 0,
  onSignIn,
  onSignOut,
  authBusy,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const navigate = (view) => {
    onNavigate(view);
    setWorkspaceOpen(false);
    setMobileMenuOpen(false);
  };
  const workspaceLinks = [
    { id: 'profile', label: 'My profile' },
    { id: 'applications', label: 'My applications' },
    { id: 'notifications', label: 'Inbox', badge: unreadCount },
    { id: 'messages', label: 'Chats & messages' },
    ...(profile?.is_pr_manager || adminLevel >= 6 ? [{ id: 'pr-contact', label: 'PR team inbox', badge: prInboxCount }] : []),
    ...(adminLevel >= 1 ? [{ id: 'admin', label: 'Staff dashboard', badge: adminReviewCount }] : []),
  ];

  return (
    <header className="site-header">
      <button className="brand brand-button" onClick={() => navigate('opportunities')} aria-label="ModLink home">
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
          <button
            className={`site-header__link${activeView === 'opportunities' ? ' is-active' : ''}`}
            onClick={() => navigate('opportunities')}
          >
            Find roles
          </button>
          <button
            className="button button--primary header-post-button"
            onClick={() => (user ? navigate('employer') : onSignIn())}
            disabled={authBusy}
            title={user ? 'Create and manage job listings' : 'Sign in to post a role'}
          >
            {user ? 'Post a role' : 'Sign in to post'}
          </button>
          <button
            className={`site-header__link${activeView === 'pr-contact' ? ' is-active' : ''}`}
            onClick={() => navigate('pr-contact')}
          >
            Partnerships & ads
          </button>
          {user && (
            <div className="workspace-menu">
              <button
                className={`site-header__link workspace-menu__toggle${['profile', 'applications', 'notifications', 'messages', 'admin', 'pr-contact'].includes(activeView) ? ' is-active' : ''}`}
                type="button"
                aria-expanded={workspaceOpen}
                aria-controls="workspace-menu-items"
                onClick={() => setWorkspaceOpen((open) => !open)}
              >
                My workspace <span aria-hidden="true">{workspaceOpen ? '⌃' : '⌄'}</span>
                {(unreadCount + adminReviewCount) > 0 && <span className="nav-count">{Math.min(unreadCount + adminReviewCount, 99)}{unreadCount + adminReviewCount > 99 ? '+' : ''}</span>}
              </button>
              {workspaceOpen && (
                <div className="workspace-menu__items" id="workspace-menu-items">
                  {workspaceLinks.map((item) => (
                    <button
                      className={`site-header__link${activeView === item.id ? ' is-active' : ''}`}
                      key={item.id}
                      onClick={() => navigate(item.id)}
                    >
                      {item.label}
                      {item.badge > 0 && <span className="nav-count">{item.badge > 99 ? '99+' : item.badge}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
            {profile?.is_pr_manager && <span className="rank-badge rank-badge--pr">PR Manager</span>}
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
