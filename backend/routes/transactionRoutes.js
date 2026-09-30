const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { Transaction, Product, User, nextId, NO_ID } = require('../models');
const { sendBotMessage, sendAutoMessage } = require('../services/messaging');
const { BASE_URL, toInt, indexBy, sendError } = require('../utils/helpers');

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
// HELPER — load the products + users referenced by a list of transactions
// (replaces the SQL JOINs)
// ============================================================
async function loadRelated(transactions, userFields) {
    const productIDs = [...new Set(transactions.map(t => t.ProductID))];
    const userIDs    = [...new Set(transactions.flatMap(t => [t.BuyerID, t.SellerID]))];

    const [products, users] = await Promise.all([
        Product.find({ ProductID: { $in: productIDs } }, NO_ID).lean(),
        User.find({ UserID: { $in: userIDs } }, { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1, QRCodeImage: 1 }).lean()
    ]);

    return { productMap: indexBy(products, 'ProductID'), userMap: indexBy(users, 'UserID') };
}

// ============================================================
// ROUTES
// ============================================================

// --- 1. CREATE A TRANSACTION / BUY (Private - Buyer) ---
// Body: { productID, paymentMethod } + file: paymentProof
// PaymentMethod: 'E-Wallet' | 'Online Banking'
// Creates transaction as 'Pending', sends system messages to both parties
router.post('/', auth, proofUpload.single('paymentProof'), async (req, res) => {
    const { productID, paymentMethod } = req.body;
    const buyerID = req.user.id;

    if (!productID) {
        return res.status(400).json({ message: 'ProductID is required.' });
    }

    const validMethods = ['E-Wallet', 'Online Banking'];
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
        return res.status(400).json({ message: 'Payment method must be E-Wallet or Online Banking.' });
    }

    if (!req.file) {
        return res.status(400).json({ message: 'Payment proof image is required.' });
    }

    const paymentProofURL = `${BASE_URL}/uploads/payment-proofs/${req.file.filename}`;

    // Delete the just-uploaded proof if the purchase is rejected below
    const discardProof = () => {
        const f = path.join(proofDir, req.file.filename);
        if (fs.existsSync(f)) fs.unlinkSync(f);
    };

    try {
        const pid     = toInt(productID);
        const product = pid === null ? null
            : await Product.findOne({ ProductID: pid }, { ProductID: 1, UserID: 1, Status: 1, ProductName: 1, Price: 1 }).lean();

        if (!product) {
            discardProof();
            return res.status(404).json({ message: 'Product not found.' });
        }

        if (product.UserID === buyerID) {
            discardProof();
            return res.status(400).json({ message: 'You cannot buy your own product.' });
        }

        if (product.Status !== 'Available') {
            discardProof();
            return res.status(400).json({ message: 'This product is not available.' });
        }

        const sellerID      = product.UserID;
        const transactionID = await nextId('TransactionID');

        // Create transaction as Pending
        await Transaction.create({
            TransactionID:     transactionID,
            ProductID:         pid,
            BuyerID:           buyerID,
            SellerID:          sellerID,
            Status:            'Pending',
            PaymentMethod:     paymentMethod,
            PaymentProofImage: paymentProofURL
        });

        // Auto message FROM seller TO buyer — appears as a real conversation
        await sendAutoMessage(
            sellerID, buyerID, transactionID,
            `Hi! Thanks for purchasing "${product.ProductName}" 🎉 I'll prepare it for drop-off once your payment is confirmed. Feel free to message me if you have any questions!`
        );

        // System notification → seller (only seller sees this)
        await sendBotMessage(
            sellerID, transactionID,
            `📦 New purchase! "${product.ProductName}" has been bought. Please wait for admin to confirm the buyer's payment before dropping off.`
        );

        // System notification → buyer (only buyer sees this)
        await sendBotMessage(
            buyerID, transactionID,
            `🛍️ Your purchase of "${product.ProductName}" has been submitted! Waiting for admin to verify your payment proof.`
        );

        res.status(201).json({
            message:       'Purchase submitted! Awaiting admin payment confirmation.',
            transactionId: transactionID
        });
    } catch (err) {
        sendError(res, 'Create Transaction Error', err);
    }
});

