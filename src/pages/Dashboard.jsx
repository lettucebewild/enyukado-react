import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../hooks/useToast.js';
import Toast from '../components/Toast.jsx';
import { getProducts } from '../api/productsApi.js';
import { getCategories } from '../api/categoriesApi.js';
import { getSavedItems, saveItem, unsaveItem } from '../api/savedApi.js';
import { getMyPurchases } from '../api/transactionsApi.js';
import { getMyListings } from '../api/productsApi.js';
import { getUnreadCount } from '../api/messagesApi.js';
import ProductPanel from '../components/ProductPanel.jsx';
import MessagesPanel from '../components/MessagesPanel.jsx';
import CartPanel from '../components/CartPanel.jsx';
import SellModal from '../components/SellModal.jsx';
import PaymentModal from '../components/PaymentModal.jsx';
import AppHeader from '../components/AppHeader.jsx';
import ChangePasswordModal from '../components/ChangePasswordModal.jsx';
import './Dashboard.css';

// Emoji shown per category chip. Keyed by CategoryName as it comes back
// from GET /api/categories — update this map (and the DB category names,
// see the SQL note at the bottom of this file) if you rename categories.
const CATEGORY_EMOJI = {
  'School Supplies': '🎒',
  Gadgets: '💻',
  Books: '📚',
  Clothing: '👕',
  Food: '🍱',
  Arts: '🎨',
  Tickets: '🎟️',
  Others: '📦',
  // legacy DB names, kept so old data still gets a sensible icon
  Electronics: '💻',
  'Sports & Recreation': '🎨',
  'Food & Drinks': '🍱',
  Services: '🎟️',
};

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

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const cart = useCart();
  const { toast, showToast } = useToast();

  useEffect(() => {
    if (!user) navigate('/', { replace: true });
  }, [user, navigate]);

  // The global stylesheet gives <body> a fixed dark gradient + overflow:hidden
  // for the Login intro. Swap in a light, scrollable page here.
  useEffect(() => {
    document.body.classList.add('scroll-page');
    document.documentElement.classList.add('scroll-page');
    return () => {
      document.body.classList.remove('scroll-page');
      document.documentElement.classList.remove('scroll-page');
    };
  }, []);

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeSort, setActiveSort] = useState('newest');
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [activity, setActivity] = useState([]);
  const [savedIds, setSavedIds] = useState(new Set());
  const [poppedHeartId, setPoppedHeartId] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const [panelStack, setPanelStack] = useState([]);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellEditData, setSellEditData] = useState(null);
  const [paymentProduct, setPaymentProduct] = useState(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const searchTimer = useRef(null);
  const token = user?.token;
  const myUserID = user?.id ? parseInt(user.id, 10) : null;

  // ---- initial data ----
  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    getSavedItems(token)
      .then((saved) => setSavedIds(new Set(saved.map((p) => p.ProductID))))
      .catch(() => {});
    getUnreadCount(token).then((d) => setUnreadCount(d.unreadCount || 0)).catch(() => {});
    const interval = setInterval(() => {
      getUnreadCount(token).then((d) => setUnreadCount(d.unreadCount || 0)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [token]);

  const loadActivity = useCallback(async () => {
    if (!token) return;
    try {
      const [purchases, listings] = await Promise.all([
        getMyPurchases(token),
        getMyListings(token),
      ]);
      const items = [];
      purchases.forEach((t) => items.push({
        type: 'buy', icon: '✅',
        title: `You bought "${t.ProductName}"`,
        sub: `₱${parseFloat(t.Price).toLocaleString()} · Status: ${t.Status}`,
        date: new Date(t.TransactionDate),
      }));
      listings.forEach((p) => items.push({
        type: 'sell', icon: '📦',
        title: `You listed "${p.ProductName}"`,
        sub: `₱${parseFloat(p.Price).toLocaleString()} · ${p.Status}`,
        date: new Date(p.DatePosted),
      }));
      items.sort((a, b) => b.date - a.date);
      setActivity(items.slice(0, 5));
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  // Lock background scroll while any full-screen panel or centered modal is
  // open. Without this, the long dashboard page underneath stays scrollable
  // (its own scrollbar keeps working) even though the panel on top already
  // fills the whole visible screen — which is the "extra scroll" people
  // notice, since the thing you can actually see doesn't need to scroll.
  //
  // Locking body alone isn't enough: the "scroll-page" class (added above)
  // puts an explicit `overflow: auto` on <html> too, and once <html> has its
  // own explicit overflow the browser scrolls the *document* using <html>,
  // not <body> — so body's overflow:hidden was quietly ignored and the page
  // underneath kept scrolling. Lock both elements.
  const anyOverlayOpen = panelStack.length > 0 || sellModalOpen || !!paymentProduct || changePasswordOpen;
  useEffect(() => {
    document.body.style.overflow = anyOverlayOpen ? 'hidden' : '';
    document.documentElement.style.overflow = anyOverlayOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [anyOverlayOpen]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const data = await getProducts({
        search: activeSearch || undefined,
        category: activeCategory || undefined,
        sort: activeSort,
      });
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts(null); // signals error state
    } finally {
      setLoadingProducts(false);
    }
  }, [activeSearch, activeCategory, activeSort]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function handleSearchChange(value) {
    setSearchInput(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setActiveSearch(value.trim()), 400);
  }

  function clearFilters() {
    setActiveCategory(null);
    setActiveSearch('');
    setSearchInput('');
  }

  // ---- favorites (heart) ----
  async function toggleFavorite(productID) {
    if (!token) return showToast('Please log in to save items.', 'error');
    const isSaved = savedIds.has(productID);
    setSavedIds((prev) => {
      const next = new Set(prev);
      isSaved ? next.delete(productID) : next.add(productID);
      return next;
    });
    setPoppedHeartId(productID);
    setTimeout(() => setPoppedHeartId((id) => (id === productID ? null : id)), 450);
    try {
      if (isSaved) {
        await unsaveItem(productID, token);
        showToast('Removed from saved items.');
      } else {
        await saveItem(productID, token);
        showToast('Saved! View in your profile → Saved tab.');
      }
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        isSaved ? next.add(productID) : next.delete(productID);
        return next;
      });
    }
  }

  // ---- panel stack (Shopee-style: opening a panel stacks it on top) ----
  function pushPanel(panel) {
    setPanelStack((s) => [...s, panel]);
  }
  function popPanel() {
    setPanelStack((s) => s.slice(0, -1));
  }
  function openProduct(productID) {
    pushPanel({ type: 'product', productID });
  }
  function openMessages(userID, userName) {
    pushPanel({ type: 'messages', userID, userName });
  }
  function openCart() {
    pushPanel({ type: 'cart' });
  }

  function openSellModal(editData = null) {
    setSellEditData(editData);
    setSellModalOpen(true);
  }

  function handleLogout() {
    signOut();
    navigate('/');
  }

  const initials = user?.firstName && user?.lastName
    ? (user.firstName[0] + user.lastName[0]).toUpperCase()
    : 'JD';

  const sortedCategories = useMemo(() => {
    const others = categories.filter((c) => c.CategoryName === 'Others');
    const rest = categories.filter((c) => c.CategoryName !== 'Others');
    return [...rest, ...others];
  }, [categories]);

  const headerProps = {
    cartCount: cart.count,
    unreadCount,
    onOpenCart: openCart,
    onOpenMessages: () => openMessages(null, null),
    onOpenSell: () => openSellModal(null),
    initials,
    onProfile: () => navigate('/profile'),
    onChangePassword: () => setChangePasswordOpen(true),
    onLogout: handleLogout,
  };

  return (
    <div className="dash-body">
      {/* ===== NAVBAR ===== */}
      <AppHeader {...headerProps} onBrandClick={clearFilters} />

      {/* ===== MAIN ===== */}
      <main className="main">
        <div className="hero">
          <div className="hero-text">
            <h2>Welcome back{user?.firstName ? `, ${user.firstName}` : ''}! 👋</h2>
            <p>Browse listings from your fellow students, or post something you no longer need.</p>
          </div>
          <button className="hero-cta" onClick={() => openSellModal(null)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Post a listing
          </button>
        </div>

        <div className="section-header">
          <span className="section-title">Browse listings</span>
        </div>

        <div className="browse-search">
          <div className="browse-search-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </div>
          <input type="text" placeholder="Search listings…" value={searchInput} onChange={(e) => handleSearchChange(e.target.value)} />
          <div className="browse-search-arrow">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </div>
        </div>

        <div className="categories-row">
          <div className="categories">
            <button className={`chip${!activeCategory ? ' active' : ''}`} onClick={() => setActiveCategory(null)}>
              <span>🛍️</span> All
            </button>
            {sortedCategories.map((c) => (
              <button
                key={c.CategoryID}
                className={`chip${String(activeCategory) === String(c.CategoryID) ? ' active' : ''}`}
                onClick={() => setActiveCategory(c.CategoryID)}
              >
                <span>{CATEGORY_EMOJI[c.CategoryName] || '🏷️'}</span> {c.CategoryName}
              </button>
            ))}
          </div>
          <div className="sort-control">
            <label htmlFor="sortSelect">Sort by:&nbsp;</label>
            <select id="sortSelect" className="sort-select" value={activeSort} onChange={(e) => setActiveSort(e.target.value)}>
              <option value="newest">Newest to oldest</option>
              <option value="oldest">Oldest to newest</option>
              <option value="price_asc">Price: Low to high</option>
              <option value="price_desc">Price: High to low</option>
            </select>
          </div>
        </div>

        <div className="listings-grid">
          {loadingProducts ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: '#888' }}>Loading...</div>
          ) : products === null ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: 'var(--red)' }}>Failed to load listings. Is the server running?</div>
          ) : products.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: '#888' }}>No listings found.</div>
          ) : (
            products.map((p) => {
              const imgURL = p.images?.length ? p.images[0].ImageURL : (p.ImageURL || p.imageURL);
              const condClass = p.ProductCondition === 'Poor' ? 'poor'
                : (p.ProductCondition === 'Fair' || p.ProductCondition === 'Used') ? 'fair' : '';
              const liked = savedIds.has(p.ProductID);
              return (
                <div className="listing-card" key={p.ProductID} onClick={() => openProduct(p.ProductID)}>
                  <div className="listing-img">
                    {imgURL ? <img src={imgURL} alt={p.ProductName} /> : '📦'}
                    <span className="listing-badge">{p.CategoryName || 'Others'}</span>
                  </div>
                  <div className="listing-info">
                    <h4>{p.ProductName}</h4>
                    <div className="price">₱{parseFloat(p.Price).toLocaleString()}</div>
                    <div className="meta">
                      <span className={`condition-dot ${condClass}`}></span>
                      {p.ProductCondition} · {p.sellerName || 'Student Seller'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="section-header">
          <span className="section-title">Your activity</span>
        </div>
        <div className="activity-list">
          {activity.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#888', fontSize: '0.88rem' }}>No activity yet.</div>
          ) : (
            activity.map((a, i) => (
              <div className="activity-item" key={i}>
                <div className={`activity-icon ${a.type}`}>{a.icon}</div>
                <div className="activity-text"><h5>{a.title}</h5><p>{a.sub}</p></div>
                <span className="activity-time">{timeAgo(a.date)}</span>
              </div>
            ))
          )}
        </div>
      </main>

      <footer className="dash-footer">
        <span>Enyukado © 2026 · Made for students, by students.</span>
      </footer>

      {/* ===== FULL-SCREEN PANEL STACK ===== */}
      {/* Panels are rendered in push order and all share the same CSS
          z-index (.fullpanel-overlay), so later-pushed panels simply paint
          on top of earlier ones in normal DOM order — no per-panel z-index
          juggling needed. */}
      {panelStack.map((panel, i) => {
        if (panel.type === 'product') {
          return (
            <ProductPanel
              key={i}
              productID={panel.productID}
              token={token}
              myUserID={myUserID}
              onBack={popPanel}
              onPush={pushPanel}
              onToast={showToast}
              onOpenPayment={setPaymentProduct}
              cart={cart}
              headerProps={{ ...headerProps, onBrandClick: () => { setPanelStack([]); clearFilters(); } }}
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
              myUserID={myUserID}
              onBack={popPanel}
              headerProps={{ ...headerProps, onBrandClick: () => { setPanelStack([]); clearFilters(); } }}
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
              headerProps={{ ...headerProps, onBrandClick: () => { setPanelStack([]); clearFilters(); } }}
            />
          );
        }
        return null;
      })}

      {/* ===== SELL (full page) ===== */}
      <SellModal
        open={sellModalOpen}
        onClose={() => setSellModalOpen(false)}
        categories={sortedCategories}
        token={token}
        editData={sellEditData}
        onSaved={loadProducts}
        headerProps={{ ...headerProps, onBrandClick: () => { setPanelStack([]); clearFilters(); setSellModalOpen(false); } }}
        onToast={showToast}
      />

      <PaymentModal
        product={paymentProduct}
        token={token}
        onClose={() => setPaymentProduct(null)}
        onSuccess={() => { loadProducts(); loadActivity(); if (paymentProduct) cart.removeFromCart(paymentProduct.productID); }}
        onToast={showToast}
      />

      <ChangePasswordModal
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        token={token}
        onToast={showToast}
      />

      <Toast show={toast.show} message={toast.message} type={toast.type} />
    </div>
  );
}

// ------------------------------------------------------------------
// NOTE ON CATEGORIES
// ------------------------------------------------------------------
// Category chips are still fetched live from GET /api/categories, so
// they'll always match whatever's in the Categories table. The requested
// chip set (School Supplies, Gadgets, Books, Clothing, Food, Arts,
// Tickets, Others) won't appear until the DB rows are renamed to match.
// Run this once in SSMS to rename the existing 8 categories in place
// (keeps the same CategoryIDs, so existing listings keep their category):
//
//   UPDATE Categories SET CategoryName = 'Gadgets'  WHERE CategoryName = 'Electronics';
//   UPDATE Categories SET CategoryName = 'Food'      WHERE CategoryName = 'Food & Drinks';
//   UPDATE Categories SET CategoryName = 'Arts'      WHERE CategoryName = 'Sports & Recreation';
//   UPDATE Categories SET CategoryName = 'Tickets'   WHERE CategoryName = 'Services';
//   -- Books, Clothing, School Supplies, Others already match.
