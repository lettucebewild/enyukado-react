const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/enyukado';

// Connects once; server.js awaits this before it starts listening.
async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log(`✅ Connected to MongoDB (${mongoose.connection.name})`);
    } catch (err) {
        console.error('❌ Database Connection Failed:', err.message);
        throw err;
    }
}

module.exports = { connectDB, mongoose };
