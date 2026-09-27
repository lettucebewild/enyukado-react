import ProfileMenu from './ProfileMenu.jsx';

// Shared top navbar. Used as-is on Dashboard and Profile (no `onBack`/`title`),
// and reused inside every full-page panel (Product, Messages, Cart, Sell) so
// they all get the exact same header — with a back arrow + page title added
// on the left when those panels pass `onBack`/`title` in.
export default function AppHeader({
  onBack,
  title,
  cartCount = 0,
  unreadCount = 0,
  onOpenCart,
  onOpenMessages,
  onOpenSell,
  onBrandClick,
  initials,
  onProfile,
  onChangePassword,
  onLogout,
}) {
  return (
    <>
      <nav className="navbar">
        <div className="navbar-left">
          <button className="navbar-brand" onClick={onBrandClick}>
            <div className="navbar-brand-icon">
              <svg width="34" height="34" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#326fca" />
                <path
                  d="M7 8h2l2.5 9h8l2-6H11"
                  stroke="#ffe7be"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="13.5" cy="21.5" r="1.5" fill="#f4f5f7" />
                <circle cx="19.5" cy="21.5" r="1.5" fill="#f4f5f7" />
              </svg>
            </div>
            <span className="navbar-brand-name">Enyukado</span>
          </button>
        </div>
        <div className="navbar-right">
          <button className="btn-icon-pill" onClick={onOpenMessages}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <span className="btn-messages-label">Messages</span>
            <span className={`pill-badge${unreadCount > 0 ? ' show' : ''}`}>{unreadCount}</span>
          </button>
          <button className="btn-icon-pill" onClick={onOpenCart}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" /></svg>
            <span className="btn-messages-label">Cart</span>
            <span className={`pill-badge${cartCount > 0 ? ' show' : ''}`}>{cartCount}</span>
          </button>
          <button className="btn-sell" onClick={onOpenSell}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Sell
          </button>
          <ProfileMenu
            initials={initials}
            onProfile={onProfile}
            onChangePassword={onChangePassword}
            onLogout={onLogout}
          />
        </div>
      </nav>
      {(onBack || title) && (
        <div className="panel-subheader">
          {onBack && (
            <button className="fullpanel-back" onClick={onBack}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          )}
          {title && <span className="fullpanel-title">{title}</span>}
        </div>
      )}
    </>
  );
}
