import { Link } from 'react-router-dom';
import LegalLayout from '../components/LegalLayout.jsx';

export default function Terms() {
  return (
    <LegalLayout
      title="Terms & Conditions"
      updated="May 2025"
      footer={
        <>
          Also read our <Link to="/privacy">Privacy Policy</Link>. &nbsp;·&nbsp; &copy; 2025 Enyukado. All rights reserved.
        </>
      }
    >
      <div className="legal-section">
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using Enyukado, you agree to be bound by these Terms &amp; Conditions. If you do not agree to all of the following terms, please do not use our platform. These terms apply to all users of the platform, including buyers, sellers, and visitors.</p>
      </div>

      <div className="legal-section">
        <h2>2. Eligibility</h2>
        <p>To use Enyukado, you must:</p>
        <ul>
          <li>Be a currently enrolled student at a participating university.</li>
          <li>Have a valid university-issued email address and student ID.</li>
          <li>Agree not to share your account credentials with any other person.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>3. Listings and Transactions</h2>
        <p>Enyukado serves as a marketplace platform only. We do not own, buy, or sell any items listed on the platform. All transactions are conducted directly between buyers and sellers. You agree that:</p>
        <ul>
          <li>All listings must be accurate, honest, and non-misleading.</li>
          <li>You will not list prohibited items including weapons, illegal substances, counterfeit goods, or any item that violates university policy.</li>
          <li>Enyukado is not responsible for disputes, damages, or losses arising from transactions.</li>
          <li>You are solely responsible for verifying the condition of items before purchase or sale.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>4. Prohibited Conduct</h2>
        <p>You agree not to engage in any of the following:</p>
        <ul>
          <li>Fraudulent, deceptive, or misleading activity on the platform.</li>
          <li>Harassment, threats, or abuse toward other users.</li>
          <li>Attempting to hack, reverse-engineer, or exploit the platform.</li>
          <li>Posting spam, advertisements for off-platform services, or irrelevant content.</li>
          <li>Creating multiple accounts to circumvent restrictions or bans.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>5. Account Suspension and Termination</h2>
        <p>Enyukado reserves the right to suspend or permanently terminate any account that violates these Terms &amp; Conditions, at our sole discretion and without prior notice. Upon termination, your right to use the platform ceases immediately.</p>
      </div>

      <div className="legal-section">
        <h2>6. Limitation of Liability</h2>
        <p>Enyukado and its developers are not liable for any indirect, incidental, special, or consequential damages arising out of your use of the platform, including but not limited to loss of funds, data, or property resulting from transactions conducted through Enyukado.</p>
      </div>

      <div className="legal-section">
        <h2>7. Changes to Terms</h2>
        <p>We reserve the right to modify these Terms &amp; Conditions at any time. Continued use of the platform after any changes constitutes your acceptance of the revised terms. We encourage you to review these terms periodically.</p>
      </div>

      <div className="legal-section">
        <h2>8. Contact</h2>
        <p>If you have questions regarding these Terms &amp; Conditions, please reach out to us at <strong>contact.enyukado@gmail.com</strong>.</p>
      </div>
    </LegalLayout>
  );
}
