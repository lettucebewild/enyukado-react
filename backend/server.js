const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const { poolPromise } = require('./config/db');

const app  = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());

// Serve all uploaded files (product images, QR codes, payment proofs)
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
app.get('/',            (req, res) => res.send('Enyukado API is Live!'));
app.get('/api/status',  (req, res) => res.json({ status: 'Online' }));

// ============================================================
// START SERVER
// ============================================================
const startServer = async () => {
    try {
        await poolPromise;
        console.log('✅ SQL Server Connected');
        app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
    } catch (err) {
        console.error('❌ Connection Failed:', err.message);
    }
};

startServer();
