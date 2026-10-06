const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const auth     = require('../middleware/auth');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { randomInt } = require('crypto');
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

const profilePhotoDir = path.join(__dirname, '..', 'uploads', 'profiles');
if (!fs.existsSync(profilePhotoDir)) fs.mkdirSync(profilePhotoDir, { recursive: true });

const profilePhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, profilePhotoDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `profile_${req.user.id}_${Date.now()}${ext}`);
    }
});

const profilePhotoUpload = multer({
    storage: profilePhotoStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Only image files are allowed for profile photos.'));
    }
});

// ============================================================
// HELPER
// ============================================================
function isValidStudentEmail(email) {
    return typeof email === 'string' && email.toLowerCase().endsWith(ALLOWED_DOMAIN);
}

const RESET_CODES = new Map();
const RESET_CODE_TTL_MS = 10 * 60 * 1000;

function getResetCodeEntry(email) {
    const key = String(email || '').trim().toLowerCase();
    const entry = RESET_CODES.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        RESET_CODES.delete(key);
        return null;
    }
    return entry;
}

function setResetCode(email, code) {
    RESET_CODES.set(String(email).trim().toLowerCase(), {
        code,
        expiresAt: Date.now() + RESET_CODE_TTL_MS
    });
}

function clearResetCode(email) {
    RESET_CODES.delete(String(email).trim().toLowerCase());
}

async function sendResetCodeEmail(email, code) {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if (!smtpHost || !smtpUser || !smtpPass) {
        const error = new Error('Email delivery is not configured.');
        error.code = 'EMAIL_NOT_CONFIGURED';
        throw error;
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || 'false') === 'true',
        auth: { user: smtpUser, pass: smtpPass }
    });
    await transporter.sendMail({
        from: process.env.SMTP_FROM || `Enyukado Admin <${smtpUser}>`,
        to: email,
        subject: 'Enyukado password reset verification code',
        text: `Your Enyukado password reset code is ${code}. It expires in 10 minutes.`
    });
}

// ============================================================
// ROUTES
// ============================================================

