import { useEffect, useRef, useState } from 'react';
import CountUp from './CountUp.jsx';
import { timeAgo } from '../utils/timeAgo.js';
import './ListingCard.css';

const CYCLE_MS = 1100;

// One listing in the browse grid.
//  - hover: cycles through the listing's photos (if it has more than one)
//  - hover: "Add to cart" + a bookmark (save) button slide up over the photo
//  - below the title: the seller's avatar + name, and how long ago it was posted
export default function ListingCard({
  product: p, cart, myUserID, onOpen, onToast,
  saved = false, popped = false, onToggleSave,
}) {
  const images = (p.images || []).map((i) => i.ImageURL).filter(Boolean);
  if (!images.length) {
    const single = p.ImageURL || p.imageURL;
    if (single) images.push(single);
  }
  const multi = images.length > 1;

  const [idx, setIdx] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);

  const startCycle = (e) => {
    if (!multi || (e.pointerType && e.pointerType !== 'mouse')) return;
    clearInterval(timer.current);
    timer.current = setInterval(() => setIdx((i) => (i + 1) % images.length), CYCLE_MS);
    setTimeout(() => setIdx((i) => (i === 0 ? 1 : i)), 250); // first change feels immediate
  };
  const stopCycle = () => { clearInterval(timer.current); setIdx(0); };

  const condClass = ['Heavily used', 'Poor'].includes(p.ProductCondition) ? 'poor'
    : ['Well used', 'Used', 'Fair'].includes(p.ProductCondition) ? 'fair' : '';
  const price = parseFloat(p.Price);
  const isMine = myUserID != null && p.UserID != null && Number(p.UserID) === Number(myUserID);
  const outOfStock = p.Quantity <= 0 || p.Status === 'Sold';
  const inCart = cart?.isInCart(p.ProductID);

  // Seller avatar: their photo if they have a real one, otherwise initials.
  const sellerName = p.sellerName || 'Student Seller';
  const initials = sellerName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const avatarSrc = p.SellerImage && !p.SellerImage.includes('default-avatar') ? p.SellerImage : null;
  const posted = p.DatePosted ? new Date(p.DatePosted) : null;
  const postedAgo = posted && !Number.isNaN(posted.getTime()) ? timeAgo(posted) : null;

  // One button, two jobs: Add to cart, and (once it's in the cart) click again to remove it.
  const cartItem = {
    productID: p.ProductID,
    name: p.ProductName,
    price: p.Price,
    imgUrl: images[0] || '',
    sellerName: p.sellerName,
    sellerID: p.UserID,
    qrCode: p.QRCodeImage || '',
  };
  const toggleCart = (e) => {
    e.stopPropagation();
    if (inCart) {
      cart?.removeFromCart(p.ProductID);
      onToast?.('Removed from cart.', 'success', { action: { label: 'Undo', onClick: () => cart?.addToCart(cartItem) } });
      return;
    }
    cart?.addToCart(cartItem);
    onToast?.('Added to cart!', 'success', { action: { label: 'Undo', onClick: () => cart?.removeFromCart(p.ProductID) } });
  };

  const toggleSave = (e) => {
    e.stopPropagation();
    onToggleSave?.(p.ProductID);
  };

  return (
    <div className="listing-card" onClick={() => onOpen(p.ProductID)} onPointerEnter={startCycle} onPointerLeave={stopCycle}>
      <div className="listing-img">
        {images.length ? images.map((src, i) => (
          <img key={src + i} src={src} alt={i === 0 ? p.ProductName : ''} className={multi ? `lc-multi${i === idx ? ' on' : ''}` : undefined} />
        )) : '📦'}
        <span className="listing-badge">{p.CategoryName || 'Others'}</span>

        {multi && (
          <span className="lc-dots" aria-hidden="true">
            {images.map((_, i) => <i key={i} className={i === idx ? 'on' : ''} />)}
          </span>
        )}

        {/* Hover actions: slide up on hover / keyboard focus */}
        <div className="lc-actions" onClick={(e) => e.stopPropagation()}>
          {isMine ? (
            <span className="lc-own">Your listing</span>
          ) : (
            <>
              <button
                type="button"
                className={`lc-add${inCart ? ' added' : ''}`}
                disabled={outOfStock && !inCart}
                onClick={toggleCart}
                title={inCart ? 'Click to remove from cart' : undefined}
              >
                {inCart ? (
                  <>
                    <span className="lc-add-in">✓ In cart</span>
                    <span className="lc-add-remove">Remove</span>
                  </>
                ) : outOfStock ? 'Out of stock' : 'Add to cart'}
              </button>
              <button
                type="button"
                className={`lc-save${saved ? ' saved' : ''}${popped ? ' pop' : ''}`}
                aria-label={saved ? 'Remove from saved items' : 'Save for later'}
                aria-pressed={saved}
                title={saved ? 'Saved' : 'Save for later'}
                onClick={toggleSave}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="listing-info">
        <h4>{p.ProductName}</h4>
        <div className="meta lc-seller">
          <span className="lc-avatar" aria-hidden="true">
            {avatarSrc && !avatarFailed
              ? <img src={avatarSrc} alt="" onError={() => setAvatarFailed(true)} />
              : initials}
          </span>
          <span className="lc-seller-name">{sellerName}</span>
          {postedAgo && <span className="lc-time">{postedAgo}</span>}
        </div>
        <div className="listing-foot">
          <div className="price">₱<CountUp value={price} format={(n) => n.toLocaleString()} /></div>
          {p.ProductCondition && <span className={`cond-pill ${condClass}`}>{p.ProductCondition}</span>}
        </div>
      </div>
    </div>
  );
}
