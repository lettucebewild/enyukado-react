const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const auth     = require('../middleware/auth');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { User, nextId, NO_ID } = require('../models');
const { BASE_URL, toInt, sendError } = require('../utils/helpers');

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
        const cleanEmail = email.toLowerCase().trim();

        const exists = await User.exists({ Email: cleanEmail });
        if (exists) {
            return res.status(400).json({ message: 'Email already registered.' });
        }

        const salt           = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await User.create({
            UserID:     await nextId('UserID'),
            FirstName:  firstName,
            LastName:   lastName,
            Email:      cleanEmail,
            Password:   hashedPassword,
            IsAdmin:    false,
            IsApproved: false
        });

        res.status(201).json({
            message: 'Registration submitted! Your account is pending admin approval.'
        });
    } catch (err) {
        // Unique index on Email — two simultaneous sign-ups with the same address
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Email already registered.' });
        }
        sendError(res, 'Register Error', err);
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
        const user = await User.findOne({ Email: email.toLowerCase().trim() }).lean();
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
        sendError(res, 'Login Error', err);
    }
});

// --- 3. ADMIN LOGIN ---
router.post('/admin-login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const user = await User.findOne({ Email: email.toLowerCase().trim() }).lean();
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
        sendError(res, 'Admin Login Error', err);
    }
});

// --- 4. GET MY PROFILE ---
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findOne(
            { UserID: req.user.id },
            { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1, Email: 1,
              QRCodeImage: 1, IsAdmin: 1, IsApproved: 1,
              Bio: 1, Course: 1, Year: 1, CampusArea: 1,
              DateCreated: 1, PasswordChangedAt: 1 }
        ).lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json(user);
    } catch (err) {
        sendError(res, 'Profile Error', err);
    }
});

// --- 5. UPDATE MY PROFILE ---
router.put('/profile', auth, async (req, res) => {
    const { firstName, lastName, bio, course, year, campusArea } = req.body;

    if (!firstName || !lastName) {
        return res.status(400).json({ message: 'First name and last name are required.' });
    }

    try {
        await User.updateOne(
            { UserID: req.user.id },
            { $set: {
                FirstName:  firstName,
                LastName:   lastName,
                Bio:        bio        || null,
                Course:     course     || null,
                Year:       year       || null,
                CampusArea: campusArea || null
            } },
            { runValidators: true }
        );

        res.json({ message: 'Profile updated successfully!' });
    } catch (err) {
        sendError(res, 'Update Profile Error', err);
    }
});

// --- 6. UPLOAD / UPDATE QR CODE ---
router.post('/qr', auth, qrUpload.single('qrCode'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No QR code image uploaded.' });
    }

    const newQRUrl = `${BASE_URL}/uploads/qrcodes/${req.file.filename}`;

    try {
        const old   = await User.findOne({ UserID: req.user.id }, { QRCodeImage: 1 }).lean();
        const oldQR = old?.QRCodeImage;
        if (oldQR && oldQR.includes('/uploads/qrcodes/')) {
            const oldFilename = oldQR.split('/uploads/qrcodes/')[1];
            const oldPath     = path.join(qrDir, oldFilename);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        await User.updateOne({ UserID: req.user.id }, { $set: { QRCodeImage: newQRUrl } });

        res.json({ message: 'QR code updated!', qrCodeImage: newQRUrl });
    } catch (err) {
        sendError(res, 'QR Upload Error', err);
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
        const user = await User.findOne({ UserID: req.user.id }, { Password: 1 }).lean();
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const isMatch = await bcrypt.compare(currentPassword, user.Password);
        if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect.' });

        const salt           = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await User.updateOne(
            { UserID: req.user.id },
            { $set: { Password: hashedPassword, PasswordChangedAt: new Date() } }
        );

        res.json({ message: 'Password changed successfully!' });
    } catch (err) {
        sendError(res, 'Change Password Error', err);
    }
});

// --- 8. GET ANY USER'S PUBLIC PROFILE ---
router.get('/:id', async (req, res) => {
    try {
        const id = toInt(req.params.id);
        if (id === null) return res.status(404).json({ message: 'User not found.' });

        const user = await User.findOne(
            { UserID: id },
            { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1,
              QRCodeImage: 1, Bio: 1, Course: 1, Year: 1, CampusArea: 1, DateCreated: 1 }
        ).lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json(user);
    } catch (err) {
        sendError(res, 'Get User Error', err);
    }
});

module.exports = router;