// --- 2. GET MY PURCHASES (Private - Buyer) ---
router.get('/my/purchases', auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({ BuyerID: req.user.id }, NO_ID)
            .sort({ TransactionDate: -1 })
            .lean();

        const { productMap, userMap } = await loadRelated(transactions);

        const rows = [];
        for (const t of transactions) {
            const p = productMap.get(t.ProductID);
            const u = userMap.get(t.SellerID);
            if (!p || !u) continue;
            rows.push({
                TransactionID:     t.TransactionID,
                Status:            t.Status,
                TransactionDate:   t.TransactionDate,
                PaymentMethod:     t.PaymentMethod,
                PaymentProofImage: t.PaymentProofImage,
                ProductID:         p.ProductID,
                ProductName:       p.ProductName,
                Price:             p.Price,
                ImageURL:          p.ImageURL,
                ProductCondition:  p.ProductCondition,
                SellerFirstName:   u.FirstName,
                SellerLastName:    u.LastName,
                SellerID:          u.UserID
            });
        }

        res.json(rows);
    } catch (err) {
        sendError(res, 'Get Purchases Error', err);
    }
});

// --- 3. GET MY SALES (Private - Seller) ---
router.get('/my/sales', auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({ SellerID: req.user.id }, NO_ID)
            .sort({ TransactionDate: -1 })
            .lean();

        const { productMap, userMap } = await loadRelated(transactions);

        const rows = [];
        for (const t of transactions) {
            const p = productMap.get(t.ProductID);
            const u = userMap.get(t.BuyerID);
            if (!p || !u) continue;
            rows.push({
                TransactionID:     t.TransactionID,
                Status:            t.Status,
                TransactionDate:   t.TransactionDate,
                PaymentMethod:     t.PaymentMethod,
                PaymentProofImage: t.PaymentProofImage,
                ProductID:         p.ProductID,
                ProductName:       p.ProductName,
                Price:             p.Price,
                ImageURL:          p.ImageURL,
                ProductCondition:  p.ProductCondition,
                BuyerFirstName:    u.FirstName,
                BuyerLastName:     u.LastName,
                BuyerID:           u.UserID
            });
        }

        res.json(rows);
    } catch (err) {
        sendError(res, 'Get Sales Error', err);
    }
});

// --- 4. GET SINGLE TRANSACTION BY ID (Private) ---
// Only buyer or seller of that transaction can view it
router.get('/:id', auth, async (req, res) => {
    const transactionID = toInt(req.params.id);
    const userID        = req.user.id;

    try {
        const t = transactionID === null ? null
            : await Transaction.findOne({ TransactionID: transactionID }, NO_ID).lean();
        if (!t) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        const { productMap, userMap } = await loadRelated([t]);
        const p      = productMap.get(t.ProductID);
        const buyer  = userMap.get(t.BuyerID);
        const seller = userMap.get(t.SellerID);

        if (!p || !buyer || !seller) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        if (t.BuyerID !== userID && t.SellerID !== userID) {
            return res.status(403).json({ message: 'Unauthorized.' });
        }

        res.json({
            TransactionID:     t.TransactionID,
            BuyerID:           t.BuyerID,
            SellerID:          t.SellerID,
            Status:            t.Status,
            TransactionDate:   t.TransactionDate,
            PaymentMethod:     t.PaymentMethod,
            PaymentProofImage: t.PaymentProofImage,
            ProductID:         p.ProductID,
            ProductName:       p.ProductName,
            Price:             p.Price,
            ImageURL:          p.ImageURL,
            ProductCondition:  p.ProductCondition,
            BuyerFirstName:    buyer.FirstName,
            BuyerLastName:     buyer.LastName,
            SellerFirstName:   seller.FirstName,
            SellerLastName:    seller.LastName,
            SellerQRCode:      seller.QRCodeImage
        });
    } catch (err) {
        sendError(res, 'Get Transaction Error', err);
    }
});

