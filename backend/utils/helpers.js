require('dotenv').config();

// Public base URL used to build links to uploaded files (images, QR codes, payment proofs).
// Set BASE_URL in .env when deploying, e.g. BASE_URL=https://api.example.com
const BASE_URL = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');

// Strict integer parse: "12" -> 12, "12abc" / "" / undefined / 1.5 -> null
function toInt(value) {
    if (value === undefined || value === null) return null;
    const s = String(value).trim();
    if (!/^-?\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : null;
}

// Escape user input before putting it inside a RegExp (prevents regex injection / ReDoS)
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a Map keyed by `key` from an array of docs
function indexBy(list, key) {
    const map = new Map();
    for (const item of list) map.set(item[key], item);
    return map;
}

// Central error responder used by every route's catch block
function sendError(res, label, err) {
    console.error(`${label}:`, err.message);
    if (res.headersSent) return;

    // Bad input that reached Mongoose (e.g. price = "abc") is the client's fault, not a 500
    if (err.name === 'ValidationError' || err.name === 'CastError') {
        return res.status(400).json({ message: 'Invalid input.', error: err.message });
    }
    res.status(500).json({ message: 'Server error. Please try again.', error: err.message });
}

module.exports = { BASE_URL, toInt, escapeRegex, indexBy, sendError };
