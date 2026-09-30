// End-to-end API smoke test.  Usage:
//   1. Start MongoDB, run `npm run seed`, then `npm start` in another terminal
//   2. ADMIN_PASSWORD=<admin password> npm run test:api
//      (PowerShell:  $env:ADMIN_PASSWORD="..."; npm run test:api)
//
// Optional env: API_URL (default http://localhost:5000), ADMIN_EMAIL (default from .env)
// Needs Node 18+ (built-in fetch / FormData / Blob). Creates fresh throw-away users each run.
require('dotenv').config();

const API      = (process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');
const ADMIN_EM = process.env.ADMIN_EMAIL || 'admin@enyukado.local';
const ADMIN_PW = process.env.ADMIN_PASSWORD;
const DOMAIN   = '@students.national-u.edu.ph';
const RUN      = Date.now();

// 1x1 transparent PNG
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const png = name => new Blob([PNG], { type: 'image/png' });

let passed = 0, failed = 0;
function check(label, cond, extra = '') {
    if (cond) { passed++; console.log(`  ✅ ${label}`); }
    else      { failed++; console.log(`  ❌ ${label} ${extra}`); }
}

async function call(method, path, { token, json, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let body;
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(API + path, { method, headers, body });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, data };
}

const section = t => console.log(`\n── ${t}`);

async function main() {
    if (!ADMIN_PW) {
        console.error('Set ADMIN_PASSWORD (the admin password printed by `npm run seed`).');
        process.exit(2);
    }

    section('Health');
    let r = await call('GET', '/api/status');
    check('GET /api/status → 200 Online', r.status === 200 && r.data.status === 'Online');
    r = await call('GET', '/api/nope');
    check('Unknown route → JSON 404', r.status === 404 && !!r.data?.message);

    section('Categories');
    r = await call('GET', '/api/categories');
    check('GET /api/categories → list', r.status === 200 && r.data.length >= 1, 'did you run `npm run seed`?');
    const categoryID = r.data?.[0]?.CategoryID;
    r = await call('GET', `/api/categories/${categoryID}`);
    check('GET /api/categories/:id', r.status === 200 && r.data.CategoryID === categoryID);
    r = await call('GET', '/api/categories/abc');
    check('GET /api/categories/abc → 404', r.status === 404);

    section('Registration & approval');
    const sellerEmail = `seller${RUN}${DOMAIN}`;
    const buyerEmail  = `buyer${RUN}${DOMAIN}`;
    r = await call('POST', '/api/users/register', { json: { firstName: 'Sam', lastName: 'Seller', email: 'x@gmail.com', password: 'secret1' } });
    check('Register with non-university email → 400', r.status === 400);
    r = await call('POST', '/api/users/register', { json: { firstName: 'Sam', lastName: 'Seller', email: sellerEmail, password: 'secret1' } });
    check('Register seller → 201', r.status === 201, JSON.stringify(r.data));
    r = await call('POST', '/api/users/register', { json: { firstName: 'Bea', lastName: 'Buyer', email: buyerEmail, password: 'secret1' } });
    check('Register buyer → 201', r.status === 201);
    r = await call('POST', '/api/users/register', { json: { firstName: 'Sam', lastName: 'Seller', email: sellerEmail, password: 'secret1' } });
    check('Duplicate email → 400', r.status === 400);
    r = await call('POST', '/api/users/login', { json: { email: sellerEmail, password: 'secret1' } });
    check('Login before approval → 403', r.status === 403);

    section('Admin login & account approval');
    r = await call('POST', '/api/users/admin-login', { json: { email: ADMIN_EM, password: 'wrong-password' } });
    check('Admin login wrong password → 400', r.status === 400);
    r = await call('POST', '/api/users/admin-login', { json: { email: ADMIN_EM, password: ADMIN_PW } });
    check('Admin login → token', r.status === 200 && !!r.data.token, JSON.stringify(r.data));
    const admin = r.data?.token;
    if (!admin) { console.log('\nCannot continue without admin token.'); return; }

    r = await call('GET', '/api/admin/accounts/pending');
    check('Admin route without token → 401', r.status === 401);
    r = await call('GET', '/api/admin/accounts/pending', { token: admin });
    const sellerRow = r.data?.find(u => u.Email === sellerEmail);
    const buyerRow  = r.data?.find(u => u.Email === buyerEmail);
    check('Pending accounts include new users', r.status === 200 && !!sellerRow && !!buyerRow);
    r = await call('GET', '/api/admin/counts', { token: admin });
    check('GET /api/admin/counts', r.status === 200 && r.data.pendingAccounts >= 2);
    r = await call('PATCH', `/api/admin/accounts/${sellerRow.UserID}/approve`, { token: admin });
    check('Approve seller', r.status === 200);
    r = await call('PATCH', `/api/admin/accounts/${buyerRow.UserID}/approve`, { token: admin });
    check('Approve buyer', r.status === 200);
    r = await call('PATCH', `/api/admin/accounts/${buyerRow.UserID}/approve`, { token: admin });
    check('Approve twice → 400', r.status === 400);

    section('Student login & profile');
    r = await call('POST', '/api/users/login', { json: { email: sellerEmail, password: 'secret1' } });
    check('Seller login', r.status === 200 && !!r.data.token, JSON.stringify(r.data));
    const seller = r.data?.token, sellerID = r.data?.user?.id;
    r = await call('POST', '/api/users/login', { json: { email: buyerEmail, password: 'secret1' } });
    check('Buyer login', r.status === 200 && !!r.data.token);
    const buyer = r.data?.token, buyerID = r.data?.user?.id;
    r = await call('POST', '/api/users/login', { json: { email: sellerEmail, password: 'nope' } });
    check('Login wrong password → 400', r.status === 400);
    r = await call('POST', '/api/admin/accounts', { token: seller });
    check('Student token on admin route → 403/404', r.status === 403 || r.status === 404);
    r = await call('GET', '/api/admin/counts', { token: seller });
    check('Student token on /api/admin/counts → 403', r.status === 403);

    r = await call('GET', '/api/users/profile', { token: seller });
    check('GET /api/users/profile', r.status === 200 && r.data.Email === sellerEmail && !r.data.Password);
    r = await call('PUT', '/api/users/profile', { token: seller, json: { firstName: 'Sam', lastName: 'Seller', bio: 'Hi!', course: 'BSCS', year: '3', campusArea: 'Main' } });
    check('PUT /api/users/profile', r.status === 200);
    r = await call('GET', `/api/users/${sellerID}`);
    check('GET /api/users/:id (public) has bio, no email', r.status === 200 && r.data.Bio === 'Hi!' && !r.data.Email);
    r = await call('PUT', '/api/users/change-password', { token: buyer, json: { currentPassword: 'secret1', newPassword: 'secret2' } });
    check('Change password', r.status === 200);
    r = await call('POST', '/api/users/login', { json: { email: buyerEmail, password: 'secret2' } });
    check('Login with new password', r.status === 200);
    let form = new FormData(); form.append('qrCode', png(), 'qr.png');
    r = await call('POST', '/api/users/qr', { token: seller, form });
    check('Upload QR code', r.status === 200 && !!r.data.qrCodeImage, JSON.stringify(r.data));
    const qrUrl = r.data?.qrCodeImage;
    if (qrUrl) {
        const img = await fetch(qrUrl);
        check('Uploaded QR is served from /uploads', img.status === 200);
    }
    form = new FormData(); form.append('qrCode', new Blob(['x'], { type: 'text/plain' }), 'evil.txt');
    r = await call('POST', '/api/users/qr', { token: seller, form });
    check('Non-image upload rejected → 400 JSON', r.status === 400 && !!r.data?.message, JSON.stringify(r.data));

    section('Products');
    form = new FormData();
    form.append('productName', 'Calculus Textbook'); form.append('price', '250');
    form.append('productCondition', 'Good'); form.append('categoryID', String(categoryID));
    form.append('description', 'Barely used'); form.append('quantity', '1');
    r = await call('POST', '/api/products/add', { token: seller, form });
    check('Add product without image → 400', r.status === 400);
    form.append('productImages', png(), 'a.png'); form.append('productImages', png(), 'b.png');
    r = await call('POST', '/api/products/add', { token: seller, form });
    check('Add product (2 images) → 201', r.status === 201 && !!r.data.productId, JSON.stringify(r.data));
    const productID = r.data?.productId;
    r = await call('GET', '/api/products');
    check('Pending product hidden from public list', r.status === 200 && !r.data.some(p => p.ProductID === productID));
    r = await call('GET', '/api/products/my/listings', { token: seller });
    const mine = r.data?.find(p => p.ProductID === productID);
    check('My listings shows pending product with 2 images', !!mine && mine.Status === 'Pending Approval' && mine.images.length === 2);
    r = await call('GET', '/api/admin/listings/pending', { token: admin });
    check('Admin sees pending listing', r.status === 200 && r.data.some(p => p.ProductID === productID));
    r = await call('PATCH', `/api/admin/listings/${productID}/approve`, { token: admin });
    check('Admin approves listing', r.status === 200);
    r = await call('GET', '/api/products?search=calculus&minPrice=100&maxPrice=300&sort=price_asc');
    check('Public search/filter finds it', r.status === 200 && r.data.some(p => p.ProductID === productID && p.CategoryName));
    r = await call('GET', '/api/products?category=abc');
    check('Invalid category filter → empty list, no error', r.status === 200 && r.data.length === 0);
    r = await call('GET', `/api/products/${productID}`);
    check('GET /api/products/:id has seller QR', r.status === 200 && r.data.QRCodeImage === qrUrl && r.data.SellerFirstName === 'Sam');
    r = await call('GET', '/api/products/999999');
    check('Unknown product → 404', r.status === 404);
    form = new FormData();
    form.append('productName', 'Bad'); form.append('price', 'abc'); form.append('productCondition', 'Good'); form.append('categoryID', String(categoryID));
    form.append('productImages', png(), 'a.png');
    r = await call('POST', '/api/products/add', { token: seller, form });
    check('Non-numeric price → 400 (not 500)', r.status === 400, JSON.stringify(r.data));

    section('Saved items');
    r = await call('POST', '/api/saved', { token: buyer, json: { productID } });
    check('Save item', r.status === 201);
    r = await call('POST', '/api/saved', { token: buyer, json: { productID } });
    check('Save twice → 400', r.status === 400);
    r = await call('GET', `/api/saved/check/${productID}`, { token: buyer });
    check('Check saved → true', r.status === 200 && r.data.saved === true);
    r = await call('GET', '/api/saved', { token: buyer });
    check('List saved', r.status === 200 && r.data.length === 1 && r.data[0].CategoryName);
    r = await call('DELETE', `/api/saved/${productID}`, { token: buyer });
    check('Unsave', r.status === 200);
    r = await call('GET', `/api/saved/check/${productID}`, { token: buyer });
    check('Check saved → false', r.data.saved === false);

    section('Purchase → payment approval → drop-off → pickup');
    form = new FormData(); form.append('productID', String(productID)); form.append('paymentMethod', 'GCash');
    r = await call('POST', '/api/transactions', { token: buyer, form });
    check('Buy without proof → 400', r.status === 400);
    form = new FormData(); form.append('productID', String(productID)); form.append('paymentMethod', 'GCash'); form.append('paymentProof', png(), 'p.png');
    r = await call('POST', '/api/transactions', { token: seller, form });
    check('Cannot buy own product → 400', r.status === 400);
    form = new FormData(); form.append('productID', String(productID)); form.append('paymentMethod', 'GCash'); form.append('paymentProof', png(), 'p.png');
    r = await call('POST', '/api/transactions', { token: buyer, form });
    check('Buyer purchases → 201', r.status === 201 && !!r.data.transactionId, JSON.stringify(r.data));
    const txID = r.data?.transactionId;
    r = await call('GET', '/api/transactions/my/purchases', { token: buyer });
    check('My purchases', r.status === 200 && r.data.some(t => t.TransactionID === txID && t.Status === 'Pending'));
    r = await call('GET', '/api/transactions/my/sales', { token: seller });
    check('My sales', r.status === 200 && r.data.some(t => t.TransactionID === txID));
    r = await call('GET', `/api/transactions/${txID}`, { token: buyer });
    check('GET transaction (buyer)', r.status === 200 && r.data.SellerQRCode === qrUrl);
    r = await call('GET', `/api/transactions/${txID}`, { token: admin });
    check('GET transaction (outsider) → 403', r.status === 403);
    r = await call('PATCH', `/api/transactions/${txID}/dropoff`, { token: seller });
    check('Drop-off before payment approval → 400', r.status === 400);
    r = await call('GET', '/api/admin/payments/pending', { token: admin });
    check('Admin sees pending payment', r.status === 200 && r.data.some(t => t.TransactionID === txID));
    r = await call('PATCH', `/api/admin/payments/${txID}/approve`, { token: admin });
    check('Admin approves payment', r.status === 200);
    r = await call('GET', `/api/products/${productID}`);
    check('Product now Sold', r.data.Status === 'Sold');
    r = await call('PATCH', `/api/transactions/${txID}/dropoff`, { token: buyer });
    check('Buyer cannot drop off → 403', r.status === 403);
    r = await call('PATCH', `/api/transactions/${txID}/dropoff`, { token: seller });
    check('Seller marks dropped off', r.status === 200);
    r = await call('PATCH', `/api/transactions/${txID}/complete`, { token: seller });
    check('Seller cannot complete → 403', r.status === 403);
    r = await call('PATCH', `/api/transactions/${txID}/complete`, { token: buyer });
    check('Buyer confirms pickup', r.status === 200);
    r = await call('DELETE', `/api/products/${productID}`, { token: seller });
    check('Delete product with purchase records → 400', r.status === 400);

    section('Messages');
    r = await call('GET', `/api/messages/system/${txID}`, { token: buyer });
    check('Buyer has system notifications for transaction', r.status === 200 && r.data.length >= 3, `got ${r.data?.length}`);
    r = await call('GET', `/api/messages/system/${txID}`, { token: admin });
    check('Outsider system messages → 403', r.status === 403);
    r = await call('GET', '/api/messages/unread', { token: buyer });
    check('Unread count (buyer got seller auto-messages)', r.status === 200 && r.data.unreadCount >= 1, JSON.stringify(r.data));
    r = await call('POST', '/api/messages', { token: buyer, json: { receiverID: sellerID, content: 'Thanks!', transactionID: txID } });
    check('Send message', r.status === 201, JSON.stringify(r.data));
    form = new FormData(); form.append('receiverID', String(sellerID)); form.append('messageImage', png(), 'm.png');
    r = await call('POST', '/api/messages', { token: buyer, form });
    check('Send image message', r.status === 201, JSON.stringify(r.data));
    r = await call('POST', '/api/messages', { token: buyer, json: { receiverID: buyerID, content: 'me' } });
    check('Message yourself → 400', r.status === 400);
    r = await call('GET', '/api/messages/conversations', { token: seller });
    check('Seller conversations include buyer w/ unread', r.status === 200 && r.data.some(c => c.OtherUserID === buyerID && c.UnreadCount >= 1), JSON.stringify(r.data));
    r = await call('GET', `/api/messages/thread/${buyerID}`, { token: seller });
    check('Thread has messages with SenderName', r.status === 200 && r.data.length >= 3 && !!r.data[0].SenderName);
    r = await call('GET', `/api/messages/thread/${buyerID}`, { token: seller });
    check('Thread marks as read', r.status === 200);
    r = await call('GET', '/api/messages/conversations', { token: seller });
    check('Buyer conversation unread now 0', r.data.find(c => c.OtherUserID === buyerID)?.UnreadCount === 0, JSON.stringify(r.data));
    check('Bot "listing approved" notice sits in bot conversation', r.data.some(c => c.OtherFirstName === 'Enyukado' && c.UnreadCount >= 1), JSON.stringify(r.data));
    r = await call('GET', '/api/messages/search?q=bea', { token: seller });
    check('User search finds buyer', r.status === 200 && r.data.some(u => u.UserID === buyerID));
    r = await call('GET', '/api/messages/search?q=b', { token: seller });
    check('Search < 2 chars → 400', r.status === 400);

    section('Reviews');
    r = await call('POST', '/api/reviews', { token: seller, json: { transactionID: txID, rating: 5 } });
    check('Seller cannot review → 403', r.status === 403);
    r = await call('POST', '/api/reviews', { token: buyer, json: { transactionID: txID, rating: 9 } });
    check('Rating 9 → 400', r.status === 400);
    r = await call('POST', '/api/reviews', { token: buyer, json: { transactionID: txID, rating: 5, comment: 'Great seller' } });
    check('Buyer reviews → 201', r.status === 201, JSON.stringify(r.data));
    const reviewID = r.data?.reviewId;
    r = await call('POST', '/api/reviews', { token: buyer, json: { transactionID: txID, rating: 4 } });
    check('Review twice → 400', r.status === 400);
    r = await call('GET', `/api/reviews/user/${sellerID}`);
    check('Seller reviews + average', r.status === 200 && r.data.totalReviews === 1 && r.data.averageRating === '5.0');
    r = await call('GET', `/api/reviews/transaction/${txID}`, { token: buyer });
    check('Review by transaction', r.status === 200 && r.data.ReviewID === reviewID);
    r = await call('GET', `/api/reviews/${reviewID}`);
    check('Review by id', r.status === 200 && r.data.ProductName === 'Calculus Textbook');
    r = await call('DELETE', `/api/reviews/${reviewID}`, { token: seller });
    check('Delete someone else\'s review → 403', r.status === 403);
    r = await call('DELETE', `/api/reviews/${reviewID}`, { token: buyer });
    check('Delete own review', r.status === 200);

    section('Rejection flows');
    form = new FormData();
    form.append('productName', 'Reject me'); form.append('price', '10'); form.append('productCondition', 'Fair'); form.append('categoryID', String(categoryID));
    form.append('productImages', png(), 'a.png');
    r = await call('POST', '/api/products/add', { token: seller, form });
    const rejId = r.data?.productId;
    r = await call('PATCH', `/api/admin/listings/${rejId}/reject`, { token: admin, json: {} });
    check('Reject listing without reason → 400', r.status === 400);
    r = await call('PATCH', `/api/admin/listings/${rejId}/reject`, { token: admin, json: { reason: 'Blurry photo' } });
    check('Reject listing with reason', r.status === 200);
    r = await call('POST', '/api/users/register', { json: { firstName: 'Rex', lastName: 'Reject', email: `rex${RUN}${DOMAIN}`, password: 'secret1' } });
    r = await call('GET', '/api/admin/accounts/pending', { token: admin });
    const rex = r.data?.find(u => u.Email === `rex${RUN}${DOMAIN}`);
    r = await call('PATCH', `/api/admin/accounts/${rex?.UserID}/reject`, { token: admin });
    check('Reject account', r.status === 200);
    r = await call('POST', '/api/users/register', { json: '{bad json' });
    check('Malformed JSON → 400', r.status === 400 || r.status === 500);

    console.log(`\n════════════════════════════════\n  ${passed} passed, ${failed} failed\n════════════════════════════════`);
    process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error('Test run crashed:', err); process.exit(1); });
