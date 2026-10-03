import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProduct } from '../api/productsApi.js';
import { saveItem, unsaveItem, checkSaved } from '../api/savedApi.js';
import { getReviewsForUser } from '../api/reviewsApi.js';
import AppHeader from './AppHeader.jsx';

function timeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ProductPanel({
  productID,
  token,
  myUserID,
  onBack,
  onPush,
  onToast,
  onOpenPayment,
  onOpenCategory,
  cart,
  headerProps,
}) {
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [activeImg, setActiveImg] = useState(null);
  const [saved, setSaved] = useState(false);
  const [heartPop, setHeartPop] = useState(false);
  const [rating, setRating] = useState('—');
  const [loading, setLoading] = useState(true);
  const [descOpen, setDescOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDescOpen(false);
    getProduct(productID)
      .then(async (p) => {
        if (cancelled) return;
        setProduct(p);
        const images = p.images?.length ? p.images : p.ImageURL ? [{ ImageURL: p.ImageURL }] : [];
        setActiveImg(images[0]?.ImageURL || null);
        if (token) {
          try {
            const { saved } = await checkSaved(productID, token);
            if (!cancelled) setSaved(saved);
          } catch {
            /* ignore */
          }
        }
        try {
          const reviewData = await getReviewsForUser(p.UserID);
          if (!cancelled) setRating(reviewData.averageRating || '—');
        } catch {
          /* ignore */
        }
      })
      .catch(() => onToast?.('Failed to load product.', 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [productID, token]);

  if (loading || !product) {
    return (
      <div className="fullpanel-overlay">
        <AppHeader {...headerProps} within="browse" onBack={onBack} crumbs={[{ label: 'Browse' }, { label: 'Loading…' }]} />
      </div>
    );
  }

  const images = product.images?.length ? product.images : product.ImageURL ? [{ ImageURL: product.ImageURL }] : [];
  const isMine = product.UserID === myUserID;
  const sellerInitials = product.SellerFirstName && product.SellerLastName
    ? (product.SellerFirstName[0] + product.SellerLastName[0]).toUpperCase()
    : (product.sellerName ? product.sellerName[0].toUpperCase() : '?');
  const sellerName = product.sellerName || `${product.SellerFirstName || ''} ${product.SellerLastName || ''}`.trim() || 'Unknown';
  // Brand new / Like new / Lightly used -> green, Well used -> orange, Heavily used -> red
  // (legacy Used/Fair/Poor values are still colour-coded so old listings look right)
  const condColor = ['Well used', 'Used', 'Fair'].includes(product.ProductCondition) ? 'fair'
    : ['Heavily used', 'Poor'].includes(product.ProductCondition) ? 'poor' : '';
  const postedAgo = product.DatePosted ? timeAgo(new Date(product.DatePosted)) : 'Recently';
  const outOfStock = product.Quantity <= 0 || product.Status === 'Sold';
  const inCart = cart?.isInCart(product.ProductID);

  const categoryName = product.CategoryName || 'Others';
  const crumbs = [
    { label: 'Browse' },
    {
      label: categoryName,
      onClick: onOpenCategory && product.CategoryID != null ? () => onOpenCategory(product.CategoryID) : undefined,
    },
    { label: product.ProductName },
  ];

  const paymentPayload = {
    productID: product.ProductID,
    name: product.ProductName,
    price: product.Price,
    imgUrl: images[0]?.ImageURL || '',
    sellerName,
    sellerID: product.UserID,
    qrCode: product.QRCodeImage || '',
  };

  async function toggleSave() {
    if (!token) return;
    const next = !saved;
    setSaved(next);
    setHeartPop(true);
    setTimeout(() => setHeartPop(false), 450);
    try {
      if (next) {
        await saveItem(product.ProductID, token);
        onToast?.('Saved! View in your profile → Saved tab.');
      } else {
        await unsaveItem(product.ProductID, token);
        onToast?.('Removed from saved items.');
      }
    } catch {
      setSaved(!next);
    }
  }

  function goToSellerProfile() {
    if (String(product.UserID) === String(myUserID)) navigate('/profile');
    else navigate(`/profile?id=${product.UserID}`);
  }

  const description = (product.Description || '').trim();
  const descLong = description.length > 320 || description.split('\n').length > 6;
  const priceText = `₱${parseFloat(product.Price).toLocaleString()}`;

  return (
    <div className="fullpanel-overlay">
      <AppHeader {...headerProps} within="browse" onBack={onBack} crumbs={crumbs} />

      <div className="fullpanel-body">
        <div className="pp-wrap">
          {/* ---------- Top: photos on the left, the essentials on the right ---------- */}
          <div className={`pp-top${images.length > 1 ? ' has-thumbs' : ''}`}>
            {/* ---------- Gallery ---------- */}
            <div className="pp-gallery">
              <div className="pp-main">
                {activeImg ? <img src={activeImg} alt={product.ProductName} /> : <div className="pp-main-empty">📦</div>}
                {outOfStock && <span className="pp-sold">Sold out</span>}
              </div>
              {images.length > 1 && (
                <div className="pp-thumbs">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`pp-thumb${img.ImageURL === activeImg ? ' active' : ''}`}
                      onClick={() => setActiveImg(img.ImageURL)}
                    >
                      <img src={img.ImageURL} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pp-info">
              <div className="pp-card">
                <div className="pp-tags">
                  <span className="pp-tag cat">{product.CategoryName || 'Others'}</span>
                  <span className={`pp-tag cond ${condColor}`}>{product.ProductCondition}</span>
                </div>

                <div className="pp-title-row">
                  <h1 className="pp-title">{product.ProductName}</h1>
                  {token && (
                    <button
                      type="button"
                      className={`pp-save${saved ? ' saved' : ''}${heartPop ? ' pop' : ''}`}
                      title={saved ? 'Remove from saved' : 'Save for later'}
                      onClick={toggleSave}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M6 3h12a1 1 0 011 1v17l-7-4.5L5 21V4a1 1 0 011-1z"
                          fill={saved ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{saved ? 'Saved' : 'Save'}</span>
                    </button>
                  )}
                </div>

                <div className="pp-price-row">
                  <div className="pp-price">{priceText}</div>
                  <span className="pp-posted">Posted {postedAgo}</span>
                </div>

                <div className="pp-facts">
                  <div className="pp-fact">
                    <span className="pp-fact-label">Available</span>
                    <span className="pp-fact-value">{outOfStock ? 'Sold' : `${product.Quantity} ${product.Quantity === 1 ? 'unit' : 'units'}`}</span>
                  </div>
                </div>

                {!isMine ? (
                  <div className="pp-actions">
                    <button
                      className="btn-buy"
                      disabled={outOfStock}
                      onClick={() => onOpenPayment(paymentPayload)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></svg>
                      {outOfStock ? 'Out of Stock' : 'Buy Now'}
                    </button>
                    <button
                      className={`btn-add-cart${inCart ? ' added' : ''}`}
                      disabled={outOfStock}
                      onClick={() => {
                        if (inCart) return;
                        cart?.addToCart(paymentPayload);
                        onToast?.('Added to cart!');
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" /></svg>
                      {inCart ? 'In Cart' : 'Add to Cart'}
                    </button>
                  </div>
                ) : (
                  <div className="pp-own-note">This is your listing.</div>
                )}
              </div>
            </div>
          </div>

          {/* ---------- Below: the long stuff, full width ---------- */}
          <div className="pp-below">
            <div className="pp-seller" onClick={goToSellerProfile}>
              <div className="pp-seller-avatar">{sellerInitials}</div>
              <div className="pp-seller-info">
                <span className="pp-seller-label">Sold by</span>
                <span className="pp-seller-name">{sellerName}</span>
                <span className="pp-seller-rating">⭐ {rating}</span>
              </div>
              {!isMine && (
                <button
                  type="button"
                  className="pp-seller-msg"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPush({ type: 'messages', userID: product.UserID, userName: sellerName });
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                  Message
                </button>
              )}
            </div>

            <div className="pp-about">
              <h2 className="pp-label">About this item</h2>
              {/* white-space: pre-wrap (see CSS) keeps the seller's line breaks */}
              <p className={`pp-desc${descLong && !descOpen ? ' clamped' : ''}`}>
                {description || 'No description provided.'}
              </p>
              {descLong && (
                <button type="button" className="pp-more" onClick={() => setDescOpen((o) => !o)}>
                  {descOpen ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}