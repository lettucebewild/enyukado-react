import ProfileMenu from './ProfileMenu.jsx';
import './AppHeader.css';

// Shared top navbar. Used as-is on Dashboard and Profile (no `onBack`/`title`),
// and reused inside every full-page panel (Product, Messages, Cart, Sell) so
// they all get the exact same header — with a back arrow + page title added
// in a sub-row when those panels pass `onBack`/`title` in.
//
// The nav pill (Browse / Messages / Cart) is centered in the header.
// `active` highlights one item: 'browse' | 'messages' | 'cart' | 'none'.
// When omitted it defaults to 'browse' on the main pages and to nothing
// inside panels (anything that passes `onBack`).
//
// Sub-row (panels): back arrow + either a plain `title`, or a breadcrumb trail
// via `crumbs` = [{ label, onClick? }, ...]. The last crumb is the current
// page; earlier ones with an `onClick` are links. Pass `{ label: 'Browse' }`
// without onClick and it will go home automatically.
//
// `within` marks the nav item whose section the current page lives in
// ('browse' for Product / Sell). It gets a thin underline instead of the full
// pill, so it reads "you're inside Browse" rather than "you're on Browse".
export default function AppHeader({
  onBack,
  title,
  crumbs,
  within,
  active,
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
  const current = active ?? (onBack ? 'none' : 'browse');
  const goHome = onBrandClick || onBack;

  const cls = (name) =>
    `app-header-link${current === name ? ' active' : current !== name && within === name ? ' within' : ''}`;

  return (
    <>
      <header className="app-header">
        <button className="app-header-brand" onClick={onBrandClick}>
          <span className="app-header-brand-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="9" fill="#326fca" />
              <path
                d="M7 8h2l2.5 9h8l2-6H11"
                stroke="#ffe7be"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="13.5" cy="21.5" r="1.5" fill="#f4f5f7" />
              <circle cx="19.5" cy="21.5" r="1.5" fill="#f4f5f7" />
            </svg>
          </span>
          <span className="app-header-brand-name">Enyukado</span>
        </button>

        <nav className="app-header-pill" aria-label="Main">
          <button className={cls('browse')} onClick={goHome} title="Browse" aria-label="Browse">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
            <span className="app-header-link-label">Browse</span>
          </button>
          <button className={cls('messages')} onClick={onOpenMessages} title="Messages" aria-label="Messages">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <span className="app-header-link-label">Messages</span>
            {unreadCount > 0 && <span className="app-header-count">{unreadCount}</span>}
          </button>
          <button className={cls('cart')} onClick={onOpenCart} title="Cart" aria-label="Cart">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" /></svg>
            <span className="app-header-link-label">Cart</span>
            {cartCount > 0 && <span className="app-header-count">{cartCount}</span>}
          </button>
        </nav>

        <div className="app-header-right">
          <button className="app-header-sell" onClick={onOpenSell}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span className="app-header-sell-label">Sell</span>
          </button>
          <ProfileMenu
            initials={initials}
            onProfile={onProfile}
            onChangePassword={onChangePassword}
            onLogout={onLogout}
          />
        </div>
      </header>

      {(onBack || title || crumbs) && (
        <div className="panel-subheader">
          {onBack && (
            <button className="fullpanel-back" onClick={onBack}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          )}
          {crumbs ? (
            <nav className="crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                const click = c.onClick || (c.label === 'Browse' ? goHome : undefined);
                return (
                  <span className="crumb-item" key={i}>
                    {i > 0 && (
                      <svg className="crumb-sep" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
                    )}
                    {last || !click ? (
                      <span className={last ? 'crumb current' : 'crumb'} aria-current={last ? 'page' : undefined} title={c.label}>{c.label}</span>
                    ) : (
                      <button type="button" className="crumb link" onClick={click}>{c.label}</button>
                    )}
                  </span>
                );
              })}
            </nav>
          ) : (
            title && <span className="fullpanel-title">{title}</span>
          )}
        </div>
      )}
    </>
  );
}