import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../hooks/useToast.js';
import Toast from '../components/Toast.jsx';
import AppHeader from '../components/AppHeader.jsx';
import ProductPanel from '../components/ProductPanel.jsx';
import MessagesPanel from '../components/MessagesPanel.jsx';
import CartPanel from '../components/CartPanel.jsx';
import SellModal from '../components/SellModal.jsx';
import PaymentModal from '../components/PaymentModal.jsx';
import ChangePasswordModal from '../components/ChangePasswordModal.jsx';
import EditProfileModal from '../components/EditProfileModal.jsx';
import { getUser } from '../api/usersApi.js';
import { getReviewsForUser } from '../api/reviewsApi.js';
import { getMyListings, getProducts } from '../api/productsApi.js';
import { getMyPurchases } from '../api/transactionsApi.js';
import { getSavedItems } from '../api/savedApi.js';
import { getCategories } from '../api/categoriesApi.js';
import { getUnreadCount } from '../api/messagesApi.js';
import '../pages/Dashboard.css';
import './Profile.css';

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

function StarLine({ value, size = '1.1rem' }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <span style={{ fontSize: size, color: 'var(--orange)', letterSpacing: 2 }}>
      {'★★★★★'.slice(0, rounded)}
      {'☆☆☆☆☆'.slice(0, 5 - rounded)}
    </span>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut, updateUser } = useAuth();
  const cart = useCart();
  const { toast, showToast } = useToast();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (!user) navigate('/', { replace: true });
  }, [user, navigate]);

  // Same light, scrollable page treatment the dashboard uses.
  useEffect(() => {
    document.body.classList.add('scroll-page');
    document.documentElement.classList.add('scroll-page');
    return () => {
      document.body.classList.remove('scroll-page');
      document.documentElement.classList.remove('scroll-page');
    };
  }, []);

  const myID = user?.id ? parseInt(user.id, 10) : null;
  const viewParam = searchParams.get('id');
  const profileID = viewParam ? parseInt(viewParam, 10) : myID;
  const isOwn = !!myID && profileID === myID;
  const token = user?.token;

  const [profile, setProfile] = useState(null);
  const [rating, setRating] = useState('—');
  const [reviewCount, setReviewCount] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [listings, setListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('listings');

  const [editOpen, setEditOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);

  // ---- same header/nav state the dashboard keeps: unread count, the
  // Product/Messages/Cart panel stack, the (now full-page) Sell panel, and
  // the Buy Now payment dialog — so the shared header works identically here.
  const [unreadCount, setUnreadCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [panelStack, setPanelStack] = useState([]);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellEditData, setSellEditData] = useState(null);
  const [paymentProduct, setPaymentProduct] = useState(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    getUnreadCount(token).then((d) => setUnreadCount(d.unreadCount || 0)).catch(() => {});
    const interval = setInterval(() => {
      getUnreadCount(token).then((d) => setUnreadCount(d.unreadCount || 0)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [token]);

  function pushPanel(panel) {
    setPanelStack((s) => [...s, panel]);
  }
  function popPanel() {
    setPanelStack((s) => s.slice(0, -1));
  }
  function openCart() {
    pushPanel({ type: 'cart' });
  }
  function openMessages(userID, userName) {
    pushPanel({ type: 'messages', userID, userName });
  }
  function openSellModal(data = null) {
    setSellEditData(data);
    setSellModalOpen(true);
  }

  // Lock background scroll while a modal is open here too — see the fix note
  // in Dashboard.jsx for why *both* elements need locking.
  const anyOverlayOpen = editOpen || changePwOpen || panelStack.length > 0 || sellModalOpen || !!paymentProduct;
  useEffect(() => {
    document.body.style.overflow = anyOverlayOpen ? 'hidden' : '';
    document.documentElement.style.overflow = anyOverlayOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [anyOverlayOpen]);

  const loadProfileData = useCallback(() => {
    if (!profileID) return;
    getUser(profileID).then((u) => setProfile(u)).catch(() => {});
    getReviewsForUser(profileID)
      .then((r) => {
        setRating(r?.averageRating || '—');
        setReviewCount(r?.totalReviews ?? r?.count ?? 0);
        setReviews(Array.isArray(r?.reviews) ? r.reviews : []);
      })
      .catch(() => {});

    if (isOwn && user?.token) {
      Promise.all([
        getMyListings(user.token).catch(() => []),
        getMyPurchases(user.token).catch(() => []),
        getSavedItems(user.token).catch(() => []),
      ]).then(([l, p, s]) => {
        setListings(Array.isArray(l) ? l : []);
        setPurchases(Array.isArray(p) ? p : []);
        setSaved(Array.isArray(s) ? s : []);
      });
    } else {
      // No public "listings by seller" endpoint exists yet, so fall back to
      // filtering the public product feed — this only surfaces that
      // seller's currently Available items, not pending/sold ones.
      getProducts({})
        .then((all) => {
          setListings((Array.isArray(all) ? all : []).filter((p) => p.UserID === profileID));
        })
        .catch(() => {});
      setPurchases([]);
      setSaved([]);
    }
  }, [profileID, isOwn, user?.token]);

  useEffect(() => {
    if (!profileID) return;
    let cancelled = false;
    setLoading(true);
    setTab('listings');

    getUser(profileID).then((u) => !cancelled && setProfile(u)).catch(() => {});
    getReviewsForUser(profileID)
      .then((r) => {
        if (cancelled) return;
        setRating(r?.averageRating || '—');
        setReviewCount(r?.totalReviews ?? r?.count ?? 0);
        setReviews(Array.isArray(r?.reviews) ? r.reviews : []);
      })
      .catch(() => {});

    if (isOwn && user?.token) {
      Promise.all([
        getMyListings(user.token).catch(() => []),
        getMyPurchases(user.token).catch(() => []),
        getSavedItems(user.token).catch(() => []),
      ])
        .then(([l, p, s]) => {
          if (cancelled) return;
          setListings(Array.isArray(l) ? l : []);
          setPurchases(Array.isArray(p) ? p : []);
          setSaved(Array.isArray(s) ? s : []);
        })
        .finally(() => !cancelled && setLoading(false));
    } else {
      // No public "listings by seller" endpoint exists yet, so fall back to
      // filtering the public product feed — this only surfaces that
      // seller's currently Available items, not pending/sold ones.
      getProducts({})
        .then((all) => {
          if (cancelled) return;
          setListings((Array.isArray(all) ? all : []).filter((p) => p.UserID === profileID));
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
      setPurchases([]);
      setSaved([]);
    }

    return () => {
      cancelled = true;
    };
  }, [profileID, isOwn, user?.token]);

  const initials = profile?.FirstName && profile?.LastName
    ? (profile.FirstName[0] + profile.LastName[0]).toUpperCase()
    : '?';
  const subLine = useMemo(
    () => [profile?.Course, profile?.Year, profile?.CampusArea].filter(Boolean).join(' · ') || 'NU Manila Student',
    [profile]
  );
  const memberSince = profile?.DateCreated
    ? new Date(profile.DateCreated).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const tags = useMemo(() => {
    const t = [];
    if (profile?.Course) t.push({ icon: '🎓', label: profile.Course });
    if (profile?.Year) t.push({ icon: '📚', label: profile.Year });
    if (profile?.CampusArea) t.push({ icon: '📍', label: profile.CampusArea });
    t.push({ icon: '🏫', label: 'NU Manila' });
    return t;
  }, [profile]);

  const soldCount = useMemo(() => listings.filter((p) => p.Status === 'Sold').length, [listings]);

  const ratingBars = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => {
      const n = Math.round(r.Rating);
      if (counts[n] !== undefined) counts[n] += 1;
    });
    const total = reviews.length || 1;
    return [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: counts[star],
      pct: Math.round((counts[star] / total) * 100),
    }));
  }, [reviews]);

  const tabs = isOwn
    ? [
        { id: 'listings', label: 'Listings', icon: '📦', count: listings.length },
        { id: 'purchases', label: 'Purchases', icon: '🛍️', count: purchases.length },
        { id: 'saved', label: 'Saved', icon: '❤️', count: saved.length },
        { id: 'reviews', label: 'Reviews', icon: '⭐', count: reviews.length },
        { id: 'settings', label: 'Settings', icon: '⚙️', count: null },
      ]
    : [
        { id: 'listings', label: 'Listings', icon: '📦', count: listings.length },
        { id: 'reviews', label: 'Reviews', icon: '⭐', count: reviews.length },
      ];

  function handleLogout() {
    signOut();
    navigate('/');
  }

  function handleProfileSaved(patch) {
    setProfile((p) => ({ ...p, ...patch }));
    if (isOwn && (patch.FirstName !== undefined || patch.LastName !== undefined)) {
      updateUser({
        firstName: patch.FirstName !== undefined ? patch.FirstName : undefined,
        lastName: patch.LastName !== undefined ? patch.LastName : undefined,
      });
    }
  }

  // Initials for the logged-in user's own avatar menu (top right) — distinct
  // from `initials`, which is the *viewed* profile's initials shown in the
  // big banner and can belong to someone else entirely.
  const myInitials = user?.firstName && user?.lastName
    ? (user.firstName[0] + user.lastName[0]).toUpperCase()
    : 'JD';

  const headerProps = {
    cartCount: cart.count,
    unreadCount,
    onOpenCart: openCart,
    onOpenMessages: () => openMessages(null, null),
    onOpenSell: () => openSellModal(null),
    initials: myInitials,
    onProfile: () => navigate('/profile'),
    onChangePassword: () => setChangePwOpen(true),
    onLogout: handleLogout,
  };

  return (
    <div className="profile-page">
      <AppHeader {...headerProps} onBrandClick={() => navigate('/dashboard')} />

      <main className="profile-main">
        {!profile ? (
          <div className="profile-loading">Loading profile…</div>
        ) : (
          <>
            {/* ===== PROFILE HEADER ===== */}
            <div className="profile-header">
              <div className="profile-banner" />
              <div className="profile-body">
                <div className="profile-avatar-row">
                  <div className="profile-avatar">{initials}</div>
                  {isOwn && (
                    <div className="profile-avatar-actions">
                      <button className="btn-edit-profile" onClick={() => setEditOpen(true)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        Edit Profile
                      </button>
                    </div>
                  )}
                </div>
                <div className="profile-name">{profile.FirstName} {profile.LastName}</div>
                <div className="profile-handle">
                  {subLine}
                  {memberSince && ` · Member since ${memberSince}`}
                </div>
                {profile.Bio && <div className="profile-bio">{profile.Bio}</div>}
                <div className="profile-tags">
                  {tags.map((t, i) => (
                    <span className="profile-tag" key={i}>{t.icon} {t.label}</span>
                  ))}
                </div>
                <div className="profile-stats">
                  <div className="stat-item"><div className="stat-value">{listings.length}</div><div className="stat-label">Listings</div></div>
                  <div className="stat-item"><div className="stat-value">{soldCount}</div><div className="stat-label">Sold</div></div>
                  <div className="stat-item"><div className="stat-value">{purchases.length}</div><div className="stat-label">Bought</div></div>
                  <div className="stat-item"><div className="stat-value">{rating}</div><div className="stat-label">Rating</div></div>
                </div>
              </div>
            </div>

            {/* ===== RATING CARD ===== */}
            <div className="rating-card">
              <div className="rating-big">
                <div className="rating-big-num">{rating === '—' ? '0.0' : rating}</div>
                <StarLine value={rating === '—' ? 0 : rating} />
                <div className="rating-count">{reviewCount} review{reviewCount === 1 ? '' : 's'}</div>
              </div>
              <div className="rating-bars">
                {ratingBars.map((b) => (
                  <div className="rating-bar-row" key={b.star}>
                    <span>{b.star}</span>
                    <div className="rating-bar-bg"><div className="rating-bar-fill" style={{ width: `${b.pct}%` }} /></div>
                    <span>{b.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ===== TABS ===== */}
            <div className="tabs">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className={`tab${tab === t.id ? ' active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.icon} {t.label}
                  {t.count !== null && <span className="tab-count">{t.count}</span>}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="profile-loading">Loading…</div>
            ) : tab === 'listings' ? (
              listings.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📦</div>
                  <h4>No listings yet</h4>
                  <p>{isOwn ? 'Post something you no longer need!' : 'No listings from this seller yet.'}</p>
                </div>
              ) : (
                <div className="profile-grid">
                  {listings.map((p) => {
                    const imgURL = p.images?.length ? p.images[0].ImageURL : (p.ImageURL || p.imageURL);
                    return (
                      <div className="profile-card" key={p.ProductID}>
                        <div className="profile-card-img">
                          {imgURL ? <img src={imgURL} alt={p.ProductName} /> : '📦'}
                          {p.Status && <span className={`profile-status-badge ${p.Status}`}>{p.Status}</span>}
                        </div>
                        <div className="profile-card-body">
                          <h4>{p.ProductName}</h4>
                          <div className="price">₱{parseFloat(p.Price).toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : tab === 'purchases' ? (
              purchases.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🛍️</div>
                  <h4>No purchases yet</h4>
                  <p>Items you buy will appear here.</p>
                </div>
              ) : (
                <div className="profile-list">
                  {purchases.map((t) => (
                    <div className="profile-list-row" key={t.TransactionID}>
                      <img className="profile-list-row-img" src={t.ImageURL || undefined} alt="" />
                      <div className="profile-list-row-info">
                        <div className="profile-list-row-name">{t.ProductName}</div>
                        <div className="profile-list-row-sub">
                          {t.Status} · {timeAgo(new Date(t.TransactionDate))}
                        </div>
                      </div>
                      <div className="profile-list-row-price">₱{parseFloat(t.Price).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )
            ) : tab === 'saved' ? (
              saved.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🤍</div>
                  <h4>Nothing saved yet</h4>
                  <p>Heart items on the marketplace to save them here.</p>
                </div>
              ) : (
                <div className="profile-grid">
                  {saved.map((p) => {
                    const imgURL = p.images?.length ? p.images[0].ImageURL : (p.ImageURL || p.imageURL);
                    return (
                      <div className="profile-card" key={p.ProductID}>
                        <div className="profile-card-img">
                          {imgURL ? <img src={imgURL} alt={p.ProductName} /> : '📦'}
                        </div>
                        <div className="profile-card-body">
                          <h4>{p.ProductName}</h4>
                          <div className="price">₱{parseFloat(p.Price).toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : tab === 'reviews' ? (
              reviews.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">⭐</div>
                  <h4>No reviews yet</h4>
                  <p>Reviews from buyers will appear here.</p>
                </div>
              ) : (
                <div className="reviews-list">
                  {reviews.map((r) => {
                    const rInitials = r.ReviewerFirstName && r.ReviewerLastName
                      ? (r.ReviewerFirstName[0] + r.ReviewerLastName[0]).toUpperCase()
                      : '?';
                    return (
                      <div className="review-card" key={r.ReviewID}>
                        <div className="review-header">
                          <div className="reviewer-avatar">{rInitials}</div>
                          <div>
                            <div className="reviewer-name">{r.ReviewerFirstName} {r.ReviewerLastName}</div>
                            <StarLine value={r.Rating} size="0.85rem" />
                          </div>
                          <div className="review-time">{timeAgo(new Date(r.DateCreated))}</div>
                        </div>
                        {r.Comment && <div className="review-text">{r.Comment}</div>}
                        {r.ProductName && <div className="review-product-ref">On: {r.ProductName}</div>}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="settings-tab">
                <div className="settings-section">
                  <div className="settings-section-title">Account</div>
                  <div className="settings-row" onClick={() => setEditOpen(true)}>
                    <div className="settings-row-icon" style={{ background: 'rgba(50,111,202,0.1)' }}>👤</div>
                    <div className="settings-row-info">
                      <div className="settings-row-title">Edit Profile</div>
                      <div className="settings-row-sub">Update your name and payment QR code</div>
                    </div>
                    <div className="settings-row-action">›</div>
                  </div>
                  <div className="settings-row" onClick={() => setChangePwOpen(true)}>
                    <div className="settings-row-icon" style={{ background: 'rgba(50,111,202,0.1)' }}>🔒</div>
                    <div className="settings-row-info">
                      <div className="settings-row-title">Change Password</div>
                      <div className="settings-row-sub">Keep your account secure</div>
                    </div>
                    <div className="settings-row-action">›</div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title">Danger Zone</div>
                  <div className="settings-row" onClick={handleLogout}>
                    <div className="settings-row-icon" style={{ background: 'rgba(224,80,74,0.1)' }}>🚪</div>
                    <div className="settings-row-info">
                      <div className="settings-row-title">Log Out</div>
                      <div className="settings-row-sub">Sign out of your account</div>
                    </div>
                    <div className="settings-row-action">›</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ===== FULL-SCREEN PANEL STACK (Product / Messages / Cart) ===== */}
      {panelStack.map((panel, i) => {
        if (panel.type === 'product') {
          return (
            <ProductPanel
              key={i}
              productID={panel.productID}
              token={token}
              myUserID={myID}
              onBack={popPanel}
              onPush={pushPanel}
              onToast={showToast}
              onOpenPayment={setPaymentProduct}
              cart={cart}
              headerProps={{ ...headerProps, onBrandClick: () => { setPanelStack([]); navigate('/dashboard'); } }}
            />
          );
        }
        if (panel.type === 'messages') {
          return (
            <MessagesPanel
              key={i}
              initialUserID={panel.userID}
              initialUserName={panel.userName}
              token={token}
              myUserID={myID}
              onBack={popPanel}
              headerProps={{ ...headerProps, onBrandClick: () => { setPanelStack([]); navigate('/dashboard'); } }}
            />
          );
        }
        if (panel.type === 'cart') {
          return (
            <CartPanel
              key={i}
              cart={cart}
              onBack={popPanel}
              onOpenProduct={(id) => pushPanel({ type: 'product', productID: id })}
              onOpenPayment={setPaymentProduct}
              onToast={showToast}
              headerProps={{ ...headerProps, onBrandClick: () => { setPanelStack([]); navigate('/dashboard'); } }}
            />
          );
        }
        return null;
      })}

      {/* ===== SELL (full page) ===== */}
      <SellModal
        open={sellModalOpen}
        onClose={() => setSellModalOpen(false)}
        categories={categories}
        token={token}
        editData={sellEditData}
        onSaved={loadProfileData}
        headerProps={{ ...headerProps, onBrandClick: () => { setPanelStack([]); setSellModalOpen(false); navigate('/dashboard'); } }}
        onToast={showToast}
      />

      <PaymentModal
        product={paymentProduct}
        token={token}
        onClose={() => setPaymentProduct(null)}
        onSuccess={() => { loadProfileData(); if (paymentProduct) cart.removeFromCart(paymentProduct.productID); }}
        onToast={showToast}
      />

      <EditProfileModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        profile={profile}
        token={user?.token}
        onSaved={handleProfileSaved}
        onToast={showToast}
      />
      <ChangePasswordModal
        open={changePwOpen}
        onClose={() => setChangePwOpen(false)}
        token={user?.token}
        onToast={showToast}
      />

      <Toast show={toast.show} message={toast.message} type={toast.type} />
    </div>
  );
}
