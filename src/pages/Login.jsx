import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  login,
  register,
  requestPasswordResetCode,
  resetPassword,
  verifyPasswordResetCode,
} from '../api/authApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../hooks/useToast.js';
import Toast from '../components/Toast.jsx';
import PrivacyModal from '../components/PrivacyModal.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import './Login.css';

const ALLOWED_DOMAIN = '@students.national-u.edu.ph';
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
const NAME_REGEX = /^[a-zA-Z\s\-']+$/;

export default function Login() {
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const { toasts, showToast, dismissToast } = useToast();

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

  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotPassword, setForgotPassword] = useState('');
  const [forgotConfirm, setForgotConfirm] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotErrorField, setForgotErrorField] = useState(null);

  const [signupForm, setSignupForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
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
      showToast(`${data.user.isFirstLogin ? 'Welcome' : 'Welcome back'}, ${data.user.firstName}!`);
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
    const { firstName, lastName, email, phoneNumber, password, confirm } = signupForm;

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
    if (!phoneNumber) {
      return fail(setSignupErrorField, 'phoneNumber', 'Phone number is required');
    }
    if (!/^[0-9+\s()-]{10,15}$/.test(phoneNumber.trim())) {
      return fail(setSignupErrorField, 'phoneNumber', 'Please enter a valid phone number');
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

    pendingSignupData.current = {
      firstName,
      lastName,
      email,
      phoneNumber: phoneNumber.trim() || null,
      password,
    };
    setPrivacyOpen(true);
  }

  async function handlePrivacyAgree() {
    if (!pendingSignupData.current) return;
    setSignupSubmitting(true);
    try {
      await register(pendingSignupData.current);
      setPrivacyOpen(false);
      setSignupForm({
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        password: '',
        confirm: '',
      });
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

  function resetForgotPasswordState() {
    setForgotPasswordOpen(false);
    setForgotStep('email');
    setForgotEmail('');
    setForgotIdentifier('');
    setForgotCode('');
    setForgotPassword('');
    setForgotConfirm('');
    setForgotLoading(false);
    setForgotErrorField(null);
  }

  async function sendForgotPasswordCode(email) {
    const data = await requestPasswordResetCode({ identifier: email });
    setForgotIdentifier(data?.identifier || email);
    setForgotStep('code');
    setForgotErrorField(null);
    showToast(data?.message || 'Verification code sent to your university email.', 'success');
  }

  async function handleForgotPasswordRequest(e) {
    e.preventDefault();
    const email = forgotEmail.trim();

    if (!email) return fail(setForgotErrorField, 'email', 'Please enter your university email');
    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      return fail(setForgotErrorField, 'email', `Only ${ALLOWED_DOMAIN} emails are allowed`);
    }

    setForgotLoading(true);
    try {
      await sendForgotPasswordCode(email);
    } catch (err) {
      fail(setForgotErrorField, 'email', err.data?.message || 'Unable to send a verification code');
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleForgotPasswordVerify(e) {
    e.preventDefault();
    if (!forgotCode.trim()) return fail(setForgotErrorField, 'code', 'Please enter the verification code');

    setForgotLoading(true);
    try {
      await verifyPasswordResetCode({
        identifier: forgotIdentifier || forgotEmail.trim(),
        code: forgotCode.trim(),
      });
      setForgotStep('reset');
      setForgotErrorField(null);
      showToast('Code verified. Please choose a new password.', 'success');
    } catch (err) {
      fail(setForgotErrorField, 'code', err.data?.message || 'Verification failed');
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleForgotPasswordReset(e) {
    e.preventDefault();
    if (!forgotPassword) return fail(setForgotErrorField, 'password', 'Please enter a new password');
    if (!PASSWORD_REGEX.test(forgotPassword)) {
      return fail(
        setForgotErrorField,
        'password',
        'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character'
      );
    }
    if (forgotPassword !== forgotConfirm) {
      return fail(setForgotErrorField, 'confirm', 'Passwords do not match');
    }

    setForgotLoading(true);
    try {
      await resetPassword({
        identifier: forgotIdentifier || forgotEmail.trim(),
        code: forgotCode.trim(),
        newPassword: forgotPassword,
      });
      showToast('Password reset successfully. Please log in with your new password.', 'success');
      setLoginEmail(forgotEmail.trim());
      setLoginPassword('');
      resetForgotPasswordState();
      setMode('login');
    } catch (err) {
      fail(setForgotErrorField, 'password', err.data?.message || 'Password reset failed');
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <>
      {!introDone && (
        <div className={`intro-overlay${fadeOut ? ' fade-out' : ''}`} style={{ display: 'flex' }}>
          <div className={`intro-brand${brandIn ? ' brand-in' : ''}${brandOut ? ' brand-out' : ''}`}>
            <div className="intro-icon">
              <BrandLogo size={30} />
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
                <BrandLogo size={26} />
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
            {!forgotPasswordOpen && mode === 'login' && (
              <form className="form-card" onSubmit={handleLogin}>
                <div className="form-header">
                  <h2>Student Login</h2>
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
                      placeholder="Enter your university email"
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
                    onClick={async (e) => {
                      e.preventDefault();
                      const email = loginEmail.trim();
                      setForgotEmail(email);
                      setForgotPasswordOpen(true);
                      setForgotStep('email');
                      setForgotErrorField(null);
                      if (!email || !email.toLowerCase().endsWith(ALLOWED_DOMAIN)) return;
                      setForgotLoading(true);
                      try {
                        await sendForgotPasswordCode(email);
                      } catch (err) {
                        fail(setForgotErrorField, 'email', err.data?.message || 'Unable to send a verification code');
                      } finally {
                        setForgotLoading(false);
                      }
                    }}
                  >
                    Forgot password?
                  </a>
                </div>

                <button className="btn-primary" type="submit" disabled={loginLoading}>
                  <LogInIcon />
                  <span>{loginLoading ? 'Logging in...' : 'Log in'}</span>
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

            {forgotPasswordOpen && (
              <form
                className="form-card"
                onSubmit={
                  forgotStep === 'email'
                    ? handleForgotPasswordRequest
                    : forgotStep === 'code'
                      ? handleForgotPasswordVerify
                      : handleForgotPasswordReset
                }
              >
                <div className="form-header">
                  <h2>Reset password</h2>
                  <p>
                    {forgotStep === 'email'
                      ? 'Enter your university email to receive a verification code.'
                      : forgotStep === 'code'
                        ? 'Enter the verification code sent to your university email.'
                        : 'Choose a new password to finish resetting your account.'}
                  </p>
                </div>

                {forgotStep === 'email' && (
                  <div className="input-group">
                    <label htmlFor="forgotEmail">University Email</label>
                    <div className="input-wrap">
                      <MailIcon />
                      <input
                        id="forgotEmail"
                        type="email"
                        placeholder="Enter your university email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        style={forgotErrorField === 'email' ? { borderColor: '#e0504a' } : undefined}
                      />
                    </div>
                  </div>
                )}

                {forgotStep === 'code' && (
                  <div className="input-group">
                    <label htmlFor="forgotCode">Verification Code</label>
                    <div className="input-wrap">
                      <span className="input-icon">🔐</span>
                      <input
                        id="forgotCode"
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter 6-digit code"
                        value={forgotCode}
                        maxLength={6}
                        onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        style={forgotErrorField === 'code' ? { borderColor: '#e0504a' } : undefined}
                      />
                    </div>
                  </div>
                )}

                {forgotStep === 'reset' && (
                  <>
                    <PasswordInput
                      id="forgotPassword"
                      label="New Password"
                      placeholder="Create a new password"
                      value={forgotPassword}
                      onChange={setForgotPassword}
                      errored={forgotErrorField === 'password'}
                    />
                    <PasswordInput
                      id="forgotConfirm"
                      label="Confirm Password"
                      placeholder="Confirm password"
                      value={forgotConfirm}
                      onChange={setForgotConfirm}
                      errored={forgotErrorField === 'confirm'}
                    />
                  </>
                )}

                <button className="btn-primary" type="submit" disabled={forgotLoading}>
                  {forgotLoading
                    ? forgotStep === 'email'
                      ? 'Sending code...'
                      : forgotStep === 'code'
                        ? 'Verifying...'
                        : 'Updating password...'
                    : forgotStep === 'email'
                      ? 'Send code to email'
                      : forgotStep === 'code'
                        ? 'Verify code'
                        : 'Update password'}
                </button>

                {forgotStep === 'code' && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginTop: '10px' }}
                    onClick={() => handleForgotPasswordRequest({ preventDefault() {} })}
                  >
                    Resend code
                  </button>
                )}

                <p className="switch-cta" style={{ marginTop: '16px' }}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      resetForgotPasswordState();
                    }}
                  >
                    Back to log in
                  </a>
                </p>
              </form>
            )}

            {!forgotPasswordOpen && mode === 'signup' && (
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

                <div className="input-group">
                  <label htmlFor="signupPhone">Phone Number</label>
                  <div className="input-wrap">
                    <span className="input-icon">📱</span>
                    <input
                      id="signupPhone"
                      type="tel"
                      placeholder="09XXXXXXXXX"
                      required
                      value={signupForm.phoneNumber}
                      onChange={(e) => setSignupForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                      style={signupErrorField === 'phoneNumber' ? { borderColor: '#e0504a' } : undefined}
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

      <Toast toasts={toasts} onDismiss={dismissToast} />
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

function LogInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
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
