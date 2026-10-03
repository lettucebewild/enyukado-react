import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LegalLayout.css';

// Shared shell for the Terms & Conditions / Privacy Policy pages.
export default function LegalLayout({ title, updated, footer, children }) {
  const navigate = useNavigate();

  // index.css locks the body for the Login intro (overflow: hidden + gradient).
  // Swap in the light, scrollable page, same as Dashboard does.
  useEffect(() => {
    document.body.classList.add('scroll-page');
    document.documentElement.classList.add('scroll-page');
    window.scrollTo(0, 0);
    return () => {
      document.body.classList.remove('scroll-page');
      document.documentElement.classList.remove('scroll-page');
    };
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = `Enyukado · ${title}`;
    return () => { document.title = previous; };
  }, [title]);

  // These pages open in a new tab from the signup modal, where there is no
  // history to go back to — fall back to the login page in that case.
  function goBack() {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/');
  }

  return (
    <div className="legal-page">
      <nav className="legal-nav">
        <button type="button" className="legal-back" onClick={goBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Go back
        </button>
      </nav>

      <main className="legal-main">
        <div className="legal-badge">Legal</div>
        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        <div className="legal-divider" />

        {children}

        <div className="legal-footer">{footer}</div>
      </main>
    </div>
  );
}
