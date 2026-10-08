import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/adminApi.js';
import { useToast } from '../hooks/useToast.js';
import Toast from '../components/Toast.jsx';
import './AdminDashboard.css';
import BrandLogo from '../components/BrandLogo.jsx';

const ic = (d) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const ICONS = {
  accounts: ic(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  listings: ic(<><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z" /><polyline points="3.3 7 12 12 20.7 7" /><line x1="12" y1="22" x2="12" y2="12" /></>),
  payments: ic(<><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>),
};
ICONS.allListings = ICONS.listings;

const TABS = [
  { key: 'accounts', label: 'Accounts', count: 'totalAccounts', id: 'UserID', reason: false, desc: 'All student registrations and their approval status.', empty: 'No student accounts have been registered.' },
  { key: 'listings', label: 'Listings', count: 'pendingListings', id: 'ProductID', reason: true, desc: 'New listings that go live once you approve them.', empty: 'No listings are waiting for approval.' },
  { key: 'payments', label: 'Payments', count: 'pendingPayments', id: 'TransactionID', reason: true, desc: 'Payment proofs submitted by buyers.', empty: 'No payments are waiting for approval.' },
  { key: 'allListings', label: 'All listings', count: 'totalListings', id: 'ProductID', reason: false, desc: 'Every listing currently stored in the marketplace.', empty: 'No listings found.' },
];

const peso = (n) => `₱${parseFloat(n).toLocaleString()}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

// Turns a raw API row into what the list shows, per tab.
function describe(tab, r) {
  if (tab === 'accounts')
    return {
      title: `${r.FirstName} ${r.LastName}`,
      status: r.IsApproved ? 'Approved' : 'Pending approval',
      statusClass: r.IsApproved ? 'approved' : 'pending',
      lines: [r.Email, `Registered ${day(r.DateCreated)}`],
    };
  if (tab === 'listings')
    return {
      title: r.ProductName,
      img: r.images?.[0]?.ImageURL || r.ImageURL,
      lines: [
        `${peso(r.Price)} · ${r.ProductCondition} · Qty ${r.Quantity} · ${r.CategoryName}`,
        `Seller: ${r.SellerFirstName} ${r.SellerLastName} (${r.SellerEmail})`,
        r.Description,
      ],
    };
  if (tab === 'allListings')
    return {
      title: r.ProductName,
      img: r.images?.[0]?.ImageURL || r.ImageURL,
      lines: [
        `${peso(r.Price)} · ${r.ProductCondition} · Qty ${r.Quantity} · ${r.Status}`,
        `Seller: ${r.SellerFirstName} ${r.SellerLastName} (${r.SellerEmail})`,
        r.CategoryName,
      ],
    };
  return {
    title: `${r.ProductName} — ${peso(r.Price)}`,
    img: r.ImageURL,
    proof: r.PaymentProofImage,
    lines: [
      `${r.PaymentMethod || 'Payment'} · submitted ${day(r.TransactionDate)}`,
      `Buyer: ${r.BuyerFirstName} ${r.BuyerLastName} (${r.BuyerEmail})`,
      `Seller: ${r.SellerFirstName} ${r.SellerLastName}`,
    ],
  };
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { toasts, showToast, dismissToast } = useToast();
  const session = api.getAdminSession();

  const [tab, setTab] = useState('accounts');
  const [accountFilter, setAccountFilter] = useState('all');
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState(null); // null = loading
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // { row, reason }
  const [deleting, setDeleting] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountDetails, setAccountDetails] = useState(null);
  const [accountDetailsLoading, setAccountDetailsLoading] = useState(false);
  const [accountAvatarFailed, setAccountAvatarFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState(null); // image url

  const active = TABS.find((t) => t.key === tab);

  const logout = useCallback(() => {
    api.clearAdminSession();
    navigate('/admin-login', { replace: true });
  }, [navigate]);

  // Any call that fails with 401 means the token expired or isn't an admin token.
  const fail = useCallback((err) => {
    if (err.status === 401 || err.status === 403) return logout();
    showToast(err.message || 'Something went wrong', 'error');
  }, [logout, showToast]);

  const load = useCallback(async () => {
    setRows(null);
    try {
      const [list, c] = await Promise.all([
        tab === 'accounts' ? api.getAllAccounts() : tab === 'allListings' ? api.getAllListings() : api.getPending(tab),
        api.getCounts(),
      ]);
      setRows(list);
      setCounts(c);
    } catch (err) {
      setRows([]);
      fail(err);
    }
  }, [tab, fail]);

  useEffect(() => {
    setQuery('');
    if (!session) navigate('/admin-login', { replace: true });
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    document.body.classList.add('scroll-page');
    document.documentElement.classList.add('scroll-page');
    return () => {
      document.body.classList.remove('scroll-page');
      document.documentElement.classList.remove('scroll-page');
    };
  }, []);

  async function act(fn, id, okMsg) {
    setBusyId(id);
    try {
      const res = await fn();
      showToast(res?.message || okMsg);
      setRejecting(null);
      setDeleting(null);
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(null);
    }
  }

  const approveRow = (r) => act(() => api.approve(tab, r[active.id]), r[active.id], 'Approved');
  const confirmReject = () =>
    act(() => api.reject(tab, rejecting.row[active.id], rejecting.reason.trim()), rejecting.row[active.id], 'Rejected');
  const confirmDeleteListing = () =>
    act(() => api.deleteListing(deleting.ProductID), deleting.ProductID, 'Listing deleted');

  async function openAccountDetails(account) {
    setSelectedAccount(account);
    setAccountDetails(null);
    setAccountAvatarFailed(false);
    setAccountDetailsLoading(true);
    try {
      setAccountDetails(await api.getAccountDetails(account.UserID));
    } catch (err) {
      setSelectedAccount(null);
      fail(err);
    } finally {
      setAccountDetailsLoading(false);
    }
  }

  if (!session) return null;

  const q = query.trim().toLowerCase();
  const accountRows = tab === 'accounts' && Array.isArray(rows)
    ? rows.filter((r) => accountFilter === 'all' || (accountFilter === 'registered' ? r.IsApproved : !r.IsApproved))
    : rows;
  const shown = accountRows && (q
    ? accountRows.filter((r) => { const d = describe(tab, r); return [d.title, ...d.lines].join(' ').toLowerCase().includes(q); })
    : accountRows);
  const accountFilters = [
    { key: 'registered', label: 'Registered accounts', count: Math.max(0, (counts.totalAccounts ?? 0) - (counts.pendingAccounts ?? 0)) },
    { key: 'pending', label: 'Pending approval', count: counts.pendingAccounts ?? 0 },
    { key: 'all', label: 'All accounts', count: counts.totalAccounts ?? 0 },
  ];
  const emptyMessage = tab === 'accounts'
    ? accountFilter === 'pending' ? 'No accounts are waiting for approval.'
      : accountFilter === 'registered' ? 'No approved accounts yet.'
        : active.empty
    : active.empty;

  return (
    <div className="admin-page">
      <aside className="admin-side">
        <div className="admin-brand">
          <BrandLogo size={26} stroke="#8fbbee" />
          <span className="admin-brand-name">Enyukado</span>
          <span className="admin-brand-tag">Admin</span>
        </div>

        <nav className="admin-nav" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`admin-navitem${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {ICONS[t.key]}
              <span>{t.label}</span>
              <span className={`admin-count${counts[t.count] ? ' has' : ''}`}>{counts[t.count] ?? 0}</span>
            </button>
          ))}
        </nav>

        <div className="admin-side-foot">
          <button className="admin-btn ghost" onClick={logout}>Log out</button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-head">
          <div>
            <h1>{active.label}</h1>
            <p>{active.desc}</p>
          </div>
          <button className="admin-btn ghost" onClick={load}>Refresh</button>
        </div>

        {tab === 'accounts' && (
          <div className="admin-account-filters" role="group" aria-label="Filter student accounts">
            {accountFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`admin-account-filter${accountFilter === filter.key ? ' active' : ''}`}
                aria-pressed={accountFilter === filter.key}
                onClick={() => {
                  setAccountFilter(filter.key);
                  setQuery('');
                }}
              >
                <span>{filter.label}</span>
                <span className="admin-account-filter-count">{filter.count}</span>
              </button>
            ))}
          </div>
        )}

        <input
          className="admin-search"
          type="search"
          placeholder={`Search ${active.label.toLowerCase()}`}
          aria-label={`Search ${active.label.toLowerCase()}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {shown === null ? (
          <ul className="admin-list" aria-label="Loading listings">
            {Array.from({ length: 4 }, (_, i) => (
              <li className="admin-row admin-skeleton" key={i} aria-hidden="true">
                <div className="skeleton-shimmer admin-skeleton-thumb" />
                <div className="admin-skeleton-lines">
                  <div className="skeleton-shimmer admin-skeleton-line title" />
                  <div className="skeleton-shimmer admin-skeleton-line" />
                  <div className="skeleton-shimmer admin-skeleton-line short" />
                </div>
              </li>
            ))}
          </ul>
        ) : shown.length === 0 ? (
          <p className="admin-empty">{q ? `No ${active.label.toLowerCase()} match "${query}".` : emptyMessage}</p>
        ) : (
          <ul className="admin-list">
            {shown.map((r) => {
              const d = describe(tab, r);
              const id = r[active.id];
              return (
                <li className="admin-row" key={id}>
                  {d.img && (
                    <button className="admin-thumb" onClick={() => setPreview(d.img)} aria-label="View image">
                      <img src={d.img} alt="" />
                    </button>
                  )}
                  <div className="admin-row-body">
                    <div className="admin-row-title">
                      <h3>{d.title}</h3>
                      {d.status && <span className={`admin-status ${d.statusClass}`}>{d.status}</span>}
                    </div>
                    {d.lines.filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
                    {d.proof && (
                      <button className="admin-proof" onClick={() => setPreview(d.proof)}>
                        <img src={d.proof} alt="" />
                        <span>View payment proof</span>
                      </button>
                    )}
                  </div>
                  <div className="admin-actions">
                    {tab === 'accounts' ? (
                      <>
                        <button className="admin-btn ghost" onClick={() => openAccountDetails(r)}>View details</button>
                        {r.IsApproved ? (
                          <span className="admin-account-approved">Account active</span>
                        ) : (
                          <>
                            <button className="admin-btn primary" disabled={busyId === id} onClick={() => approveRow(r)}>Approve</button>
                            <button className="admin-btn danger" disabled={busyId === id} onClick={() => setRejecting({ row: r, reason: '' })}>Reject</button>
                          </>
                        )}
                      </>
                    ) : tab === 'allListings' ? (
                      <button className="admin-btn danger" disabled={busyId === id} onClick={() => setDeleting(r)}>Delete</button>
                    ) : (
                      <>
                        <button className="admin-btn primary" disabled={busyId === id} onClick={() => approveRow(r)}>Approve</button>
                        <button className="admin-btn danger" disabled={busyId === id} onClick={() => setRejecting({ row: r, reason: '' })}>Reject</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {selectedAccount && (
        <div className="admin-overlay" onClick={() => setSelectedAccount(null)}>
          <section className="admin-modal admin-account-modal" role="dialog" aria-modal="true" aria-labelledby="admin-account-title" onClick={(e) => e.stopPropagation()}>
            <header className="admin-account-modal-head">
              <div className="admin-account-modal-avatar">
                {(accountDetails?.account.ProfileImage || (selectedAccount.Email === 'bot@enyukado.local' ? '/enyukado-bot-avatar.svg' : null)) && !accountAvatarFailed ? (
                  <img
                    src={accountDetails?.account.ProfileImage || '/enyukado-bot-avatar.svg'}
                    alt={selectedAccount.Email === 'bot@enyukado.local' ? 'Enyukado Bot avatar' : ''}
                    onError={() => setAccountAvatarFailed(true)}
                  />
                ) : (
                  <>{selectedAccount.Email === 'bot@enyukado.local' ? '🤖' : `${selectedAccount.FirstName?.[0] || ''}${selectedAccount.LastName?.[0] || ''}`}</>
                )}
              </div>
              <div className="admin-account-modal-heading">
                <p>STUDENT ACCOUNT</p>
                <h2 id="admin-account-title">{selectedAccount.FirstName} {selectedAccount.LastName}</h2>
                <span>{selectedAccount.Email}</span>
              </div>
              <span className={`admin-status ${selectedAccount.IsApproved ? 'approved' : 'pending'}`}>
                {selectedAccount.IsApproved ? 'Approved' : 'Pending approval'}
              </span>
              <button className="admin-detail-close" type="button" onClick={() => setSelectedAccount(null)} aria-label="Close account details">×</button>
            </header>

            {accountDetailsLoading ? (
              <div className="admin-account-loading" role="status">Loading account details…</div>
            ) : accountDetails && (
              <>
                <section className="admin-account-info">
                  <h3>Account information</h3>
                  <dl>
                    <div><dt>Registered</dt><dd>{day(accountDetails.account.DateCreated)}</dd></div>
                    <div><dt>Phone</dt><dd>{accountDetails.account.PhoneNumber || 'Not provided'}</dd></div>
                    <div><dt>Course</dt><dd>{accountDetails.account.Course || 'Not provided'}</dd></div>
                    <div><dt>Year level</dt><dd>{accountDetails.account.Year || 'Not provided'}</dd></div>
                    <div><dt>Campus</dt><dd>{accountDetails.account.CampusArea || 'Not provided'}</dd></div>
                    {accountDetails.account.Bio && <div className="admin-account-bio"><dt>Bio</dt><dd>{accountDetails.account.Bio}</dd></div>}
                  </dl>
                </section>

                <div className="admin-account-activity">
                  <section className="admin-account-section">
                    <h3>Listings <span>{accountDetails.listings.length}</span></h3>
                    {accountDetails.listings.length ? (
                      <ul className="admin-detail-list">
                        {accountDetails.listings.map((listing) => (
                          <li key={listing.ProductID}>
                            {listing.ImageURL ? (
                              <button className="admin-detail-image" type="button" onClick={() => setPreview(listing.ImageURL)} aria-label={`Preview ${listing.ProductName}`}>
                                <img src={listing.ImageURL} alt="" />
                              </button>
                            ) : <div className="admin-detail-image-placeholder">Item</div>}
                            <div className="admin-detail-item-copy">
                              <strong>{listing.ProductName}</strong>
                              <span>{peso(listing.Price)} · {listing.ProductCondition} · Qty {listing.Quantity}</span>
                              <span>{listing.CategoryName || 'Uncategorized'} · {day(listing.DatePosted)}</span>
                            </div>
                            <span className={`admin-status ${listing.Status === 'Available' ? 'approved' : 'pending'}`}>{listing.Status}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="admin-detail-empty">This student has no listings.</p>}
                  </section>

                  <section className="admin-account-section">
                    <h3>Purchases <span>{accountDetails.purchases.length}</span></h3>
                    {accountDetails.purchases.length ? (
                      <ul className="admin-detail-list">
                        {accountDetails.purchases.map((purchase) => (
                          <li key={purchase.TransactionID}>
                            {purchase.ImageURL ? (
                              <button className="admin-detail-image" type="button" onClick={() => setPreview(purchase.ImageURL)} aria-label={`Preview ${purchase.ProductName}`}>
                                <img src={purchase.ImageURL} alt="" />
                              </button>
                            ) : <div className="admin-detail-image-placeholder">Item</div>}
                            <div className="admin-detail-item-copy">
                              <strong>{purchase.ProductName}</strong>
                              <span>{purchase.Price == null ? 'Price unavailable' : peso(purchase.Price)} · {purchase.CategoryName || 'Uncategorized'}</span>
                              <span>Seller: {purchase.SellerName} · {day(purchase.TransactionDate)}</span>
                            </div>
                            <span className={`admin-status ${purchase.Status === 'Completed' ? 'approved' : 'pending'}`}>{purchase.Status}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="admin-detail-empty">This student has no purchases.</p>}
                  </section>
                </div>
              </>
            )}

          </section>
        </div>
      )}

      {preview && (
        <div className="admin-overlay" onClick={() => setPreview(null)}>
          <img className="admin-preview" src={preview} alt="Preview" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {rejecting && (
        <div className="admin-overlay" onClick={() => setRejecting(null)}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>{active.reason ? `Reject this ${tab === 'listings' ? 'listing' : 'payment'}?` : 'Reject this account?'}</h2>
            {active.reason ? (
              <>
                <p>The reason is sent to the user in a message.</p>
                <textarea
                  autoFocus
                  rows={4}
                  placeholder="Reason for rejection"
                  value={rejecting.reason}
                  onChange={(e) => setRejecting((s) => ({ ...s, reason: e.target.value }))}
                />
              </>
            ) : (
              <p>This deletes the account. The student can register again.</p>
            )}
            <div className="admin-modal-actions">
              <button className="admin-btn ghost" onClick={() => setRejecting(null)}>Cancel</button>
              <button
                className="admin-btn danger solid"
                disabled={busyId !== null || (active.reason && !rejecting.reason.trim())}
                onClick={confirmReject}
              >
                {active.reason ? 'Reject' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="admin-overlay" onClick={() => setDeleting(null)}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Delete this listing?</h2>
            <p>“{deleting.ProductName}” will be removed from the marketplace. Listings with purchase records cannot be deleted.</p>
            <div className="admin-modal-actions">
              <button className="admin-btn ghost" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="admin-btn danger solid" disabled={busyId !== null} onClick={confirmDeleteListing}>Delete listing</button>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
