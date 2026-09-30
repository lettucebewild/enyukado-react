require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const multer   = require('multer');

const { connectDB } = require('./config/db');

const app  = express();
const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET is not set in .env — using an insecure default. Set one before deploying.');
}

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve all uploaded files (product images, QR codes, payment proofs, message images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
// ROUTES
// ============================================================
app.use('/api/users',        require('./routes/userRoutes'));
app.use('/api/products',     require('./routes/productRoutes'));
app.use('/api/categories',   require('./routes/categoryRoutes'));
app.use('/api/transactions', require('./routes/transactionRoutes'));
app.use('/api/reviews',      require('./routes/reviewRoutes'));
app.use('/api/saved',        require('./routes/savedRoutes'));
app.use('/api/messages',     require('./routes/messageRoutes'));
app.use('/api/admin',        require('./routes/adminRoutes'));

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/',           (req, res) => res.send('Enyukado API is Live!'));
app.get('/api/status', (req, res) => res.json({ status: 'Online' }));

// ============================================================
// ERROR HANDLING
// ============================================================
// Unknown route -> JSON 404 (instead of Express's HTML page)
app.use((req, res) => {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Upload errors (file too large, wrong type), malformed JSON, anything uncaught
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE'  ? 'File is too large.'
                      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
                                                          ? 'Too many files, or an unexpected file field.'
                      : err.message;
        return res.status(400).json({ message });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'Invalid JSON body.' });
    }
    // fileFilter rejections ("Only image files are allowed...")
    if (/Only image files/.test(err.message)) {
        return res.status(400).json({ message: err.message });
    }
    console.error('Unhandled Error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
});

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
    try {
        await connectDB();
        app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
    } catch (err) {
        console.error('❌ Could not start server:', err.message);
        process.exit(1);
    }
}

// `node server.js` starts the server; `require('./server')` just gives you the app (for tests)
if (require.main === module) startServer();

module.exports = app;
