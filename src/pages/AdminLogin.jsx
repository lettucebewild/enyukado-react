import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin, getAdminSession, setAdminSession } from '../api/adminApi.js';
import BrandLogo from '../components/BrandLogo.jsx';
import './AdminLogin.css';

const icon = (children) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

const FEATURES = [
  { emoji: '👤', title: 'Account Approvals', text: 'Review and approve student registrations before they can access the marketplace.' },
  { emoji: '📦', title: 'Listing Approvals', text: 'Review product listings before they go live to ensure quality and compliance.' },
  { emoji: '💳', title: 'Payment Verification', text: 'Verify payment proofs uploaded by buyers to authorize transactions.' },
];

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getAdminSession()) navigate('/admin', { replace: true });
    // body is overflow:hidden by default (for the student login intro); allow scrolling here
    document.body.classList.add('scroll-page');
    document.documentElement.classList.add('scroll-page');
    return () => {
      document.body.classList.remove('scroll-page');
      document.documentElement.classList.remove('scroll-page');
    };
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setLoading(true);
    try {
      const data = await adminLogin(email.trim(), password);
      setAdminSession({ token: data.token, name: data.user.firstName });
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="al-page">
      <section className="al-left">
        <div className="al-left-inner">
          <div className="al-brand">
            <span className="al-brand-icon"><BrandLogo size={26} stroke="#8fbbee" /></span>
            <span className="al-brand-name">Enyukado</span>
          </div>

          <div className="al-content">
          <span className="al-pill"><i />Admin Portal</span>
          <h1>Marketplace Administration</h1>
          <p className="al-lead">Behind the marketplace for Nationalians.</p>

          <ul className="al-features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className="al-feature-icon">{f.emoji}</span>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
          </div>
        </div>
      </section>

      <section className="al-right">
        <div className="al-right-inner">
        <form className="al-form" onSubmit={handleSubmit}>
          <h2>Admin Login</h2>
          <p className="al-sub">Restricted access — authorized personnel only.</p>
          <hr />

          {error && <div className="al-error" role="alert">{error}</div>}

          <label htmlFor="alEmail">Admin Email</label>
          <div className="al-field">
            {icon(<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>)}
            <input id="alEmail" type="email" placeholder="Enter email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <label htmlFor="alPassword">Password</label>
          <div className="al-field">
            {icon(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>)}
            <input id="alPassword" type={show ? 'text' : 'password'} placeholder="Enter password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="al-eye" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>
              {!show
                ? icon(<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>)
                : icon(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>)}
            </button>
          </div>

          <button className="al-submit" type="submit" disabled={loading}>
            {icon(<><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></>)}
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        </div>
      </section>
    </div>
  );
}
