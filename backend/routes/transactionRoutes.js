const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { poolPromise, sql } = require('../config/db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ============================================================
// CONSTANTS
// ============================================================
const PICKUP_LOCATION = 'Student Affairs Office, Ground Floor, Building A';

// ============================================================
// MULTER — payment proof images
// ============================================================
const proofDir = path.join(__dirname, '..', 'uploads', 'payment-proofs');
if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });

const proofStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, proofDir),
    filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `proof_${req.user.id}_${Date.now()}${ext}`);
    }
});

const proofUpload = multer({
    storage: proofStorage,
    limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Only image files are allowed for payment proof.'));
    }
});

// ============================================================
// CONSTANTS
// ============================================================
const BOT_USER_ID = 4; // Enyukado Bot account

// ============================================================
// HELPER — send a message FROM the Enyukado Bot
// Appears as a real conversation from the bot user
// ============================================================
async function sendBotMessage(pool, receiverID, transactionID, content) {
    await pool.request()
        .input('senderID',      sql.Int,      BOT_USER_ID)
        .input('receiverID',    sql.Int,      receiverID)
        .input('transactionID', sql.Int,      transactionID || null)
        .input('content',       sql.NVarChar, content)
        .query(`
            INSERT INTO Messages (SenderID, ReceiverID, TransactionID, Content, IsRead)
            VALUES (@senderID, @receiverID, @transactionID, @content, 0)
        `);
}

// ============================================================
// HELPER — send an automatic message ON BEHALF of a user
// ============================================================
async function sendAutoMessage(pool, senderID, receiverID, transactionID, content) {
    await pool.request()
        .input('senderID',      sql.Int,      senderID)
        .input('receiverID',    sql.Int,      receiverID)
        .input('transactionID', sql.Int,      transactionID)
        .input('content',       sql.NVarChar, content)
        .query(`
            INSERT INTO Messages (SenderID, ReceiverID, TransactionID, Content, IsRead)
            VALUES (@senderID, @receiverID, @transactionID, @content, 0)
        `);
}

// ============================================================
// ROUTES
// ============================================================

