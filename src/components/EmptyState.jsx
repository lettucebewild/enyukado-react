import './EmptyState.css';

const ICONS = {
  cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.6 12.2a1.5 1.5 0 001.5 1.2h8.4a1.5 1.5 0 001.5-1.1L21 8H6" /></>,
  message: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  activity: <polyline points="3 12 7 12 10 4 14 20 17 12 21 12" />,
  bag: <><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></>,
  heart: <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />,
  star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  box: <><path d="M16.5 9.4L7.5 4.21" /><path d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.3 7L12 12l8.7-5" /><path d="M12 22V12" /></>,
};

const ACTION_ICONS = {
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  search: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  clear: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
};

// Shared empty state used by Cart, Messages, Your activity and Profile listings.
// icon: 'cart' | 'message' | 'activity' | 'box' | 'search' | 'bag' | 'heart' | 'star'
// boxed: wraps the empty state in a white card (used on the Profile page)   actionIcon: 'plus' | 'search' | 'clear'
export default function EmptyState({ icon, title, text, actionLabel, actionIcon = 'search', onAction, boxed = false }) {
  return (
    <div className={`empty-state-card${boxed ? ' boxed' : ''}`}>
      <div className="es-art">
        <span className="es-dot es-dot-1" />
        <span className="es-dot es-dot-2" />
        <div className="es-art-inner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[icon]}
          </svg>
        </div>
      </div>
      <div className="es-title">{title}</div>
      <div className="es-text">{text}</div>
      {actionLabel && (
        <button type="button" className="es-btn" onClick={onAction}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {ACTION_ICONS[actionIcon]}
          </svg>
          {actionLabel}
        </button>
      )}
    </div>
  );
}