// --- 1. REGISTER ---
router.post('/register', async (req, res) => {
    const { firstName, lastName, email, phoneNumber, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: 'First name, last name, email, and password are required.' });
    }

    if (!isValidStudentEmail(email)) {
        return res.status(400).json({ message: `Only university emails are allowed (${ALLOWED_DOMAIN}).` });
    }

    if (!phoneNumber || !/^[0-9+\s()-]{10,15}$/.test(String(phoneNumber).trim())) {
        return res.status(400).json({ message: 'Please enter a valid phone number.' });
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
            UserID:      await nextId('UserID'),
            FirstName:   firstName,
            LastName:    lastName,
            Email:       cleanEmail,
            PhoneNumber: phoneNumber ? String(phoneNumber).trim() : null,
            ProfileImage: '/enyukado-default-avatar.svg',
            Password:    hashedPassword,
            WelcomePending: true,
            IsAdmin:     false,
            IsApproved:  false
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

        const welcomeUpdate = await User.updateOne(
            { _id: user._id, WelcomePending: true },
            { $set: { WelcomePending: false } }
        );
        const isFirstLogin = welcomeUpdate.modifiedCount === 1;

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
                profileImage: user.ProfileImage,
                qrCodeImage: user.QRCodeImage,
                isFirstLogin,
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
                            QRCodeImage: 1, ProfileImage: 1, IsAdmin: 1, IsApproved: 1,
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

// --- 7. UPLOAD / UPDATE PROFILE PHOTO ---
router.post('/photo', auth, profilePhotoUpload.single('profilePhoto'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No profile photo uploaded.' });

    const newPhotoUrl = `${BASE_URL}/uploads/profiles/${req.file.filename}`;
    try {
        const old = await User.findOne({ UserID: req.user.id }, { ProfileImage: 1 }).lean();
        await User.updateOne({ UserID: req.user.id }, { $set: { ProfileImage: newPhotoUrl } });
        const oldPhoto = old?.ProfileImage;
        if (oldPhoto && oldPhoto.includes('/uploads/profiles/')) {
            const oldFilename = path.basename(oldPhoto.split('/uploads/profiles/')[1]);
            const oldPath = path.join(profilePhotoDir, oldFilename);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        res.json({ message: 'Profile photo updated!', profileImage: newPhotoUrl });
    } catch (err) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        sendError(res, 'Profile Photo Upload Error', err);
    }
});

// --- 8. CHANGE PASSWORD ---
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

// --- 9. REQUEST PASSWORD RESET CODE ---
router.post('/forgot-password', async (req, res) => {
    const email = String(req.body.identifier ?? req.body.email ?? '').trim().toLowerCase();
    if (!isValidStudentEmail(email)) {
        return res.status(400).json({ message: `Only university emails are allowed (${ALLOWED_DOMAIN}).` });
    }

    try {
        const user = await User.findOne({ Email: email }).lean();
        if (!user) return res.status(404).json({ message: 'No account is registered with that email.' });

        const code = String(randomInt(100000, 1000000));
        try {
            await sendResetCodeEmail(user.Email, code);
        } catch (emailError) {
            if (emailError.code === 'EMAIL_NOT_CONFIGURED') {
                return res.status(503).json({ message: 'Email delivery is not configured. Add Gmail SMTP credentials to backend/.env.' });
            }
            console.error('[Password reset email] Delivery failed:', emailError.message);
            return res.status(502).json({ message: 'Could not send the verification code. Check the sender settings and try again.' });
        }

        setResetCode(user.Email, code);
        res.json({
            message: 'A verification code has been sent to your university email.',
            identifier: user.Email
        });
    } catch (err) {
        sendError(res, 'Forgot Password Error', err);
    }
});

// --- 10. VERIFY PASSWORD RESET CODE ---
router.post('/verify-reset-code', async (req, res) => {
    const email = String(req.body.identifier ?? req.body.email ?? '').trim().toLowerCase();
    const { code } = req.body;
    if (!isValidStudentEmail(email) || !code) {
        return res.status(400).json({ message: 'A valid university email and verification code are required.' });
    }

    const entry = getResetCodeEntry(email);
    if (!entry) return res.status(400).json({ message: 'No valid reset code was found. Request a new code.' });
    if (String(code).trim() !== entry.code) {
        return res.status(400).json({ message: 'The verification code is incorrect.' });
    }

    res.json({ message: 'Verification code confirmed.' });
});

// --- 11. RESET PASSWORD WITH VERIFIED CODE ---
router.put('/reset-password', async (req, res) => {
    const email = String(req.body.identifier ?? req.body.email ?? '').trim().toLowerCase();
    const { code, newPassword } = req.body;
    if (!isValidStudentEmail(email) || !code || !newPassword) {
        return res.status(400).json({ message: 'A valid university email, verification code, and new password are required.' });
    }

    const entry = getResetCodeEntry(email);
    if (!entry) return res.status(400).json({ message: 'Your reset session expired. Request a new code.' });
    if (String(code).trim() !== entry.code) {
        return res.status(400).json({ message: 'The verification code is incorrect.' });
    }

    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/;
    if (!strongPassword.test(newPassword)) {
        return res.status(400).json({
            message: 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.'
        });
    }

    try {
        const user = await User.findOne({ Email: email }).lean();
        if (!user) return res.status(404).json({ message: 'Account not found.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await User.updateOne(
            { _id: user._id },
            { $set: { Password: hashedPassword, PasswordChangedAt: new Date() } }
        );

        clearResetCode(email);
        res.json({ message: 'Password reset successfully.' });
    } catch (err) {
        sendError(res, 'Reset Password Error', err);
    }
});

// --- 12. GET ANY USER'S PUBLIC PROFILE ---
router.get('/:id', async (req, res) => {
    try {
        const id = toInt(req.params.id);
        if (id === null) return res.status(404).json({ message: 'User not found.' });

        const user = await User.findOne(
            { UserID: id },
            { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1,
              ProfileImage: 1, QRCodeImage: 1, Bio: 1, Course: 1, Year: 1, CampusArea: 1, DateCreated: 1 }
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
