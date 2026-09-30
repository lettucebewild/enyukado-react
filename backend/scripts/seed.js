// Run once after pointing MONGODB_URI at your database:  npm run seed
//
// Creates (only if missing):
//   - the 8 marketplace categories (old names are renamed in place; old conditions/payment methods are migrated)
//   - the Enyukado Bot account (UserID = BOT_USER_ID, default 4 — the React frontend expects 4)
//   - one admin account (ADMIN_EMAIL / ADMIN_PASSWORD from .env; a random password is
//     generated and printed if ADMIN_PASSWORD isn't set)
// Safe to run repeatedly.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { connectDB, mongoose } = require('../config/db');
const { Category, User, Product, Transaction, nextId, bumpCounter } = require('../models');
const { BOT_USER_ID } = require('../services/messaging');

const CATEGORIES = [
    'School Supplies', 'Gadgets', 'Books', 'Clothing',
    'Food', 'Arts', 'Tickets', 'Others'
];

// Old name -> new name. Renamed in place so existing listings keep their category.
const CATEGORY_RENAMES = {
    'Electronics':         'Gadgets',
    'Food & Drinks':       'Food',
    'Sports & Recreation': 'Arts',
    'Services':            'Tickets'
};

// Old condition -> new condition (applied to existing listings)
const CONDITION_RENAMES = {
    'Good': 'Lightly used',
    'Used': 'Well used',
    'Fair': 'Well used',
    'Poor': 'Heavily used'
    // 'Like new' is unchanged
};

async function seed() {
    await connectDB();

    // ---- Rename old categories in place ----
    for (const [oldName, newName] of Object.entries(CATEGORY_RENAMES)) {
        if (await Category.exists({ CategoryName: newName })) continue; // already done
        const r = await Category.updateOne({ CategoryName: oldName }, { $set: { CategoryName: newName } });
        if (r.modifiedCount) console.log(`✏️  Category renamed: ${oldName} -> ${newName}`);
    }

    // ---- Categories ----
    for (const name of CATEGORIES) {
        const exists = await Category.exists({ CategoryName: name });
        if (!exists) {
            await Category.create({ CategoryID: await nextId('CategoryID'), CategoryName: name });
            console.log(`➕ Category: ${name}`);
        }
    }

    // ---- Migrate old product conditions ----
    for (const [oldCond, newCond] of Object.entries(CONDITION_RENAMES)) {
        const r = await Product.updateMany({ ProductCondition: oldCond }, { $set: { ProductCondition: newCond } });
        if (r.modifiedCount) console.log(`✏️  ${r.modifiedCount} listing(s): ${oldCond} -> ${newCond}`);
    }

    // ---- Migrate old payment methods ----
    const wallet = await Transaction.updateMany({ PaymentMethod: 'GCash' },
        { $set: { PaymentMethod: 'E-Wallet' } });
    const bank = await Transaction.updateMany({ PaymentMethod: 'E-bank' },
        { $set: { PaymentMethod: 'Online Banking' } });
    if (wallet.modifiedCount || bank.modifiedCount) {
        console.log(`✏️  Payment methods updated (${wallet.modifiedCount} E-Wallet, ${bank.modifiedCount} Online Banking)`);
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
