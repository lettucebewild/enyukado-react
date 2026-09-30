require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, mongoose } = require('../config/db');
const { User, nextId } = require('../models');

async function main() {
    const email    = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD in .env first.');
    if (password.length < 6) throw new Error('ADMIN_PASSWORD must be at least 6 characters.');

    await connectDB();
    const hash = await bcrypt.hash(password, 10);

    const existing = await User.findOne({ Email: email });
    if (existing) {
        existing.Password = hash;
        existing.IsAdmin = true;
        existing.IsApproved = true;
        existing.PasswordChangedAt = new Date();
        await existing.save();
        console.log(`✅ Password reset for ${email}`);
    } else {
        await User.create({
            UserID: await nextId('UserID'), FirstName: 'Admin', LastName: 'Enyukado',
            Email: email, Password: hash, IsAdmin: true, IsApproved: true
        });
        console.log(`✅ Admin created: ${email}`);
    }
}

main()
    .catch(err => { console.error('❌', err.message); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());