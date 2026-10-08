import { useEffect, useRef, useState } from 'react';
import { createProduct, updateProduct } from '../api/productsApi.js';
import AppHeader from './AppHeader.jsx';
import './SellModal.css';

const CONDITIONS = ['Brand new', 'Like new', 'Lightly used', 'Well used', 'Heavily used'];
const MAX_PHOTOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const DESC_MAX = 500;

export default function SellModal({ open, onClose, categories, token, editData, onSaved, onToast, headerProps }) {
  const [form, setForm] = useState(emptyForm());
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

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
    setPreviews((old) => { old.forEach((u) => URL.revokeObjectURL(u)); return []; });
  }, [open, editData]);

  if (!open) return null;

  function addFiles(list) {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    const remaining = MAX_PHOTOS - files.length;
    if (remaining <= 0) return onToast?.(`You can only add ${MAX_PHOTOS} photos.`, 'error');

    const valid = incoming.filter((f) => {
      if (!/^image\/(jpe?g|png|webp)$/i.test(f.type)) {
        onToast?.(`${f.name} isn't a JPG, PNG or WEBP image.`, 'error');
        return false;
      }
      if (f.size > MAX_BYTES) {
        onToast?.(`${f.name} is over 10MB.`, 'error');
        return false;
      }
      return true;
    });
    const toAdd = valid.slice(0, remaining);
    if (valid.length > remaining) onToast?.(`Only ${remaining} more photo(s) allowed (max ${MAX_PHOTOS}).`, 'error');
    if (!toAdd.length) return;

    setFiles((f) => [...f, ...toAdd]);
    setPreviews((p) => [...p, ...toAdd.map((file) => URL.createObjectURL(file))]);
  }

  function handleImagesSelected(e) {
    addFiles(e.target.files);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function removeImage(index) {
    URL.revokeObjectURL(previews[index]);
    setFiles((f) => f.filter((_, i) => i !== index));
    setPreviews((p) => p.filter((_, i) => i !== index));
  }

  function stepQty(delta) {
    const next = Math.max(1, (parseInt(form.quantity, 10) || 1) + delta);
    setForm({ ...form, quantity: next });
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

  const qty = parseInt(form.quantity, 10) || 1;
  const priceNum = Number(form.price) || 0;

  return (
    <div className="fullpanel-overlay">
      <AppHeader {...headerProps} onBack={onClose} title={editData ? 'Update listing' : 'Post your first listing'} />

      <div className="fullpanel-body">
        <div className="sl-page">
          <div className="sl-box">
          <div className="sl-grid">
            {/* ---------- LEFT: photos ---------- */}
            <section className="sl-col sl-card-photos">
              <header className="sl-card-head">
                <div>
                  <h3>Photos</h3>
                  <p>{editData ? 'Add new photos to replace the current ones (optional)' : '1 required · up to 5'}</p>
                </div>
                <span className="sl-count">{files.length}/{MAX_PHOTOS}</span>
              </header>

              {previews.length > 0 && (
                <div className="sl-photos">
                  {previews.map((src, i) => (
                    <div className={`sl-photo${i === 0 ? ' is-cover' : ''}`} key={src}>
                      <img src={src} alt={`photo ${i + 1}`} />
                      {i === 0 && <span className="sl-photo-main">Cover</span>}
                      <button type="button" className="sl-photo-remove" aria-label={`Remove photo ${i + 1}`} onClick={() => removeImage(i)}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {files.length < MAX_PHOTOS && (
                <div
                  className={`sl-drop${dragging ? ' dragging' : ''}${previews.length ? ' compact' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                >
                  <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImagesSelected} onClick={(e) => e.stopPropagation()} />
                  <div className="sl-drop-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  </div>
                  <div className="sl-drop-title">{dragging ? 'Drop to add photos' : previews.length ? 'Add more photos' : 'Click or drag to upload photos'}</div>
                  <div className="sl-drop-sub">JPG, PNG, WEBP · Max 10MB each</div>
                </div>
              )}

              <ul className="sl-tips">
                <li>Use clear, well-lit photos from multiple angles</li>
                <li>Show any scratches or defects up close</li>
                <li>The first photo is your cover image</li>
              </ul>
            </section>
            {/* ---------- RIGHT: details ---------- */}
            <section className="sl-col">
              <header className="sl-card-head">
                <div>
                  <h3>Item details</h3>
                  <p>Tell buyers what you're selling</p>
                </div>
              </header>

              <div className="sl-field">
                <label htmlFor="sl-name">Item name</label>
                <input id="sl-name" type="text" maxLength={100} placeholder="e.g. Engineering Math Vol. 2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>

              <div className="sl-row">
                <div className="sl-field">
                  <label htmlFor="sl-price">Price</label>
                  <div className="sl-input-prefix">
                    <span>₱</span>
                    <input id="sl-price" type="number" placeholder="0.00" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                  </div>
                </div>
                <div className="sl-field">
                  <label>Quantity</label>
                  <div className="sl-stepper">
                    <button type="button" aria-label="Decrease quantity" onClick={() => stepQty(-1)} disabled={qty <= 1}>−</button>
                    <input type="number" min="1" aria-label="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                    <button type="button" aria-label="Increase quantity" onClick={() => stepQty(1)}>+</button>
                  </div>
                </div>
              </div>

              <div className="sl-field">
                <label htmlFor="sl-cat">Category</label>
                <select id="sl-cat" value={form.categoryID} onChange={(e) => setForm({ ...form, categoryID: e.target.value })}>
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>
                  ))}
                </select>
              </div>

              <div className="sl-field">
                <label>Condition</label>
                <div className="sl-chips" role="radiogroup" aria-label="Condition">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={form.condition === c}
                      className={`sl-chip${form.condition === c ? ' active' : ''}`}
                      onClick={() => setForm({ ...form, condition: c })}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sl-field">
                <label htmlFor="sl-desc">Description <em>(optional)</em></label>
                <textarea
                  id="sl-desc"
                  maxLength={DESC_MAX}
                  placeholder="Describe the item, any defects, why you're selling…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <div className="sl-counter">{form.description.length} / {DESC_MAX}</div>
              </div>
            </section>

          </div>

          <div className="sl-actions">
            <button className="sl-submit" type="button" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {editData ? 'Update listing' : 'Post listing'}
                </>
              )}
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}