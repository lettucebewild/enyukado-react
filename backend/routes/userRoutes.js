const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const auth     = require('../middleware/auth');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { poolPromise, sql } = require('../config/db');

// ============================================================
// CONSTANTS
// ============================================================
const ALLOWED_DOMAIN = '@students.national-u.edu.ph';

// ============================================================
// MULTER — QR Code uploads
// ============================================================
const qrDir = path.join(__dirname, '..', 'uploads', 'qrcodes');
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

const qrStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, qrDir),
    filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `qr_${req.user.id}_${Date.now()}${ext}`);
    }
});

const qrUpload = multer({
    storage: qrStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Only image files are allowed for QR codes.'));
    }
});

// ============================================================
// HELPER
// ============================================================
function isValidStudentEmail(email) {
    return typeof email === 'string' && email.toLowerCase().endsWith(ALLOWED_DOMAIN);
}

// ============================================================
// ROUTES
// ============================================================

// --- 1. REGISTER ---
router.post('/register', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: 'First name, last name, email, and password are required.' });
    }

    if (!isValidStudentEmail(email)) {
        return res.status(400).json({ message: `Only university emails are allowed (${ALLOWED_DOMAIN}).` });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    try {
        const pool = await poolPromise;

        const emailCheck = await pool.request()
            .input('email', sql.VarChar, email.toLowerCase())
            .query('SELECT UserID FROM Users WHERE Email = @email');

        if (emailCheck.recordset.length > 0) {
            return res.status(400).json({ message: 'Email already registered.' });
        }

        const salt           = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await pool.request()
            .input('firstName', sql.VarChar, firstName)
            .input('lastName',  sql.VarChar, lastName)
            .input('email',     sql.VarChar, email.toLowerCase())
            .input('password',  sql.VarChar, hashedPassword)
            .query(`
                INSERT INTO Users (FirstName, LastName, Email, Password, IsAdmin, IsApproved)
                VALUES (@firstName, @lastName, @email, @password, 0, 0)
            `);

        res.status(201).json({
            message: 'Registration submitted! Your account is pending admin approval.'
        });
    } catch (err) {
        console.error('Register Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 2. STUDENT LOGIN ---
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    if (!isValidStudentEmail(email)) {
        return res.status(400).json({ message: `Only university emails are allowed (${ALLOWED_DOMAIN}).` });
    }

    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('email', sql.VarChar, email.toLowerCase())
            .query('SELECT * FROM Users WHERE Email = @email');

        const user = result.recordset[0];
        if (!user) return res.status(404).json({ message: 'User not found.' });

        if (user.IsAdmin) {
            return res.status(403).json({ message: 'Please use the admin portal to log in.' });
        }

        if (!user.IsApproved) {
            return res.status(403).json({ message: 'Your account is pending admin approval. Please wait.' });
        }

        const isMatch = await bcrypt.compare(password, user.Password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials.' });

        const token = jwt.sign(
            { id: user.UserID, isAdmin: false },
            process.env.JWT_SECRET || 'secret123',
            { expiresIn: '1d' }
        );

        res.json({
            token,
            user: {
                id:          user.UserID,
                firstName:   user.FirstName,
                lastName:    user.LastName,
                email:       user.Email,
                qrCodeImage: user.QRCodeImage,
                isAdmin:     false
            }
        });
    } catch (err) {
        console.error('Login Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 3. ADMIN LOGIN ---
router.post('/admin-login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('email', sql.VarChar, email.toLowerCase())
            .query('SELECT * FROM Users WHERE Email = @email');

        const user = result.recordset[0];
        if (!user) return res.status(404).json({ message: 'User not found.' });

        if (!user.IsAdmin) {
            return res.status(403).json({ message: 'Unauthorized access.' });
        }

        const isMatch = await bcrypt.compare(password, user.Password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials.' });

        const token = jwt.sign(
            { id: user.UserID, isAdmin: true },
            process.env.JWT_SECRET || 'secret123',
            { expiresIn: '1d' }
        );

        res.json({
            token,
            user: {
                id:        user.UserID,
                firstName: user.FirstName,
                lastName:  user.LastName,
                email:     user.Email,
                isAdmin:   true
            }
        });
    } catch (err) {
        console.error('Admin Login Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 4. GET MY PROFILE ---
router.get('/profile', auth, async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.user.id)
            .query(`
                SELECT UserID, FirstName, LastName, Email,
                       QRCodeImage, IsAdmin, IsApproved,
                       Bio, Course, Year, CampusArea,
                       DateCreated, PasswordChangedAt
                FROM Users
                WHERE UserID = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Profile Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 5. UPDATE MY PROFILE ---
router.put('/profile', auth, async (req, res) => {
    const { firstName, lastName, bio, course, year, campusArea } = req.body;

    if (!firstName || !lastName) {
        return res.status(400).json({ message: 'First name and last name are required.' });
    }

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id',          sql.Int,     req.user.id)
            .input('firstName',   sql.VarChar, firstName)
            .input('lastName',    sql.VarChar, lastName)
            .input('bio',         sql.NVarChar, bio         || null)
            .input('course',      sql.NVarChar, course      || null)
            .input('year',        sql.NVarChar, year        || null)
            .input('campusArea',  sql.NVarChar, campusArea  || null)
            .query(`
                UPDATE Users
                SET FirstName  = @firstName,
                    LastName   = @lastName,
                    Bio        = @bio,
                    Course     = @course,
                    Year       = @year,
                    CampusArea = @campusArea
                WHERE UserID = @id
            `);

        res.json({ message: 'Profile updated successfully!' });
    } catch (err) {
        console.error('Update Profile Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 6. UPLOAD / UPDATE QR CODE ---
router.post('/qr', auth, qrUpload.single('qrCode'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No QR code image uploaded.' });
    }

    const newQRUrl = `http://localhost:5000/uploads/qrcodes/${req.file.filename}`;

    try {
        const pool = await poolPromise;

        const old = await pool.request()
            .input('id', sql.Int, req.user.id)
            .query('SELECT QRCodeImage FROM Users WHERE UserID = @id');

        const oldQR = old.recordset[0]?.QRCodeImage;
        if (oldQR && oldQR.includes('/uploads/qrcodes/')) {
            const oldFilename = oldQR.split('/uploads/qrcodes/')[1];
            const oldPath     = path.join(qrDir, oldFilename);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        await pool.request()
            .input('id',    sql.Int,     req.user.id)
            .input('qrUrl', sql.VarChar, newQRUrl)
            .query('UPDATE Users SET QRCodeImage = @qrUrl WHERE UserID = @id');

        res.json({ message: 'QR code updated!', qrCodeImage: newQRUrl });
    } catch (err) {
        console.error('QR Upload Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 7. CHANGE PASSWORD ---
router.put('/change-password', auth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current and new password are required.' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.user.id)
            .query('SELECT Password FROM Users WHERE UserID = @id');

        const user = result.recordset[0];
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const isMatch = await bcrypt.compare(currentPassword, user.Password);
        if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect.' });

        const salt           = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await pool.request()
            .input('id',       sql.Int,     req.user.id)
            .input('password', sql.VarChar, hashedPassword)
            .query(`UPDATE Users SET Password = @password, PasswordChangedAt = GETDATE() WHERE UserID = @id`);

        res.json({ message: 'Password changed successfully!' });
    } catch (err) {
        console.error('Change Password Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 8. GET ANY USER'S PUBLIC PROFILE ---
router.get('/:id', async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`
                SELECT UserID, FirstName, LastName,
                       QRCodeImage, Bio, Course, Year, CampusArea, DateCreated
                FROM Users
                WHERE UserID = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Get User Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
