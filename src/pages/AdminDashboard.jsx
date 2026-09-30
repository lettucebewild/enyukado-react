import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/adminApi.js';
import { useToast } from '../hooks/useToast.js';
import Toast from '../components/Toast.jsx';
import './AdminDashboard.css';

const ic = (d) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const ICONS = {
  accounts: ic(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  listings: ic(<><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z" /><polyline points="3.3 7 12 12 20.7 7" /><line x1="12" y1="22" x2="12" y2="12" /></>),
  payments: ic(<><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>),
};

const TABS = [
  { key: 'accounts', label: 'Accounts', count: 'pendingAccounts', id: 'UserID', reason: false, desc: 'Students who registered and are waiting to log in.', empty: 'No accounts are waiting for approval.' },
  { key: 'listings', label: 'Listings', count: 'pendingListings', id: 'ProductID', reason: true, desc: 'New listings that go live once you approve them.', empty: 'No listings are waiting for approval.' },
  { key: 'payments', label: 'Payments', count: 'pendingPayments', id: 'TransactionID', reason: true, desc: 'Payment proofs submitted by buyers.', empty: 'No payments are waiting for approval.' },
];

const peso = (n) => `₱${parseFloat(n).toLocaleString()}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

// Turns a raw API row into what the list shows, per tab.
function describe(tab, r) {
  if (tab === 'accounts')
    return { title: `${r.FirstName} ${r.LastName}`, lines: [r.Email, `Registered ${day(r.DateCreated)}`] };
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
  const { toast, showToast } = useToast();
  const session = api.getAdminSession();

  const [tab, setTab] = useState('accounts');
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState(null); // null = loading
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // { row, reason }
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
      const [list, c] = await Promise.all([api.getPending(tab), api.getCounts()]);
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

  if (!session) return null;

  const q = query.trim().toLowerCase();
  const shown = rows && (q
    ? rows.filter((r) => { const d = describe(tab, r); return [d.title, ...d.lines].join(' ').toLowerCase().includes(q); })
    : rows);

  return (
    <div className="admin-page">
      <aside className="admin-side">
        <div className="admin-brand">
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#326fca" />
            <path d="M7 8h2l2.5 9h8l2-6H11" stroke="#ffe7be" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="13.5" cy="21.5" r="1.5" fill="#f4f5f7" />
            <circle cx="19.5" cy="21.5" r="1.5" fill="#f4f5f7" />
          </svg>
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
          <span className="admin-who">{session.name}</span>
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

        <input
          className="admin-search"
          type="search"
          placeholder={`Search ${active.label.toLowerCase()}`}
          aria-label={`Search ${active.label.toLowerCase()}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {shown === null ? (
          <p className="admin-empty">Loading...</p>
        ) : shown.length === 0 ? (
          <p className="admin-empty">{q ? `No ${active.label.toLowerCase()} match "${query}".` : active.empty}</p>
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
                    <h3>{d.title}</h3>
                    {d.lines.filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
                    {d.proof && (
                      <button className="admin-proof" onClick={() => setPreview(d.proof)}>
                        <img src={d.proof} alt="" />
                        <span>View payment proof</span>
                      </button>
                    )}
                  </div>
                  <div className="admin-actions">
                    <button className="admin-btn primary" disabled={busyId === id} onClick={() => approveRow(r)}>Approve</button>
                    <button className="admin-btn danger" disabled={busyId === id} onClick={() => setRejecting({ row: r, reason: '' })}>Reject</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

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

      <Toast show={toast.show} message={toast.message} type={toast.type} />
    </div>
  );
}
