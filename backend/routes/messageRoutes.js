const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { poolPromise, sql } = require('../config/db');

// ============================================================
// MULTER — message image uploads
// ============================================================
const msgImgDir = path.join(__dirname, '..', 'uploads', 'messages');
if (!fs.existsSync(msgImgDir)) fs.mkdirSync(msgImgDir, { recursive: true });

const msgImgStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, msgImgDir),
    filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `msg_${req.user.id}_${Date.now()}${ext}`);
    }
});

const msgImgUpload = multer({
    storage: msgImgStorage,
    limits:  { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Only image files are allowed.'));
    }
});

// ============================================================
// HELPER — send a system message (NULL sender = system)
// ============================================================
async function sendSystemMessage(pool, receiverID, transactionID, content) {
    await pool.request()
        .input('receiverID',    sql.Int,      receiverID)
        .input('transactionID', sql.Int,      transactionID || null)
        .input('content',       sql.NVarChar, content)
        .query(`
            INSERT INTO Messages (SenderID, ReceiverID, TransactionID, Content, IsRead)
            VALUES (NULL, @receiverID, @transactionID, @content, 0)
        `);
}
module.exports.sendSystemMessage = sendSystemMessage;

// ============================================================
// ROUTES
// ============================================================

// --- 1. SEND A MESSAGE (text or image) ---
// POST /api/messages
// Body: { receiverID, content (optional if image), transactionID (optional) }
// File: messageImage (optional)
router.post('/', auth, msgImgUpload.single('messageImage'), async (req, res) => {
    const { receiverID, content, transactionID } = req.body;
    const senderID = req.user.id;
    const imageURL = req.file ? `http://localhost:5000/uploads/messages/${req.file.filename}` : null;

    if (!receiverID) {
        return res.status(400).json({ message: 'ReceiverID is required.' });
    }

    if (!content && !imageURL) {
        return res.status(400).json({ message: 'Message content or image is required.' });
    }

    if (senderID === parseInt(receiverID)) {
        return res.status(400).json({ message: 'You cannot message yourself.' });
    }

    try {
        const pool = await poolPromise;

        const userCheck = await pool.request()
            .input('id', sql.Int, parseInt(receiverID))
            .query('SELECT UserID FROM Users WHERE UserID = @id');

        if (userCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Receiver not found.' });
        }

        if (transactionID) {
            const txCheck = await pool.request()
                .input('transactionID', sql.Int, parseInt(transactionID))
                .input('userID',        sql.Int, senderID)
                .query(`
                    SELECT TransactionID FROM Transactions
                    WHERE TransactionID = @transactionID
                    AND (BuyerID = @userID OR SellerID = @userID)
                `);
            if (txCheck.recordset.length === 0) {
                return res.status(403).json({ message: 'You are not part of this transaction.' });
            }
        }

        const result = await pool.request()
            .input('senderID',      sql.Int,      senderID)
            .input('receiverID',    sql.Int,      parseInt(receiverID))
            .input('transactionID', sql.Int,      transactionID ? parseInt(transactionID) : null)
            .input('content',       sql.NVarChar, content ? content.trim() : null)
            .input('imageURL',      sql.VarChar,  imageURL)
            .query(`
                INSERT INTO Messages (SenderID, ReceiverID, TransactionID, Content, ImageURL, IsRead)
                OUTPUT INSERTED.MessageID, INSERTED.DateSent
                VALUES (@senderID, @receiverID, @transactionID, @content, @imageURL, 0)
            `);

        res.status(201).json({
            message:   'Message sent!',
            messageId: result.recordset[0].MessageID,
            dateSent:  result.recordset[0].DateSent
        });
    } catch (err) {
        console.error('Send Message Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 2. GET ALL CONVERSATIONS ---
// GET /api/messages/conversations
router.get('/conversations', auth, async (req, res) => {
    const userID = req.user.id;
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('userID', sql.Int, userID)
            .query(`
                SELECT
                    other.UserID       AS OtherUserID,
                    other.FirstName    AS OtherFirstName,
                    other.LastName     AS OtherLastName,
                    last_msg.Content   AS LastMessage,
                    last_msg.ImageURL  AS LastImageURL,
                    last_msg.DateSent  AS LastMessageDate,
                    last_msg.SenderID  AS LastSenderID,
                    unread.UnreadCount
                FROM (
                    SELECT DISTINCT
                        CASE
                            WHEN SenderID   = @userID THEN ReceiverID
                            WHEN ReceiverID = @userID THEN SenderID
                        END AS OtherUserID
                    FROM Messages
                    WHERE (SenderID = @userID OR ReceiverID = @userID)
                    AND SenderID IS NOT NULL
                ) convos
                JOIN Users other ON other.UserID = convos.OtherUserID
                OUTER APPLY (
                    SELECT TOP 1 Content, ImageURL, DateSent, SenderID
                    FROM Messages
                    WHERE (
                        (SenderID = @userID AND ReceiverID = convos.OtherUserID) OR
                        (SenderID = convos.OtherUserID AND ReceiverID = @userID)
                    )
                    AND SenderID IS NOT NULL
                    ORDER BY DateSent DESC
                ) last_msg
                OUTER APPLY (
                    SELECT COUNT(*) AS UnreadCount
                    FROM Messages
                    WHERE SenderID   = convos.OtherUserID
                    AND   ReceiverID = @userID
                    AND   IsRead     = 0
                    AND   SenderID IS NOT NULL
                ) unread
                ORDER BY last_msg.DateSent DESC
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get Conversations Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 3. GET MESSAGE THREAD WITH A USER ---
// GET /api/messages/thread/:otherUserID
router.get('/thread/:otherUserID', auth, async (req, res) => {
    const userID      = req.user.id;
    const otherUserID = parseInt(req.params.otherUserID);

    if (userID === otherUserID) {
        return res.status(400).json({ message: 'Invalid thread.' });
    }

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('userID',      sql.Int, userID)
            .input('otherUserID', sql.Int, otherUserID)
            .query(`
                SELECT
                    m.MessageID,
                    m.SenderID,
                    m.ReceiverID,
                    m.TransactionID,
                    m.Content,
                    m.ImageURL,
                    m.IsRead,
                    m.DateSent,
                    sender.FirstName + ' ' + sender.LastName AS SenderName
                FROM Messages m
                JOIN Users sender ON m.SenderID = sender.UserID
                WHERE (
                    (m.SenderID = @userID      AND m.ReceiverID = @otherUserID) OR
                    (m.SenderID = @otherUserID AND m.ReceiverID = @userID)
                )
                ORDER BY m.DateSent ASC
            `);

        // Mark messages from other user as read
        await pool.request()
            .input('userID',      sql.Int, userID)
            .input('otherUserID', sql.Int, otherUserID)
            .query(`
                UPDATE Messages
                SET IsRead = 1
                WHERE SenderID   = @otherUserID
                AND   ReceiverID = @userID
                AND   IsRead     = 0
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get Thread Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 4. GET UNREAD COUNT ---
// GET /api/messages/unread
router.get('/unread', auth, async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('userID', sql.Int, req.user.id)
            .query(`
                SELECT COUNT(*) AS UnreadCount
                FROM Messages
                WHERE ReceiverID = @userID
                AND   IsRead     = 0
                AND   SenderID IS NOT NULL
            `);
        res.json({ unreadCount: result.recordset[0].UnreadCount });
    } catch (err) {
        console.error('Get Unread Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 5. SEARCH USERS TO MESSAGE ---
// GET /api/messages/search?q=juan
router.get('/search', auth, async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
        return res.status(400).json({ message: 'Search query must be at least 2 characters.' });
    }
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('q',      sql.NVarChar, `%${q.trim()}%`)
            .input('userID', sql.Int,      req.user.id)
            .input('botID',  sql.Int,      4)
            .query(`
                SELECT TOP 8
                    UserID, FirstName, LastName, Course, Year, CampusArea
                FROM Users
                WHERE IsApproved = 1
                AND   IsAdmin    = 0
                AND   UserID    != @userID
                AND   UserID    != @botID
                AND   (FirstName LIKE @q OR LastName LIKE @q OR Email LIKE @q)
                ORDER BY FirstName ASC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Search Users Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 6. GET SYSTEM MESSAGES FOR A TRANSACTION ---
// GET /api/messages/system/:transactionID
router.get('/system/:transactionID', auth, async (req, res) => {
    const transactionID = parseInt(req.params.transactionID);
    const userID        = req.user.id;
    try {
        const pool = await poolPromise;

        const txCheck = await pool.request()
            .input('transactionID', sql.Int, transactionID)
            .input('userID',        sql.Int, userID)
            .query(`
                SELECT TransactionID FROM Transactions
                WHERE TransactionID = @transactionID
                AND (BuyerID = @userID OR SellerID = @userID)
            `);

        if (txCheck.recordset.length === 0) {
            return res.status(403).json({ message: 'Unauthorized.' });
        }

        const result = await pool.request()
            .input('transactionID', sql.Int, transactionID)
            .input('userID',        sql.Int, userID)
            .query(`
                SELECT MessageID, Content, DateSent, IsRead
                FROM Messages
                WHERE TransactionID = @transactionID
                AND   ReceiverID    = @userID
                AND   SenderID IS NULL
                ORDER BY DateSent ASC
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get System Messages Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
