import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../hooks/useToast.js';
import Toast from '../components/Toast.jsx';
import AppHeader from '../components/AppHeader.jsx';
import ChangePasswordModal from '../components/ChangePasswordModal.jsx';
import EditProfileModal from '../components/EditProfileModal.jsx';
import { getUser } from '../api/usersApi.js';
import { getReviewsForUser } from '../api/reviewsApi.js';
import { deleteProduct, getMyListings, getProducts } from '../api/productsApi.js';
import { getMyPurchases } from '../api/transactionsApi.js';
import { getSavedItems, unsaveItem } from '../api/savedApi.js';
import { uploadProfilePhoto } from '../api/usersApi.js';
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

function ProfileItemImage({ src, alt, className }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={`${className} profile-image-placeholder`} aria-label={alt}>📦</div>;
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}

function ProfileGridSkeleton() {
  return (
    <div className="profile-grid" aria-label="Loading items">
      {Array.from({ length: 4 }, (_, i) => (
        <div className="profile-skeleton" key={i} aria-hidden="true">
          <div className="skeleton-shimmer profile-skeleton-image" />
          <div className="skeleton-shimmer profile-skeleton-line" />
          <div className="skeleton-shimmer profile-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

function ProfilePurchasesSkeleton() {
  return (
    <div className="profile-list" aria-label="Loading purchases">
      {Array.from({ length: 4 }, (_, i) => (
        <div className="profile-list-row profile-purchase-skeleton" key={i} aria-hidden="true">
          <div className="skeleton-shimmer profile-purchase-skeleton-image" />
          <div className="profile-purchase-skeleton-info">
            <div className="skeleton-shimmer profile-purchase-skeleton-line title" />
            <div className="skeleton-shimmer profile-purchase-skeleton-line" />
          </div>
          <div className="skeleton-shimmer profile-purchase-skeleton-price" />
        </div>
      ))}
    </div>
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
  const [photoUploading, setPhotoUploading] = useState(false);
  const avatarInputRef = useRef(null);

  // ---- header state: unread count for the Messages badge. Messages, Cart and
  // Sell are real pages (/messages, /cart, /sell) rendered by the Dashboard
  // shell, so the header buttons here simply navigate to them.
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    getUnreadCount(token).then((d) => setUnreadCount(d.unreadCount || 0)).catch(() => {});
    const interval = setInterval(() => {
      getUnreadCount(token).then((d) => setUnreadCount(d.unreadCount || 0)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [token]);

  function openCart() {
    navigate('/cart');
  }
  function openMessages(userID, userName) {
    navigate(userID ? `/messages/${userID}` : '/messages', { state: { userName } });
  }
  function openSellModal(data = null) {
    navigate('/sell', { state: { editData: data } });
  }

  // Lock background scroll while a modal is open here too — see the fix note
  // in Dashboard.jsx for why *both* elements need locking.
  const anyOverlayOpen = editOpen || changePwOpen;
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
  const memberSince = profile?.DateCreated
    ? new Date(profile.DateCreated).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const tags = useMemo(() => {
    const t = [];
    if (profile?.Course) t.push({ icon: '🎓', label: profile.Course });
    if (profile?.Year) t.push({ icon: '📚', label: profile.Year });
    if (profile?.CampusArea) t.push({ icon: '📍', label: profile.CampusArea });
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

  async function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const result = await uploadProfilePhoto(file, token);
      setProfile((current) => ({ ...current, ProfileImage: result.profileImage }));
      updateUser({ profileImage: result.profileImage });
      showToast('Profile photo updated.');
    } catch (err) {
      showToast(err.message || 'Failed to upload profile photo.', 'error');
    } finally {
      setPhotoUploading(false);
      event.target.value = '';
    }
  }

  async function handleDeleteListing(product) {
    if (!window.confirm(`Delete "${product.ProductName}"? This cannot be undone.`)) return;
    try {
      await deleteProduct(product.ProductID, token);
      setListings((current) => current.filter((item) => item.ProductID !== product.ProductID));
      showToast('Listing deleted.');
    } catch (err) {
      showToast(err.message || 'Failed to delete listing.', 'error');
    }
  }

  async function handleUnsave(productID) {
    try {
      await unsaveItem(productID, token);
      setSaved((current) => current.filter((item) => item.ProductID !== productID));
      showToast('Removed from saved items.');
    } catch (err) {
      showToast(err.message || 'Failed to remove saved item.', 'error');
    }
  }

  function editListing(product) {
    openSellModal({
      productID: product.ProductID,
      name: product.ProductName,
      price: product.Price,
      categoryID: product.CategoryID,
      condition: product.ProductCondition,
      description: product.Description || '',
      quantity: product.Quantity,
    });
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
    profileImage: user?.profileImage,
    onProfile: () => navigate('/profile'),
    onChangePassword: () => setChangePwOpen(true),
    onLogout: handleLogout,
    onSearchSubmit: (q) => navigate('/dashboard', { state: { search: q } }),
  };

  return (
    <div className="profile-page">
      <AppHeader {...headerProps} active="none" onBrandClick={() => navigate('/dashboard')} />

      <main className="profile-main">
        {!profile ? (
          <div className="profile-loading" aria-label="Loading profile">
            <div className="skeleton-shimmer profile-loading-banner" />
            <div className="skeleton-shimmer profile-loading-title" />
            <div className="skeleton-shimmer profile-loading-line" />
            <ProfileGridSkeleton />
          </div>
        ) : (
          <>
            {/* ===== PROFILE HEADER ===== */}
            <div className="profile-header">
              <div className="profile-banner">
                <span className="profile-banner-label">CAMPUS MARKETPLACE</span>
                <span className="profile-banner-stamp">STUDENT PROFILE</span>
              </div>
              <div className="profile-body">
                <div className="profile-identity">
                  <div className="profile-avatar">
                    {profile.ProfileImage ? <img src={profile.ProfileImage} alt={`${profile.FirstName}'s profile`} onError={() => setProfile((current) => ({ ...current, ProfileImage: null }))} /> : initials}
                    {isOwn && (
                      <>
                        <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleProfilePhotoChange} hidden />
                        <button
                          type="button"
                          className="profile-photo-trigger"
                          title="Upload profile photo"
                          aria-label="Upload profile photo"
                          disabled={photoUploading}
                          onClick={() => avatarInputRef.current?.click()}
                        >
                          {photoUploading ? 'Uploading…' : 'Change photo'}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="profile-identity-copy">
                    <div className="profile-kicker">
                      <span className="profile-kicker-mark" />
                      {isOwn ? 'YOUR CAMPUS PROFILE' : 'CAMPUS MEMBER'}
                    </div>
                    <h1 className="profile-name">{profile.FirstName} {profile.LastName}</h1>
                    {memberSince && <div className="profile-handle"><span className="profile-member-dot" />Member since {memberSince}</div>}
                    {profile.Bio && <div className="profile-bio">{profile.Bio}</div>}
                    <div className="profile-tags">
                      {tags.map((t, i) => (
                        <span className="profile-tag" key={i}>{t.icon} {t.label}</span>
                      ))}
                    </div>
                  </div>
                  {isOwn && (
                    <div className="profile-avatar-actions">
                      <button className="btn-edit-profile" onClick={() => setEditOpen(true)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        Edit Profile
                      </button>
                    </div>
                  )}
                </div>
                <div className="profile-stats">
                  <div className="stat-item"><div className="stat-value">{listings.length}</div><div className="stat-label">Listings</div></div>
                  <div className="stat-item"><div className="stat-value">{soldCount}</div><div className="stat-label">Sold</div></div>
                  <div className="stat-item"><div className="stat-value">{purchases.length}</div><div className="stat-label">Bought</div></div>
                  <div className="stat-item"><div className="stat-value">{rating}</div><div className="stat-label">Rating</div></div>
                </div>
              </div>
            </div>

            <div className="profile-workspace">
              <section className="profile-content" aria-label="Profile activity">
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
                  tab === 'purchases' ? <ProfilePurchasesSkeleton /> : <ProfileGridSkeleton />
                ) : tab === 'listings' ? (
                  listings.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">📦</div>
                      <h4>No listings yet</h4>
                      <p>{isOwn ? 'Post something you no longer need!' : 'No listings from this seller yet.'}</p>
                      {isOwn && <button className="empty-state-action" onClick={() => openSellModal(null)}>Post your first listing</button>}
                    </div>
                  ) : (
                    <div className="profile-grid">
                      {listings.map((p) => {
                        const imgURL = p.images?.length ? p.images[0].ImageURL : (p.ImageURL || p.imageURL);
                        return (
                          <article className={`profile-card${p.Status === 'Sold' ? ' sold' : ''}`} key={p.ProductID}>
                            <Link className="profile-card-open" to={`/product/${p.ProductID}`}>
                              <div className="profile-card-img">
                                {imgURL ? <img src={imgURL} alt={p.ProductName} /> : '📦'}
                                {p.Status && <span className={`profile-status-badge ${p.Status}`}>{p.Status}</span>}
                              </div>
                              <div className="profile-card-body">
                                <h4>{p.ProductName}</h4>
                                <div className="price">₱{parseFloat(p.Price).toLocaleString()}</div>
                              </div>
                            </Link>
                            {isOwn && <div className="profile-card-actions">
                              <button type="button" onClick={() => editListing(p)}>Edit</button>
                              <button type="button" className="delete" onClick={() => handleDeleteListing(p)}>Delete</button>
                            </div>}
                          </article>
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
                      <button className="empty-state-action" onClick={() => navigate('/dashboard')}>Browse marketplace</button>
                    </div>
                  ) : (
                    <div className="profile-list">
                      {purchases.map((t) => (
                        <div className="profile-list-row" key={t.TransactionID} role="button" tabIndex={0} onClick={() => t.ProductID && navigate(`/product/${t.ProductID}`)} onKeyDown={(e) => e.key === 'Enter' && t.ProductID && navigate(`/product/${t.ProductID}`)}>
                          <ProfileItemImage className="profile-list-row-img" src={t.ImageURL} alt={t.ProductName || 'Purchased item'} />
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
                      <button className="empty-state-action" onClick={() => navigate('/dashboard')}>Browse marketplace</button>
                    </div>
                  ) : (
                    <div className="profile-grid">
                      {saved.map((p) => {
                        const imgURL = p.images?.length ? p.images[0].ImageURL : (p.ImageURL || p.imageURL);
                        return (
                          <article className={`profile-card${p.Status === 'Sold' ? ' sold' : ''}`} key={p.ProductID}>
                            <Link className="profile-card-open" to={`/product/${p.ProductID}`}>
                              <div className="profile-card-img">
                                {imgURL ? <img src={imgURL} alt={p.ProductName} /> : '📦'}
                                {p.Status === 'Sold' && <span className="profile-status-badge Sold">Sold</span>}
                              </div>
                              <div className="profile-card-body">
                                <h4>{p.ProductName}</h4>
                                <div className="price">₱{parseFloat(p.Price).toLocaleString()}</div>
                              </div>
                            </Link>
                            <div className="profile-card-actions saved-actions">
                              <button type="button" className="delete" onClick={() => handleUnsave(p.ProductID)}>Unsave</button>
                            </div>
                          </article>
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
                      <button className="empty-state-action" onClick={() => navigate('/dashboard')}>Browse marketplace</button>
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
                ) : null}
              </section>

              <aside className="profile-sidebar" aria-label="Seller rating summary">
                <div className="rating-card">
                  <div className="rating-card-heading">
                    <span>SELLER REPUTATION</span>
                    <span className="rating-card-mark">★</span>
                  </div>
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
              </aside>
            </div>
          </>
        )}
      </main>

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