// --- 1. CREATE A TRANSACTION / BUY (Private - Buyer) ---
// Replaces the old cart checkout flow entirely
// Body: { productID, paymentMethod } + file: paymentProof
// PaymentMethod: 'GCash' | 'E-bank'
// Creates transaction as 'Pending', sends system messages to both parties
router.post('/', auth, proofUpload.single('paymentProof'), async (req, res) => {
    const { productID, paymentMethod } = req.body;
    const buyerID = req.user.id;

    if (!productID) {
        return res.status(400).json({ message: 'ProductID is required.' });
    }

    const validMethods = ['GCash', 'E-bank'];
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
        return res.status(400).json({ message: 'Payment method must be GCash or E-bank.' });
    }

    if (!req.file) {
        return res.status(400).json({ message: 'Payment proof image is required.' });
    }

    const paymentProofURL = `http://localhost:5000/uploads/payment-proofs/${req.file.filename}`;

    try {
        const pool = await poolPromise;

        // Check product exists and is available
        const productCheck = await pool.request()
            .input('productID', sql.Int, parseInt(productID))
            .query('SELECT ProductID, UserID, Status, ProductName, Price FROM Products WHERE ProductID = @productID');

        if (productCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        const product = productCheck.recordset[0];

        if (product.UserID === buyerID) {
            return res.status(400).json({ message: 'You cannot buy your own product.' });
        }

        if (product.Status !== 'Available') {
            return res.status(400).json({ message: 'This product is not available.' });
        }

        const sellerID = product.UserID;

        // Create transaction as Pending
        const result = await pool.request()
            .input('productID',        sql.Int,     parseInt(productID))
            .input('buyerID',          sql.Int,     buyerID)
            .input('sellerID',         sql.Int,     sellerID)
            .input('paymentMethod',    sql.VarChar, paymentMethod)
            .input('paymentProofImage', sql.VarChar, paymentProofURL)
            .query(`
                INSERT INTO Transactions
                    (ProductID, BuyerID, SellerID, Status, PaymentMethod, PaymentProofImage)
                OUTPUT INSERTED.TransactionID
                VALUES
                    (@productID, @buyerID, @sellerID, 'Pending', @paymentMethod, @paymentProofImage)
            `);

        const transactionID = result.recordset[0].TransactionID;

        // Auto message FROM seller TO buyer — appears as a real conversation
        // This makes Maria appear in Lyle's conversation list immediately
        await sendAutoMessage(
            pool, sellerID, buyerID, transactionID,
            `Hi! Thanks for purchasing "${product.ProductName}" 🎉 I'll prepare it for drop-off once your payment is confirmed. Feel free to message me if you have any questions!`
        );

        // System notification → seller (only seller sees this)
        await sendBotMessage(
            pool, sellerID, transactionID,
            `📦 New purchase! "${product.ProductName}" has been bought. Please wait for admin to confirm the buyer's payment before dropping off.`
        );

        // System notification → buyer (only buyer sees this)
        await sendBotMessage(
            pool, buyerID, transactionID,
            `🛍️ Your purchase of "${product.ProductName}" has been submitted! Waiting for admin to verify your payment proof.`
        );

        res.status(201).json({
            message:       'Purchase submitted! Awaiting admin payment confirmation.',
            transactionId: transactionID
        });
    } catch (err) {
        console.error('Create Transaction Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 2. GET MY PURCHASES (Private - Buyer) ---
router.get('/my/purchases', auth, async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('buyerID', sql.Int, req.user.id)
            .query(`
                SELECT
                    t.TransactionID,
                    t.Status,
                    t.TransactionDate,
                    t.PaymentMethod,
                    t.PaymentProofImage,
                    p.ProductID,
                    p.ProductName,
                    p.Price,
                    p.ImageURL,
                    p.ProductCondition,
                    u.FirstName AS SellerFirstName,
                    u.LastName  AS SellerLastName,
                    u.UserID    AS SellerID
                FROM Transactions t
                JOIN Products p ON t.ProductID = p.ProductID
                JOIN Users u    ON t.SellerID  = u.UserID
                WHERE t.BuyerID = @buyerID
                ORDER BY t.TransactionDate DESC
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get Purchases Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 3. GET MY SALES (Private - Seller) ---
router.get('/my/sales', auth, async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('sellerID', sql.Int, req.user.id)
            .query(`
                SELECT
                    t.TransactionID,
                    t.Status,
                    t.TransactionDate,
                    t.PaymentMethod,
                    t.PaymentProofImage,
                    p.ProductID,
                    p.ProductName,
                    p.Price,
                    p.ImageURL,
                    p.ProductCondition,
                    u.FirstName AS BuyerFirstName,
                    u.LastName  AS BuyerLastName,
                    u.UserID    AS BuyerID
                FROM Transactions t
                JOIN Products p ON t.ProductID = p.ProductID
                JOIN Users u    ON t.BuyerID   = u.UserID
                WHERE t.SellerID = @sellerID
                ORDER BY t.TransactionDate DESC
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get Sales Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 4. GET SINGLE TRANSACTION BY ID (Private) ---
// Only buyer or seller of that transaction can view it
router.get('/:id', auth, async (req, res) => {
    const transactionID = parseInt(req.params.id);
    const userID        = req.user.id;

    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, transactionID)
            .query(`
                SELECT
                    t.TransactionID,
                    t.BuyerID,
                    t.SellerID,
                    t.Status,
                    t.TransactionDate,
                    t.PaymentMethod,
                    t.PaymentProofImage,
                    p.ProductID,
                    p.ProductName,
                    p.Price,
                    p.ImageURL,
                    p.ProductCondition,
                    buyer.FirstName  AS BuyerFirstName,
                    buyer.LastName   AS BuyerLastName,
                    seller.FirstName AS SellerFirstName,
                    seller.LastName  AS SellerLastName,
                    seller.QRCodeImage AS SellerQRCode
                FROM Transactions t
                JOIN Products p   ON t.ProductID = p.ProductID
                JOIN Users buyer  ON t.BuyerID   = buyer.UserID
                JOIN Users seller ON t.SellerID  = seller.UserID
                WHERE t.TransactionID = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        const transaction = result.recordset[0];

        if (transaction.BuyerID !== userID && transaction.SellerID !== userID) {
            return res.status(403).json({ message: 'Unauthorized.' });
        }

        res.json(transaction);
    } catch (err) {
        console.error('Get Transaction Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 5. MARK AS DROPPED OFF (Private - Seller only) ---
// Seller confirms they've dropped the item off at the pickup location
// Triggers system message to buyer
router.patch('/:id/dropoff', auth, async (req, res) => {
    const transactionID = parseInt(req.params.id);
    const userID        = req.user.id;

    try {
        const pool  = await poolPromise;
        const check = await pool.request()
            .input('id', sql.Int, transactionID)
            .query(`
                SELECT t.SellerID, t.BuyerID, t.Status, p.ProductName
                FROM Transactions t
                JOIN Products p ON t.ProductID = p.ProductID
                WHERE t.TransactionID = @id
            `);

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        const tx = check.recordset[0];

        if (tx.SellerID !== userID) {
            return res.status(403).json({ message: 'Unauthorized: Only the seller can mark this as dropped off.' });
        }

        if (tx.Status !== 'Payment Approved') {
            return res.status(400).json({ message: 'Transaction must be Payment Approved before marking as dropped off.' });
        }

        await pool.request()
            .input('id', sql.Int, transactionID)
            .query(`UPDATE Transactions SET Status = 'Dropped Off' WHERE TransactionID = @id`);

        // Auto message FROM seller TO buyer — appears in conversation
        await sendAutoMessage(
            pool, tx.SellerID, tx.BuyerID, transactionID,
            `Hi! I've just dropped off "${tx.ProductName}" at the pickup location. You can now collect it! 📦`
        );

        // System notification → buyer only
        await sendBotMessage(
            pool, tx.BuyerID, transactionID,
            `✅ Your item "${tx.ProductName}" is ready for pickup at ${PICKUP_LOCATION}! Please bring your student ID.`
        );

        // System notification → seller only
        await sendBotMessage(
            pool, tx.SellerID, transactionID,
            `📍 Item marked as dropped off at ${PICKUP_LOCATION}. Waiting for buyer to confirm pickup.`
        );

        res.json({ message: 'Item marked as dropped off. Buyer has been notified.' });
    } catch (err) {
        console.error('Dropoff Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 6. CONFIRM PICKUP / COMPLETE (Private - Buyer only) ---
// Buyer confirms they've picked up the item
// Triggers system messages to both parties
router.patch('/:id/complete', auth, async (req, res) => {
    const transactionID = parseInt(req.params.id);
    const userID        = req.user.id;

    try {
        const pool  = await poolPromise;
        const check = await pool.request()
            .input('id', sql.Int, transactionID)
            .query(`
                SELECT t.BuyerID, t.SellerID, t.Status, p.ProductName
                FROM Transactions t
                JOIN Products p ON t.ProductID = p.ProductID
                WHERE t.TransactionID = @id
            `);

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        const tx = check.recordset[0];

        if (tx.BuyerID !== userID) {
            return res.status(403).json({ message: 'Unauthorized: Only the buyer can confirm pickup.' });
        }

        if (tx.Status !== 'Dropped Off') {
            return res.status(400).json({ message: 'Item must be dropped off before confirming pickup.' });
        }

        await pool.request()
            .input('id', sql.Int, transactionID)
            .query(`UPDATE Transactions SET Status = 'Completed' WHERE TransactionID = @id`);

        // Auto message FROM buyer TO seller — appears in conversation
        await sendAutoMessage(
            pool, tx.BuyerID, tx.SellerID, transactionID,
            `Hi! I've picked up "${tx.ProductName}". Thanks so much! 🙌`
        );

        // System notification → buyer
        await sendBotMessage(
            pool, tx.BuyerID, transactionID,
            `🎉 Transaction complete! Enjoy your "${tx.ProductName}". You can now leave a review for the seller.`
        );

        // System notification → seller
        await sendBotMessage(
            pool, tx.SellerID, transactionID,
            `✅ "${tx.ProductName}" has been picked up by the buyer. Transaction is now complete! Well done 🎊`
        );

        res.json({ message: 'Pickup confirmed! Transaction is now complete.' });
    } catch (err) {
        console.error('Complete Transaction Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
