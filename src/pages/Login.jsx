import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, register } from '../api/authApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../hooks/useToast.js';
import Toast from '../components/Toast.jsx';
import PrivacyModal from '../components/PrivacyModal.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import './Login.css';

const ALLOWED_DOMAIN = '@students.national-u.edu.ph';
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
const NAME_REGEX = /^[a-zA-Z\s\-']+$/;

export default function Login() {
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const { toast, showToast } = useToast();

  // ---- intro overlay (runs once, mirrors the old window.addEventListener('load', ...)) ----
  const [introDone, setIntroDone] = useState(false);
  const [brandIn, setBrandIn] = useState(false);
  const [brandOut, setBrandOut] = useState(false);
  const [taglineIn, setTaglineIn] = useState(false);
  const [taglineOut, setTaglineOut] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [slideIn, setSlideIn] = useState(false);

  useEffect(() => {
    // Already logged in — skip straight to dashboard, same as the old auth guard.
    if (user) {
      navigate('/dashboard', { replace: true });
      return;
    }
    const timers = [
      setTimeout(() => setBrandIn(true), 500),
      setTimeout(() => setTaglineIn(true), 1600),
      setTimeout(() => {
        setBrandOut(true);
        setTaglineOut(true);
      }, 3000),
      setTimeout(() => {
        setFadeOut(true);
        setSlideIn(true);
      }, 3500),
      setTimeout(() => setIntroDone(true), 5200),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- card + form state ----
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [pendingApproval, setPendingApproval] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginErrorField, setLoginErrorField] = useState(null);

  const [signupForm, setSignupForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [signupErrorField, setSignupErrorField] = useState(null);
  const [signupSubmitting, setSignupSubmitting] = useState(false);

  const [privacyOpen, setPrivacyOpen] = useState(false);
  const pendingSignupData = useRef(null);

  function fail(fieldSetter, field, message) {
    fieldSetter(field);
    showToast(message, 'error');
    setTimeout(() => fieldSetter(null), 500);
  }

  // ---- login ----
  async function handleLogin(e) {
    e.preventDefault();
    setPendingApproval(false);

    if (!loginEmail.trim()) return fail(setLoginErrorField, 'email', 'Please enter your email');
    if (!loginPassword) return fail(setLoginErrorField, 'password', 'Please enter your password');
    if (!loginEmail.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      return fail(setLoginErrorField, 'email', `Only ${ALLOWED_DOMAIN} emails are allowed`);
    }

    setLoginLoading(true);
    try {
      const data = await login({ email: loginEmail.trim(), password: loginPassword });
      signIn(data);
      showToast(`Welcome back, ${data.user.firstName}!`);
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      if (err.data?.message?.toLowerCase().includes('pending')) {
        setPendingApproval(true);
      } else {
        fail(setLoginErrorField, 'email', err.data?.message || 'Login failed');
      }
    } finally {
      setLoginLoading(false);
    }
  }

  // ---- signup: validate, then open privacy modal ----
  function handleSignupSubmit(e) {
    e.preventDefault();
    const { firstName, lastName, email, password, confirm } = signupForm;

    if (!firstName) return fail(setSignupErrorField, 'firstName', 'First name is required');
    if (!NAME_REGEX.test(firstName))
      return fail(setSignupErrorField, 'firstName', 'First name must contain letters only');
    if (!lastName) return fail(setSignupErrorField, 'lastName', 'Last name is required');
    if (!NAME_REGEX.test(lastName))
      return fail(setSignupErrorField, 'lastName', 'Last name must contain letters only');
    if (!email) return fail(setSignupErrorField, 'email', 'Email is required');
    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      return fail(setSignupErrorField, 'email', `Only ${ALLOWED_DOMAIN} emails are allowed`);
    }
    if (!password) return fail(setSignupErrorField, 'password', 'Password is required');
    if (!PASSWORD_REGEX.test(password)) {
      return fail(
        setSignupErrorField,
        'password',
        'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character'
      );
    }
    if (password !== confirm) return fail(setSignupErrorField, 'confirm', 'Passwords do not match');

    pendingSignupData.current = { firstName, lastName, email, password };
    setPrivacyOpen(true);
  }

  async function handlePrivacyAgree() {
    if (!pendingSignupData.current) return;
    setSignupSubmitting(true);
    try {
      await register(pendingSignupData.current);
      setPrivacyOpen(false);
      setSignupForm({ firstName: '', lastName: '', email: '', password: '', confirm: '' });
      setMode('login');
      setPendingApproval(true);
      showToast('Account submitted! Awaiting admin approval.');
    } catch (err) {
      setPrivacyOpen(false);
      fail(setSignupErrorField, 'email', err.data?.message || 'Registration failed');
    } finally {
      pendingSignupData.current = null;
      setSignupSubmitting(false);
    }
  }

  function handlePrivacyCancel() {
    setPrivacyOpen(false);
    pendingSignupData.current = null;
  }

  return (
    <>
      {!introDone && (
        <div className={`intro-overlay${fadeOut ? ' fade-out' : ''}`} style={{ display: 'flex' }}>
          <div className={`intro-brand${brandIn ? ' brand-in' : ''}${brandOut ? ' brand-out' : ''}`}>
            <div className="intro-icon">
              <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="rgba(255,255,255,0.15)" />
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
            <span className="intro-name">Enyukado</span>
          </div>
          <p className={`intro-tagline${taglineIn ? ' tagline-in' : ''}${taglineOut ? ' tagline-out' : ''}`}>
            Your campus marketplace
          </p>
        </div>
      )}

      <div className={`page-wrapper${slideIn ? ' slide-in' : ''}`}>
        {/* LEFT PANEL */}
        <div className="left-panel">
          <div className="left-inner">
            <div className="brand">
              <div className="brand-icon">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
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
              <span className="brand-name">Enyukado</span>
            </div>

            <div className="left-content">
              <div className="tagline-block">
                <h1 className="tagline-heading">Buy and sell within the campus — safely.</h1>
                <p className="tagline-sub">The marketplace for Nationalians.</p>
              </div>

              <div className="features">
                <Feature icon="🔒" title="Verified Student Access">
                  Only registered and verified students can use the platform, ensuring a safer
                  marketplace.
                </Feature>
                <Feature icon="🏷️" title="Organized Listings with Categories">
                  Items are grouped into categories for easier browsing and searching.
                </Feature>
                <Feature icon="🤝" title="Direct Messaging Between Users">
                  Message other users directly to ask questions, discuss items, and communicate
                  about transactions.
                </Feature>
              </div>
            </div>
          </div>

          <div className="blob blob-1" />
          <div className="blob blob-2" />
        </div>

        {/* RIGHT PANEL */}
        <div className="right-panel">
          <div className="right-inner">
            {mode === 'login' && (
              <form className="form-card" onSubmit={handleLogin}>
                <div className="form-header">
                  <h2>Log in</h2>
                  <p>Access your campus marketplace.</p>
                </div>

                {pendingApproval && (
                  <div className="pending-notice show">
                    ⏳ Your account is pending admin approval. You&apos;ll be able to log in once
                    approved.
                  </div>
                )}

                <div className="input-group">
                  <label htmlFor="loginEmail">University Email</label>
                  <div className="input-wrap">
                    <MailIcon />
                    <input
                      id="loginEmail"
                      type="email"
                      placeholder="yourname@students.national-u.edu.ph"
                      autoComplete="off"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      style={loginErrorField === 'email' ? { borderColor: '#e0504a' } : undefined}
                    />
                  </div>
                </div>

                <PasswordInput
                  id="loginPassword"
                  label="Password"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={setLoginPassword}
                  errored={loginErrorField === 'password'}
                />

                <div className="form-options">
                  <a
                    href="#"
                    className="forgot-link"
                    onClick={(e) => {
                      e.preventDefault();
                      showToast('Please contact contact.enyukado@gmail.com to reset your password.');
                    }}
                  >
                    Forgot password?
                  </a>
                </div>

                <button className="btn-primary" type="submit" disabled={loginLoading}>
                  <span>{loginLoading ? 'Logging in...' : 'Log in'}</span>
                  <ArrowIcon />
                </button>

                <p className="switch-cta">
                  No account yet?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setMode('signup');
                      setPendingApproval(false);
                    }}
                  >
                    Sign up
                  </a>
                </p>

                <div className="legal-note">
                  By logging in, you agree to our <Link to="/terms">Terms &amp; Conditions</Link>{' '}
                  and <Link to="/privacy">Privacy Policy</Link>.
                </div>
              </form>
            )}

            {mode === 'signup' && (
              <form className="form-card" onSubmit={handleSignupSubmit}>
                <div className="form-header">
                  <h2>Create account</h2>
                  <p>Join the trusted campus marketplace.</p>
                </div>

                <div className="row-2cols">
                  <div className="input-group">
                    <label htmlFor="signupFirst">First name</label>
                    <div className="input-wrap">
                      <PersonIcon />
                      <input
                        id="signupFirst"
                        placeholder="Juan"
                        value={signupForm.firstName}
                        onChange={(e) =>
                          setSignupForm((f) => ({ ...f, firstName: e.target.value }))
                        }
                        style={signupErrorField === 'firstName' ? { borderColor: '#e0504a' } : undefined}
                      />
                    </div>
                  </div>
                  <div className="input-group">
                    <label htmlFor="signupLast">Last name</label>
                    <div className="input-wrap">
                      <PersonIcon />
                      <input
                        id="signupLast"
                        placeholder="Dela Cruz"
                        value={signupForm.lastName}
                        onChange={(e) =>
                          setSignupForm((f) => ({ ...f, lastName: e.target.value }))
                        }
                        style={signupErrorField === 'lastName' ? { borderColor: '#e0504a' } : undefined}
                      />
                    </div>
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="signupEmail">University Email</label>
                  <div className="input-wrap">
                    <MailIcon />
                    <input
                      id="signupEmail"
                      type="email"
                      placeholder="delacruzja@students.national-u.edu.ph"
                      value={signupForm.email}
                      onChange={(e) => setSignupForm((f) => ({ ...f, email: e.target.value }))}
                      style={signupErrorField === 'email' ? { borderColor: '#e0504a' } : undefined}
                    />
                  </div>
                </div>

                <div className="row-2cols">
                  <PasswordInput
                    id="signupPassword"
                    label="Password"
                    placeholder="Create password"
                    value={signupForm.password}
                    onChange={(v) => setSignupForm((f) => ({ ...f, password: v }))}
                    errored={signupErrorField === 'password'}
                  />
                  <PasswordInput
                    id="signupConfirm"
                    label="Confirm password"
                    placeholder="Confirm password"
                    value={signupForm.confirm}
                    onChange={(v) => setSignupForm((f) => ({ ...f, confirm: v }))}
                    errored={signupErrorField === 'confirm'}
                  />
                </div>

                <button className="btn-primary" type="submit">
                  <span>Create account</span>
                  <ArrowIcon />
                </button>

                <p className="switch-cta">
                  Already have an account?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setMode('login');
                    }}
                  >
                    Log in
                  </a>
                </p>

                <div className="legal-note">
                  By signing up, you agree to our <Link to="/terms">Terms &amp; Conditions</Link>{' '}
                  and <Link to="/privacy">Privacy Policy</Link>.
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      <PrivacyModal
        open={privacyOpen}
        onAgree={handlePrivacyAgree}
        onCancel={handlePrivacyCancel}
        submitting={signupSubmitting}
      />

      <Toast show={toast.show} message={toast.message} type={toast.type} />
    </>
  );
}

function Feature({ icon, title, children }) {
  return (
    <div className="feature-item">
      <div className="feature-icon">{icon}</div>
      <div className="feature-text">
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
