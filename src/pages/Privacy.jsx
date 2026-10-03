import { Link } from 'react-router-dom';
import LegalLayout from '../components/LegalLayout.jsx';

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="May 2025"
      footer={
        <>
          Also read our <Link to="/terms">Terms &amp; Conditions</Link>. &nbsp;·&nbsp; &copy; 2025 Enyukado. All rights reserved.
        </>
      }
    >
      <div className="legal-section">
        <h2>1. Information We Collect</h2>
        <p>When you register for or use Enyukado, we may collect the following types of information:</p>
        <ul>
          <li>Full name, university email address, and student ID number.</li>
          <li>Profile information you voluntarily provide, such as a display photo or contact number.</li>
          <li>Listing data including item descriptions, photos, prices, and category.</li>
          <li>Usage data such as pages visited, time on platform, and search queries.</li>
          <li>Device and browser information for security and performance purposes.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>2. How We Use Your Information</h2>
        <p>The information we collect is used solely to operate and improve the platform:</p>
        <ul>
          <li>To verify your student status and authenticate your account.</li>
          <li>To display your listings and facilitate transactions between users.</li>
          <li>To send you important platform notifications and updates.</li>
          <li>To detect, investigate, and prevent fraudulent or prohibited activities.</li>
          <li>To improve platform features, usability, and overall experience.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>3. Data Sharing</h2>
        <p>We do not sell, rent, or trade your personal information to any third parties. We may share your data only in the following limited circumstances:</p>
        <ul>
          <li>With your university administration if required to verify enrollment or investigate a report.</li>
          <li>With law enforcement agencies if required by applicable law or legal process.</li>
          <li>With service providers who assist us in operating the platform, under strict confidentiality obligations.</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>4. Data Retention</h2>
        <p>We retain your personal data for as long as your account remains active or as needed to provide services. If you request account deletion, we will remove your personal data within 30 days, except where retention is required by law.</p>
      </div>

      <div className="legal-section">
        <h2>5. Your Rights</h2>
        <p>As a user, you have the right to:</p>
        <ul>
          <li>Access the personal data we hold about you.</li>
          <li>Request correction of inaccurate or incomplete data.</li>
          <li>Request deletion of your account and associated personal data.</li>
          <li>Withdraw consent to optional data processing at any time.</li>
        </ul>
        <p>To exercise any of these rights, contact us at <strong>contact.enyukado@gmail.com</strong>.</p>
      </div>

      <div className="legal-section">
        <h2>6. Security</h2>
        <p>We take basic steps to keep your information safe, such as limiting access to data and handling it carefully within the system.</p>
      </div>

      <div className="legal-section">
        <h2>7. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. Significant changes will be communicated through platform notifications. Your continued use of Enyukado following any changes constitutes your acceptance of the updated policy.</p>
      </div>
    </LegalLayout>
  );
}
