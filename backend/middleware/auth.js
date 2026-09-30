const jwt = require('jsonwebtoken');
require('dotenv').config();

// Verifies "Authorization: Bearer <token>" and sets req.user = { id, isAdmin }.
// Same secret (and fallback) as the login routes in routes/userRoutes.js.
module.exports = function auth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ message: 'No token provided. Access denied.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
        req.user = { id: decoded.id, isAdmin: !!decoded.isAdmin };
        next();
    } catch (err) {
        const message = err.name === 'TokenExpiredError' ? 'Token expired. Please log in again.' : 'Invalid token.';
        return res.status(401).json({ message });
    }
};
