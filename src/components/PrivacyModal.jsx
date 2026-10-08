import './PrivacyModal.css';

export default function PrivacyModal({ open, onAgree, onCancel, submitting }) {
  return (
    <div
      className={`privacy-modal-overlay${open ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="privacy-modal">
        <div className="privacy-modal-header">
          <div className="privacy-modal-header-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4274b8" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h3>Data Privacy Consent</h3>
            <p>Please read before creating your account</p>
          </div>
        </div>

        <div className="privacy-modal-body">
          <p>
            Before creating your Enyukado account, we want to be transparent about how we
            collect and use your personal data in accordance with the{' '}
            <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong>.
          </p>
          <p>By creating an account, you consent to the following:</p>
          <ul className="privacy-points">
            <li>
              Your <strong>full name and university email</strong> will be collected to verify
              your student status and authenticate your account.
            </li>
            <li>
              Your <strong>payment information</strong> (QR code) will be stored and shown to
              buyers during transactions.
            </li>
            <li>
              Your <strong>listing data</strong> including item descriptions, photos, and prices
              will be visible to other verified students on the platform.
            </li>
            <li>
              Your data will <strong>never be sold or shared</strong> with third parties except
              as required by law or university policy.
            </li>
            <li>
              You may request <strong>access, correction, or deletion</strong> of your data at
              any time by contacting <strong>contact.enyukado@gmail.com.</strong>
            </li>
            <li>
              Your account is subject to <strong>admin approval</strong> before you can access
              the platform.
            </li>
          </ul>
          <p>
            Your data will be retained for as long as your account remains active. Continued use
            of Enyukado constitutes acceptance of our full{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: '#4274b8', fontWeight: 500 }}>
              Privacy Policy
            </a>{' '}
            and{' '}
            <a href="/terms" target="_blank" rel="noreferrer" style={{ color: '#4274b8', fontWeight: 500 }}>
              Terms &amp; Conditions
            </a>
            .
          </p>
        </div>

        <div className="privacy-modal-footer">
          <button className="btn-privacy-agree" onClick={onAgree} disabled={submitting}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {submitting ? 'Creating account...' : 'I Agree — Create My Account'}
          </button>
          <button className="btn-privacy-cancel" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
