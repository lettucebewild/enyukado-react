import { useEffect, useRef, useState } from 'react';
import { updateProfile, uploadQRCode } from '../api/usersApi.js';

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Graduate'];

export default function EditProfileModal({ open, onClose, profile, token, onSaved, onToast }) {
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [qrPreview, setQrPreview] = useState('');
  const [qrUploading, setQrUploading] = useState(false);
  const fileInputRef = useRef(null);

  function emptyForm() {
    return { firstName: '', lastName: '', bio: '', course: '', year: '', campusArea: '' };
  }

  useEffect(() => {
    if (!open || !profile) return;
    setForm({
      firstName: profile.FirstName || '',
      lastName: profile.LastName || '',
      bio: profile.Bio || '',
      course: profile.Course || '',
      year: profile.Year || '',
      campusArea: profile.CampusArea || '',
    });
    setQrPreview(profile.QRCodeImage || '');
  }, [open, profile]);

  if (!open) return null;

  async function handleQRUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    try {
      const res = await uploadQRCode(file, token);
      setQrPreview(res.qrCodeImage || '');
      onToast?.('QR code updated!');
      onSaved?.({ QRCodeImage: res.qrCodeImage });
    } catch (err) {
      onToast?.(err.message || 'Failed to upload QR code.', 'error');
    } finally {
      setQrUploading(false);
      e.target.value = '';
    }
  }

  async function handleSubmit() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return onToast?.('First and last name are required.', 'error');
    }
    setSubmitting(true);
    try {
      await updateProfile(
        {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          bio: form.bio.trim(),
          course: form.course.trim(),
          year: form.year,
          campusArea: form.campusArea.trim(),
        },
        token
      );
      onToast?.('Profile updated successfully!');
      onSaved?.({
        FirstName: form.firstName.trim(),
        LastName: form.lastName.trim(),
        Bio: form.bio.trim(),
        Course: form.course.trim(),
        Year: form.year,
        CampusArea: form.campusArea.trim(),
      });
      onClose();
    } catch (err) {
      onToast?.(err.message || 'Failed to update profile.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sell-modal edit-profile-modal">
        <div className="modal-header">
          <h3>Edit Profile</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="modal-row">
          <div className="modal-field">
            <label>First Name</label>
            <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div className="modal-field">
            <label>Last Name</label>
            <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
        </div>

        <div className="modal-field">
          <label>Bio <span className="field-optional">(optional)</span></label>
          <textarea
            placeholder="Tell other students a bit about yourself…"
            style={{ height: 70 }}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </div>

        <div className="modal-row">
          <div className="modal-field">
            <label>Course</label>
            <input type="text" placeholder="e.g. BSIT, BSCS, BSA" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} />
          </div>
          <div className="modal-field">
            <label>Year Level</label>
            <select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}>
              <option value="">Select year</option>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="modal-field">
          <label>Campus Area / Building</label>
          <input type="text" placeholder="e.g. Main Building, Annex, JMB" value={form.campusArea} onChange={(e) => setForm({ ...form, campusArea: e.target.value })} />
        </div>

        <div className="qr-upload-section">
          <label>Payment QR Code <span className="field-optional">(E-Wallet or Online Banking)</span></label>
          {qrPreview && <img className="qr-current" src={qrPreview} alt="Current QR Code" />}
          <div className="qr-upload-btn" onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleQRUpload} style={{ display: 'none' }} />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            <span>{qrUploading ? 'Uploading…' : 'Upload new QR code image'}</span>
          </div>
          <p className="qr-note">This QR code will be shown to buyers when they purchase your items. Upload a clear screenshot of your e-wallet (GCash, Maya) or online banking QR code.</p>
        </div>

        <button className="btn-modal-submit" disabled={submitting} onClick={handleSubmit}>
          {submitting ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
