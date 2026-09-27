import { useState } from 'react';
import PasswordInput from './PasswordInput.jsx';
import { changePassword } from '../api/usersApi.js';

export default function ChangePasswordModal({ open, onClose, token, onToast }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
  }

  async function handleSubmit() {
    if (!current || !next) return onToast?.('Please fill in both fields.', 'error');
    if (next.length < 6) return onToast?.('New password must be at least 6 characters.', 'error');
    if (next !== confirm) return onToast?.('New passwords do not match.', 'error');

    setSubmitting(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next }, token);
      onToast?.('Password changed successfully!');
      reset();
      onClose();
    } catch (err) {
      onToast?.(err.message || 'Failed to change password.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sell-modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>Change password</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <PasswordInput id="currentPassword" label="Current password" placeholder="••••••••" value={current} onChange={setCurrent} />
        <div style={{ height: 14 }} />
        <PasswordInput id="newPassword" label="New password" placeholder="At least 6 characters" value={next} onChange={setNext} />
        <div style={{ height: 14 }} />
        <PasswordInput id="confirmPassword" label="Confirm new password" placeholder="Re-enter new password" value={confirm} onChange={setConfirm} />
        <div style={{ height: 18 }} />

        <button className="btn-modal-submit" disabled={submitting} onClick={handleSubmit}>
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </div>
    </div>
  );
}
