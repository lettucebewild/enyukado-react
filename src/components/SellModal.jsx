import { useEffect, useState } from 'react';
import { createProduct, updateProduct } from '../api/productsApi.js';
import AppHeader from './AppHeader.jsx';

const CONDITIONS = ['Brand new', 'Like new', 'Lightly used', 'Well used', 'Heavily used'];

export default function SellModal({ open, onClose, categories, token, editData, onSaved, onToast, headerProps }) {
  const [form, setForm] = useState(emptyForm());
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  function emptyForm() {
    return { name: '', price: '', categoryID: '', condition: '', description: '', quantity: 1 };
  }

  useEffect(() => {
    if (!open) return;
    if (editData) {
      setForm({
        name: editData.name || '',
        price: editData.price || '',
        categoryID: editData.categoryID ? String(editData.categoryID) : '',
        condition: editData.condition || '',
        description: editData.description || '',
        quantity: editData.quantity || 1,
      });
    } else {
      setForm(emptyForm());
    }
    setFiles([]);
    setPreviews([]);
  }, [open, editData]);

  if (!open) return null;

  function handleImagesSelected(e) {
    const newFiles = Array.from(e.target.files);
    const remaining = 5 - files.length;
    if (remaining <= 0) return;
    const toAdd = newFiles.slice(0, remaining);
    if (newFiles.length > remaining) onToast?.(`Only ${remaining} more photo(s) allowed (max 5).`, 'error');
    toAdd.forEach((file) => {
      setFiles((f) => [...f, file]);
      const reader = new FileReader();
      reader.onload = (ev) => setPreviews((p) => [...p, ev.target.result]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function removeImage(index) {
    setFiles((f) => f.filter((_, i) => i !== index));
    setPreviews((p) => p.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!form.name.trim()) return onToast?.('Please enter an item name', 'error');
    if (!form.price || Number(form.price) <= 0) return onToast?.('Please enter a valid price', 'error');
    if (!form.categoryID) return onToast?.('Please select a category', 'error');
    if (!form.condition) return onToast?.('Please select the item condition', 'error');
    if (!editData && files.length === 0) return onToast?.('Please upload at least 1 photo', 'error');

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('productName', form.name.trim());
      fd.append('price', parseFloat(form.price));
      fd.append('description', form.description.trim());
      fd.append('productCondition', form.condition);
      fd.append('categoryID', parseInt(form.categoryID, 10));
      fd.append('quantity', parseInt(form.quantity, 10) || 1);
      files.forEach((f) => fd.append('productImages', f));

      if (editData?.productID) {
        await updateProduct(editData.productID, fd, token);
        onToast?.(`"${form.name}" updated and re-submitted for approval! ✅`);
      } else {
        await createProduct(fd, token);
        onToast?.(`"${form.name}" submitted for admin approval! 🎉`);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      onToast?.(err.message || 'Failed to save listing.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fullpanel-overlay">
      <AppHeader {...headerProps} onBack={onClose} title={editData ? 'Update listing' : 'Post a listing'} />

      <div className="fullpanel-body">
      <div className="sell-panel-inner">
        <div className="modal-field">
          <label>Item name</label>
          <input type="text" placeholder="e.g. Engineering Math Vol. 2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="modal-row">
          <div className="modal-field">
            <label>Price (₱)</label>
            <input type="number" placeholder="0.00" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="modal-field">
            <label>Quantity</label>
            <input type="number" placeholder="1" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
        </div>
        <div className="modal-row">
          <div className="modal-field">
            <label>Category</label>
            <select value={form.categoryID} onChange={(e) => setForm({ ...form, categoryID: e.target.value })}>
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>
              ))}
            </select>
          </div>
          <div className="modal-field">
            <label>Condition</label>
            <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
              <option value="">Select condition</option>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-field">
          <label>Description</label>
          <textarea placeholder="Describe the item, any defects, why you're selling…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--charcoal-2)', display: 'block', marginBottom: 8 }}>
            Photos <span style={{ color: 'var(--charcoal-3)', fontWeight: 300 }}>(1 required, max 5)</span>
          </label>
          <div className="img-preview-grid">
            {previews.map((src, i) => (
              <div className="img-thumb" key={i}>
                <img src={src} alt={`photo ${i + 1}`} />
                <button className="img-thumb-remove" type="button" onClick={() => removeImage(i)}>✕</button>
                {i === 0 && <div className="img-thumb-primary">MAIN</div>}
              </div>
            ))}
          </div>
          <div className="upload-count">{files.length} / 5 photos</div>
          {files.length < 5 && (
            <div className="upload-zone">
              <input type="file" accept="image/*" multiple onChange={handleImagesSelected} />
              <div className="upload-zone-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </div>
              <div className="upload-zone-title">Click or drag to upload photos</div>
              <div className="upload-zone-sub">JPG, PNG, WEBP · <span>Max 10MB each</span> · 1–5 photos</div>
            </div>
          )}
        </div>

        <button className="btn-modal-submit" disabled={submitting} onClick={handleSubmit}>
          {submitting ? 'Submitting…' : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {editData ? 'Update listing' : 'Post listing'}
            </>
          )}
        </button>
      </div>
      </div>
    </div>
  );
}