// --- 5. MARK AS DROPPED OFF (Private - Seller only) ---
// Seller confirms they've dropped the item off at the pickup location
// Triggers system message to buyer
router.patch('/:id/dropoff', auth, async (req, res) => {
    const transactionID = toInt(req.params.id);
    const userID        = req.user.id;

    try {
        const tx = transactionID === null ? null
            : await Transaction.findOne({ TransactionID: transactionID }).lean();
        const product = tx && await Product.findOne({ ProductID: tx.ProductID }, { ProductName: 1 }).lean();

        if (!tx || !product) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        if (tx.SellerID !== userID) {
            return res.status(403).json({ message: 'Unauthorized: Only the seller can mark this as dropped off.' });
        }

        if (tx.Status !== 'Payment Approved') {
            return res.status(400).json({ message: 'Transaction must be Payment Approved before marking as dropped off.' });
        }

        // Filtering on the old status makes this an atomic compare-and-set (no double drop-off)
        const updated = await Transaction.updateOne(
            { TransactionID: transactionID, Status: 'Payment Approved' },
            { $set: { Status: 'Dropped Off' } }
        );
        if (updated.modifiedCount === 0) {
            return res.status(400).json({ message: 'Transaction must be Payment Approved before marking as dropped off.' });
        }

        // Auto message FROM seller TO buyer — appears in conversation
        await sendAutoMessage(
            tx.SellerID, tx.BuyerID, transactionID,
            `Hi! I've just dropped off "${product.ProductName}" at the pickup location. You can now collect it! 📦`
        );

        // System notification → buyer only
        await sendBotMessage(
            tx.BuyerID, transactionID,
            `✅ Your item "${product.ProductName}" is ready for pickup at ${PICKUP_LOCATION}! Please bring your student ID.`
        );

        // System notification → seller only
        await sendBotMessage(
            tx.SellerID, transactionID,
            `📍 Item marked as dropped off at ${PICKUP_LOCATION}. Waiting for buyer to confirm pickup.`
        );

        res.json({ message: 'Item marked as dropped off. Buyer has been notified.' });
    } catch (err) {
        sendError(res, 'Dropoff Error', err);
    }
});

// --- 6. CONFIRM PICKUP / COMPLETE (Private - Buyer only) ---
// Buyer confirms they've picked up the item
// Triggers system messages to both parties
router.patch('/:id/complete', auth, async (req, res) => {
    const transactionID = toInt(req.params.id);
    const userID        = req.user.id;

    try {
        const tx = transactionID === null ? null
            : await Transaction.findOne({ TransactionID: transactionID }).lean();
        const product = tx && await Product.findOne({ ProductID: tx.ProductID }, { ProductName: 1 }).lean();

        if (!tx || !product) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        if (tx.BuyerID !== userID) {
            return res.status(403).json({ message: 'Unauthorized: Only the buyer can confirm pickup.' });
        }

        if (tx.Status !== 'Dropped Off') {
            return res.status(400).json({ message: 'Item must be dropped off before confirming pickup.' });
        }

        const updated = await Transaction.updateOne(
            { TransactionID: transactionID, Status: 'Dropped Off' },
            { $set: { Status: 'Completed' } }
        );
        if (updated.modifiedCount === 0) {
            return res.status(400).json({ message: 'Item must be dropped off before confirming pickup.' });
        }

        // Auto message FROM buyer TO seller — appears in conversation
        await sendAutoMessage(
            tx.BuyerID, tx.SellerID, transactionID,
            `Hi! I've picked up "${product.ProductName}". Thanks so much! 🙌`
        );

        // System notification → buyer
        await sendBotMessage(
            tx.BuyerID, transactionID,
            `🎉 Transaction complete! Enjoy your "${product.ProductName}". You can now leave a review for the seller.`
        );

        // System notification → seller
        await sendBotMessage(
            tx.SellerID, transactionID,
            `✅ "${product.ProductName}" has been picked up by the buyer. Transaction is now complete! Well done 🎊`
        );

        res.json({ message: 'Pickup confirmed! Transaction is now complete.' });
    } catch (err) {
        sendError(res, 'Complete Transaction Error', err);
    }
});

module.exports = router;
