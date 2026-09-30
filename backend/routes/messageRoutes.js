const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { Message, User, Transaction, NO_ID } = require('../models');
const { createMessage, BOT_USER_ID } = require('../services/messaging');
const { BASE_URL, toInt, escapeRegex, indexBy, sendError } = require('../utils/helpers');

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
// ROUTES
// ============================================================

// --- 1. SEND A MESSAGE (text or image) ---
// POST /api/messages
// Body: { receiverID, content (optional if image), transactionID (optional) }
// File: messageImage (optional)
router.post('/', auth, msgImgUpload.single('messageImage'), async (req, res) => {
    const { receiverID, content, transactionID } = req.body;
    const senderID = req.user.id;
    const imageURL = req.file ? `${BASE_URL}/uploads/messages/${req.file.filename}` : null;

    if (!receiverID) {
        return res.status(400).json({ message: 'ReceiverID is required.' });
    }

    if (!content && !imageURL) {
        return res.status(400).json({ message: 'Message content or image is required.' });
    }

    const receiver = toInt(receiverID);
    if (receiver === null) {
        return res.status(404).json({ message: 'Receiver not found.' });
    }

    if (senderID === receiver) {
        return res.status(400).json({ message: 'You cannot message yourself.' });
    }

    try {
        const receiverExists = await User.exists({ UserID: receiver });
        if (!receiverExists) {
            return res.status(404).json({ message: 'Receiver not found.' });
        }

        let txID = null;
        if (transactionID) {
            txID = toInt(transactionID);
            const partOfTx = txID !== null && await Transaction.exists({
                TransactionID: txID,
                $or: [{ BuyerID: senderID }, { SellerID: senderID }]
            });
            if (!partOfTx) {
                return res.status(403).json({ message: 'You are not part of this transaction.' });
            }
        }

        const msg = await createMessage({
            senderID,
            receiverID:    receiver,
            transactionID: txID,
            content:       content ? content.trim() : null,
            imageURL
        });

        res.status(201).json({
            message:   'Message sent!',
            messageId: msg.MessageID,
            dateSent:  msg.DateSent
        });
    } catch (err) {
        sendError(res, 'Send Message Error', err);
    }
});

// --- 2. GET ALL CONVERSATIONS ---
// GET /api/messages/conversations
// One row per other user (bot included, pure system messages excluded),
// newest conversation first, with the last message and unread count.
router.get('/conversations', auth, async (req, res) => {
    const userID = req.user.id;
    try {
        // Everyone this user has exchanged (non-system) messages with
        const [sentTo, receivedFrom] = await Promise.all([
            Message.distinct('ReceiverID', { SenderID: userID }),
            Message.distinct('SenderID',   { ReceiverID: userID, SenderID: { $ne: null } })
        ]);
        const otherIDs = [...new Set([...sentTo, ...receivedFrom])];

        const others = await User.find(
            { UserID: { $in: otherIDs } },
            { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1 }
        ).lean();

        // Last message + unread count per conversation (indexed lookups)
        const rows = await Promise.all(others.map(async other => {
            const [last, unread] = await Promise.all([
                Message.findOne({
                    SenderID: { $ne: null },
                    $or: [
                        { SenderID: userID,       ReceiverID: other.UserID },
                        { SenderID: other.UserID, ReceiverID: userID }
                    ]
                }, NO_ID).sort({ DateSent: -1, MessageID: -1 }).lean(),
                Message.countDocuments({ SenderID: other.UserID, ReceiverID: userID, IsRead: false })
            ]);

            return {
                OtherUserID:     other.UserID,
                OtherFirstName:  other.FirstName,
                OtherLastName:   other.LastName,
                LastMessage:     last.Content,
                LastImageURL:    last.ImageURL,
                LastMessageDate: last.DateSent,
                LastSenderID:    last.SenderID,
                UnreadCount:     unread
            };
        }));

        rows.sort((a, b) => new Date(b.LastMessageDate) - new Date(a.LastMessageDate));
        res.json(rows);
    } catch (err) {
        sendError(res, 'Get Conversations Error', err);
    }
});

// --- 3. GET MESSAGE THREAD WITH A USER ---
// GET /api/messages/thread/:otherUserID
router.get('/thread/:otherUserID', auth, async (req, res) => {
    const userID      = req.user.id;
    const otherUserID = toInt(req.params.otherUserID);

    if (otherUserID === null || userID === otherUserID) {
        return res.status(400).json({ message: 'Invalid thread.' });
    }

    try {
        const messages = await Message.find({
            $or: [
                { SenderID: userID,      ReceiverID: otherUserID },
                { SenderID: otherUserID, ReceiverID: userID }
            ]
        }, NO_ID).sort({ DateSent: 1, MessageID: 1 }).lean();

        const senders = await User.find(
            { UserID: { $in: [userID, otherUserID] } },
            { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1 }
        ).lean();
        const senderMap = indexBy(senders, 'UserID');

        const thread = messages
            .filter(m => senderMap.has(m.SenderID))
            .map(m => {
                const s = senderMap.get(m.SenderID);
                return { ...m, SenderName: `${s.FirstName} ${s.LastName}` };
            });

        // Mark messages from other user as read (response above still shows the old IsRead)
        await Message.updateMany(
            { SenderID: otherUserID, ReceiverID: userID, IsRead: false },
            { $set: { IsRead: true } }
        );

        res.json(thread);
    } catch (err) {
        sendError(res, 'Get Thread Error', err);
    }
});

// --- 4. GET UNREAD COUNT ---
// GET /api/messages/unread
router.get('/unread', auth, async (req, res) => {
    try {
        const unreadCount = await Message.countDocuments({
            ReceiverID: req.user.id,
            IsRead:     false,
            SenderID:   { $ne: null }
        });
        res.json({ unreadCount });
    } catch (err) {
        sendError(res, 'Get Unread Error', err);
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
        const rx = new RegExp(escapeRegex(q.trim()), 'i');

        const users = await User.find({
            IsApproved: true,
            IsAdmin:    false,
            UserID:     { $nin: [req.user.id, BOT_USER_ID] },
            $or: [{ FirstName: rx }, { LastName: rx }, { Email: rx }]
        }, { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1, Course: 1, Year: 1, CampusArea: 1 })
            .sort({ FirstName: 1 })
            .limit(8)
            .lean();

        res.json(users);
    } catch (err) {
        sendError(res, 'Search Users Error', err);
    }
});

// --- 6. GET SYSTEM MESSAGES FOR A TRANSACTION ---
// GET /api/messages/system/:transactionID
router.get('/system/:transactionID', auth, async (req, res) => {
    const transactionID = toInt(req.params.transactionID);
    const userID        = req.user.id;
    try {
        const partOfTx = transactionID !== null && await Transaction.exists({
            TransactionID: transactionID,
            $or: [{ BuyerID: userID }, { SellerID: userID }]
        });

        if (!partOfTx) {
            return res.status(403).json({ message: 'Unauthorized.' });
        }

        const messages = await Message.find(
            { TransactionID: transactionID, ReceiverID: userID, SenderID: null },
            { ...NO_ID, MessageID: 1, Content: 1, DateSent: 1, IsRead: 1 }
        ).sort({ DateSent: 1, MessageID: 1 }).lean();

        res.json(messages);
    } catch (err) {
        sendError(res, 'Get System Messages Error', err);
    }
});

module.exports = router;
