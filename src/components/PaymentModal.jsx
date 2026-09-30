import { useEffect, useState } from 'react';
import { submitPurchase } from '../api/transactionsApi.js';

const PAYMENT_OPTIONS = {
  'E-Wallet': { icon: '💙', sub: '(GCash, Maya)' },
  'Online Banking': { icon: '🏦', sub: '(BDO, BPI, Maribank, Metrobank, UnionBank)' },
};

export default function PaymentModal({ product, token, onClose, onSuccess, onToast }) {
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cardNum, setCardNum] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');

  const open = !!product;

  useEffect(() => {
    if (open) {
      setStep(1);
      setMethod(null);
      setProofFile(null);
      setProofPreview(null);
      setConfirmed(false);
      setCardNum('');
      setCardExp('');
      setCardCvc('');
      setCardName('');
    }
  }, [open, product?.productID]);

  if (!open) return null;

  const formatted = `₱${parseFloat(product.price).toLocaleString()}`;

  function handleProofUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setProofPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  function formatCardNumInput(v) {
    const digits = v.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  }

  function formatExpiryInput(v) {
    let digits = v.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 2) digits = digits.slice(0, 2) + '/' + digits.slice(2);
    return digits;
  }

  async function handleSubmit() {
    if (!proofFile) {
      onToast?.(method === 'E-Wallet' ? 'Please upload proof of payment.' : 'Please upload transfer confirmation.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('productID', product.productID);
      fd.append('paymentMethod', method);
      fd.append('paymentProof', proofFile);
      await submitPurchase(fd, token);
      onToast?.('Purchase submitted! Awaiting admin confirmation. 🎉');
      onSuccess?.();
      onClose();
    } catch (err) {
      onToast?.(err.message || 'Failed to submit purchase.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="payment-modal">
        <div style={{ padding: '26px 36px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontFamily: "'Sora',sans-serif", fontSize: '1.3rem', fontWeight: 700, color: 'var(--charcoal)' }}>Complete Purchase</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="payment-steps">
          <div className={`payment-step${step === 1 ? ' active' : ' done'}`}>1. Payment Method</div>
          <div className={`payment-step${step === 2 ? ' active' : ''}`}>2. Pay & Proof</div>
        </div>

        <div className="payment-body">
          <div className="payment-item-row">
            {product.imgUrl ? (
              <img className="payment-item-img" src={product.imgUrl} alt="" />
            ) : (
              <div className="payment-item-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>📦</div>
            )}
            <div>
              <div className="payment-item-name">{product.name}</div>
              <div className="payment-item-price">{formatted}</div>
            </div>
          </div>

          {step === 1 && (
            <div>
              <p style={{ fontSize: '0.85rem', color: 'var(--charcoal-2)', marginBottom: 14, fontWeight: 300 }}>How would you like to pay?</p>
              <div className="payment-methods">
                {Object.entries(PAYMENT_OPTIONS).map(([name, opt]) => (
                  <button
                    key={name}
                    className={`payment-method-btn${method === name ? ' selected' : ''}`}
                    onClick={() => setMethod(name)}
                  >
                    <div className="pm-icon">{opt.icon}</div>
                    <div className="pm-name">{name}</div>
                    <div className="pm-sub">{opt.sub}</div>
                  </button>
                ))}
              </div>
              <button className="btn-modal-submit" disabled={!method} style={{ opacity: method ? 1 : 0.5 }} onClick={() => setStep(2)}>
                {method === 'Online Banking' ? 'Next — Enter Card Details →' : 'Next →'}
              </button>
            </div>
          )}

          {step === 2 && method === 'E-Wallet' && (
            <div>
              <div className="qr-display">
                <div className="qr-amount">{formatted}</div>
                <p style={{ fontSize: '0.8rem', color: 'var(--charcoal-3)', marginBottom: 12 }}>Scan the seller's QR code below and pay the exact amount</p>
                <div style={{ width: '100%', maxWidth: 320, margin: '0 auto 12px', background: '#f4f5f7', borderRadius: 12, border: '2px solid rgba(50,111,202,0.12)', overflow: 'hidden', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {product.qrCode ? (
                    <img src={product.qrCode} alt="Seller QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <div className="qr-no-code" style={{ margin: 0 }}>⚠️ The seller has not uploaded a QR code yet. Please message them directly to arrange payment.</div>
                  )}
                </div>
              </div>

              <p style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--charcoal-2)', marginBottom: 8 }}>Upload proof of payment</p>
              <div className="proof-upload-zone">
                <input type="file" accept="image/*" onChange={handleProofUpload} />
                <div className="puz-icon">📷</div>
                <div className="puz-text">Tap to upload screenshot</div>
                <div className="puz-sub">E-wallet receipt screenshot</div>
              </div>
              {proofPreview && <img className="proof-preview" src={proofPreview} alt="Payment proof preview" style={{ display: 'block' }} />}

              <div className="confirm-check">
                <input type="checkbox" id="confirmPaidCheck" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <label htmlFor="confirmPaidCheck">
                  I confirm that I have paid <strong>{formatted}</strong> to <strong>{product.sellerName || 'the seller'}</strong> via E-Wallet and the screenshot above is my proof.
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-secondary-outline" onClick={() => setStep(1)}>← Back</button>
                <button
                  className="btn-modal-submit"
                  disabled={!confirmed || !proofFile || submitting}
                  style={{ flex: 2, opacity: confirmed && proofFile ? 1 : 0.5, marginTop: 0 }}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Submitting…' : 'Submit Purchase'}
                </button>
              </div>
            </div>
          )}

          {step === 2 && method === 'Online Banking' && (
            <div>
              <div style={{ background: 'linear-gradient(135deg,#326fca,#4e87d4)', borderRadius: 12, padding: '20px 22px', marginBottom: 18, color: 'white' }}>
                <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', opacity: 0.7, marginBottom: 16 }}>ENYUKADO · ONLINE BANKING</div>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: '1.3rem', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 16 }}>
                  {cardNum || '•••• •••• •••• ••••'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', opacity: 0.7, marginBottom: 2 }}>CARD HOLDER</div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: '0.88rem', fontWeight: 600 }}>{cardName || 'Your Name'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', opacity: 0.7, marginBottom: 2 }}>EXPIRES</div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: '0.88rem' }}>{cardExp || 'MM/YY'}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <div className="modal-field" style={{ marginBottom: 0 }}>
                  <label>Card Number</label>
                  <input type="text" maxLength={19} placeholder="1234 1234 1234 1234" value={cardNum} onChange={(e) => setCardNum(formatCardNumInput(e.target.value))} />
                </div>
                <div className="modal-row">
                  <div className="modal-field">
                    <label>Expiry Date</label>
                    <input type="text" maxLength={5} placeholder="MM/YY" value={cardExp} onChange={(e) => setCardExp(formatExpiryInput(e.target.value))} />
                  </div>
                  <div className="modal-field">
                    <label>CVC</label>
                    <input type="text" maxLength={4} placeholder="•••" value={cardCvc} onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ''))} />
                  </div>
                </div>
                <div className="modal-field" style={{ marginBottom: 0 }}>
                  <label>Card Holder Name</label>
                  <input type="text" placeholder="As it appears on your card" value={cardName} onChange={(e) => setCardName(e.target.value)} />
                </div>
              </div>

              <div style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 14, fontSize: '0.78rem', color: '#b07d10', lineHeight: 1.5 }}>
                ⚠️ Please complete the bank transfer of <strong>{formatted}</strong> to the seller, then upload your transfer confirmation below.
              </div>

              <p style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--charcoal-2)', marginBottom: 8 }}>Upload transfer confirmation</p>
              <div className="proof-upload-zone">
                <input type="file" accept="image/*" onChange={handleProofUpload} />
                <div className="puz-icon">📷</div>
                <div className="puz-text">Tap to upload screenshot</div>
                <div className="puz-sub">Bank transfer confirmation screenshot</div>
              </div>
              {proofPreview && <img className="proof-preview" src={proofPreview} alt="Transfer proof preview" style={{ display: 'block' }} />}

              <div className="confirm-check">
                <input type="checkbox" id="confirmPaidCheckEbank" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <label htmlFor="confirmPaidCheckEbank">
                  I confirm I have completed the bank transfer of <strong>{formatted}</strong> to <strong>{product.sellerName || 'the seller'}</strong> and the screenshot above is my proof.
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-secondary-outline" onClick={() => setStep(1)}>← Back</button>
                <button
                  className="btn-modal-submit"
                  disabled={!confirmed || !proofFile || submitting}
                  style={{ flex: 2, opacity: confirmed && proofFile ? 1 : 0.5, marginTop: 0 }}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Submitting…' : 'Submit Purchase'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
