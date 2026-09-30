// Run once after pointing MONGODB_URI at your database:  npm run seed
//
// Creates (only if missing):
//   - the 8 marketplace categories
//   - the Enyukado Bot account (UserID = BOT_USER_ID, default 4 — the React frontend expects 4)
//   - one admin account (ADMIN_EMAIL / ADMIN_PASSWORD from .env; a random password is
//     generated and printed if ADMIN_PASSWORD isn't set)
// Safe to run repeatedly.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { connectDB, mongoose } = require('../config/db');
const { Category, User, nextId, bumpCounter } = require('../models');
const { BOT_USER_ID } = require('../services/messaging');

const CATEGORIES = [
    'Books', 'Electronics', 'Clothing', 'School Supplies',
    'Sports & Recreation', 'Food & Drinks', 'Services', 'Others'
];

async function seed() {
    await connectDB();

    // ---- Categories ----
    for (const name of CATEGORIES) {
        const exists = await Category.exists({ CategoryName: name });
        if (!exists) {
            await Category.create({ CategoryID: await nextId('CategoryID'), CategoryName: name });
            console.log(`➕ Category: ${name}`);
        }
    }

    // ---- Enyukado Bot ----
    // Created first with an explicit ID, then the UserID counter is moved past it so a
    // normal sign-up can never be handed the bot's ID.
    if (!(await User.exists({ UserID: BOT_USER_ID }))) {
        await User.create({
            UserID:     BOT_USER_ID,
            FirstName:  'Enyukado',
            LastName:   'Bot',
            Email:      'bot@enyukado.local',
            Password:   await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10), // nobody logs in as the bot
            IsAdmin:    false,
            IsApproved: true // keeps it out of the admin "pending accounts" list
        });
        console.log(`🤖 Bot user created (UserID ${BOT_USER_ID})`);
    }
    await bumpCounter('UserID', BOT_USER_ID);

    // ---- Admin ----
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@enyukado.local').toLowerCase();
    if (!(await User.exists({ Email: adminEmail }))) {
        const generated = !process.env.ADMIN_PASSWORD;
        const password  = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');

        await User.create({
            UserID:     await nextId('UserID'),
            FirstName:  'Admin',
            LastName:   'Enyukado',
            Email:      adminEmail,
            Password:   await bcrypt.hash(password, 10),
            IsAdmin:    true,
            IsApproved: true
        });
        console.log(`🔑 Admin created: ${adminEmail}${generated ? `  password: ${password}  (change it!)` : ''}`);
    }

    console.log('✅ Seed complete.');
}

seed()
    .catch(err => { console.error('❌ Seed failed:', err.message); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
