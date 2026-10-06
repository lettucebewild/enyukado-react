const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const auth    = require('../middleware/auth');
const { User, Product, Category, Transaction, SavedItem, NO_ID } = require('../models');
const { sendBotMessage } = require('../services/messaging');
const { toInt, indexBy, sendError } = require('../utils/helpers');

// ============================================================
// CONSTANTS
// ============================================================
const PICKUP_LOCATION = 'Student Affairs Office, Ground Floor, Building A';

// ============================================================
// MIDDLEWARE — admin guard
// Blocks any non-admin user from all admin routes
// ============================================================
function adminOnly(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ message: 'Unauthorized: Admin access required.' });
    }
    next();
}

// System notifications are sent FROM the Enyukado Bot account
const sendSystemMessage = sendBotMessage;
const productUploadsDir = path.join(__dirname, '..', 'uploads', 'products');

function deleteProductImageFiles(images, primaryImageURL) {
    const imageURLs = [...(images || []).map(image => image.ImageURL), primaryImageURL];
    for (const imageURL of new Set(imageURLs)) {
        if (!imageURL || !imageURL.includes('/uploads/products/')) continue;
        const filename = path.basename(imageURL.split('/uploads/products/')[1]);
        const filePath = path.join(productUploadsDir, filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
}

// ============================================================
// ROUTES — all require auth + adminOnly
// ============================================================

// -------------------------------------------------------
// SECTION A: ACCOUNT APPROVALS
// -------------------------------------------------------

// --- A1. GET ALL PENDING ACCOUNTS ---
// GET /api/admin/accounts/pending
router.get('/accounts/pending', auth, adminOnly, async (req, res) => {
    try {
        const users = await User.find(
            { IsApproved: false, IsAdmin: false },
            { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1, Email: 1, DateCreated: 1 }
        ).sort({ DateCreated: 1 }).lean();

        res.json(users);
    } catch (err) {
        sendError(res, 'Get Pending Accounts Error', err);
    }
});

// --- A1b. GET ALL STUDENT ACCOUNTS ---
// GET /api/admin/accounts/all
router.get('/accounts/all', auth, adminOnly, async (req, res) => {
    try {
        const users = await User.find(
            { IsAdmin: { $ne: true } },
            { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1, Email: 1, IsApproved: 1, DateCreated: 1 }
        ).sort({ DateCreated: -1 }).lean();

        res.json(users);
    } catch (err) {
        sendError(res, 'Get All Accounts Error', err);
    }
});

// --- A1c. GET STUDENT ACCOUNT DETAILS ---
// GET /api/admin/accounts/:id/details
router.get('/accounts/:id/details', auth, adminOnly, async (req, res) => {
    const userID = toInt(req.params.id);
    if (userID === null) return res.status(400).json({ message: 'Invalid account ID.' });

    try {
        const account = await User.findOne(
            { UserID: userID, IsAdmin: { $ne: true } },
            { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1, Email: 1, PhoneNumber: 1,
              IsApproved: 1, DateCreated: 1, ProfileImage: 1, Bio: 1, Course: 1, Year: 1, CampusArea: 1 }
        ).lean();
        if (!account) return res.status(404).json({ message: 'Student account not found.' });

        const [listings, transactions] = await Promise.all([
            Product.find(
                { UserID: userID },
                { ...NO_ID, ProductID: 1, ProductName: 1, Price: 1, ProductCondition: 1,
                  Quantity: 1, Status: 1, DatePosted: 1, ImageURL: 1, CategoryID: 1 }
            ).sort({ DatePosted: -1 }).lean(),
            Transaction.find(
                { BuyerID: userID },
                { ...NO_ID, TransactionID: 1, ProductID: 1, SellerID: 1, Status: 1, TransactionDate: 1 }
            ).sort({ TransactionDate: -1 }).lean()
        ]);

        const [purchasedProducts, categories, sellers] = await Promise.all([
            Product.find(
                { ProductID: { $in: transactions.map((transaction) => transaction.ProductID) } },
                { ...NO_ID, ProductID: 1, ProductName: 1, Price: 1, ImageURL: 1, CategoryID: 1 }
            ).lean(),
            Category.find(
                { CategoryID: { $in: [...listings, ...transactions].map((item) => item.CategoryID).filter(Boolean) } },
                { ...NO_ID, CategoryID: 1, CategoryName: 1 }
            ).lean(),
            User.find(
                { UserID: { $in: transactions.map((transaction) => transaction.SellerID) } },
                { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1 }
            ).lean()
        ]);

        const productMap = indexBy(purchasedProducts, 'ProductID');
        const categoryMap = indexBy(categories, 'CategoryID');
        const sellerMap = indexBy(sellers, 'UserID');

        res.json({
            account,
            listings: listings.map((product) => ({
                ...product,
                CategoryName: categoryMap.get(product.CategoryID)?.CategoryName ?? null
            })),
            purchases: transactions.map((transaction) => {
                const product = productMap.get(transaction.ProductID);
                const seller = sellerMap.get(transaction.SellerID);
                return {
                    TransactionID: transaction.TransactionID,
                    Status: transaction.Status,
                    TransactionDate: transaction.TransactionDate,
                    ProductID: transaction.ProductID,
                    ProductName: product?.ProductName ?? 'Listing no longer available',
                    Price: product?.Price ?? null,
                    ImageURL: product?.ImageURL ?? null,
                    CategoryName: product ? categoryMap.get(product.CategoryID)?.CategoryName ?? null : null,
                    SellerName: seller ? `${seller.FirstName} ${seller.LastName}` : 'Unknown seller'
                };
            })
        });
    } catch (err) {
        sendError(res, 'Get Account Details Error', err);
    }
});

// --- A2. APPROVE AN ACCOUNT ---
// PATCH /api/admin/accounts/:id/approve
router.patch('/accounts/:id/approve', auth, adminOnly, async (req, res) => {
    const userID = toInt(req.params.id);

    try {
        const user = userID === null ? null
            : await User.findOne({ UserID: userID }, { UserID: 1, FirstName: 1, IsApproved: 1 }).lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (user.IsApproved) {
            return res.status(400).json({ message: 'Account is already approved.' });
        }

        await User.updateOne({ UserID: userID }, { $set: { IsApproved: true } });

        res.json({ message: `Account for ${user.FirstName} approved successfully.` });
    } catch (err) {
        sendError(res, 'Approve Account Error', err);
    }
});

// --- A3. REJECT AN ACCOUNT ---
// PATCH /api/admin/accounts/:id/reject
// Body: { reason (optional) }
// Account is deleted since they can't log in to see a message
router.patch('/accounts/:id/reject', auth, adminOnly, async (req, res) => {
    const userID = toInt(req.params.id);

    try {
        const user = userID === null ? null
            : await User.findOne({ UserID: userID }, { UserID: 1, FirstName: 1, IsApproved: 1 }).lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (user.IsApproved) {
            return res.status(400).json({ message: 'Cannot reject an already approved account.' });
        }

        // Delete the account — they can't log in to receive a message anyway
        await User.deleteOne({ UserID: userID });

        res.json({ message: `Account rejected and removed.` });
    } catch (err) {
        sendError(res, 'Reject Account Error', err);
    }
});

// -------------------------------------------------------
// SECTION B: LISTING APPROVALS
// -------------------------------------------------------

// --- B0. GET ALL LISTINGS ---
// GET /api/admin/listings/all
router.get('/listings/all', auth, adminOnly, async (req, res) => {
    try {
        const products = await Product.find({}, NO_ID).sort({ DatePosted: -1 }).lean();
        const [categories, sellers] = await Promise.all([
            Category.find({ CategoryID: { $in: products.map(p => p.CategoryID) } }, NO_ID).lean(),
            User.find({ UserID: { $in: products.map(p => p.UserID) } },
                { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1, Email: 1 }).lean()
        ]);
        const categoryMap = indexBy(categories, 'CategoryID');
        const sellerMap = indexBy(sellers, 'UserID');

        res.json(products.map(p => {
            const seller = sellerMap.get(p.UserID);
            return {
                ProductID: p.ProductID,
                ProductName: p.ProductName,
                Price: p.Price,
                ProductCondition: p.ProductCondition,
                Description: p.Description,
                Quantity: p.Quantity,
                ImageURL: p.ImageURL,
                DatePosted: p.DatePosted,
                Status: p.Status,
                CategoryName: categoryMap.get(p.CategoryID)?.CategoryName ?? null,
                SellerID: seller?.UserID ?? p.UserID,
                SellerFirstName: seller?.FirstName ?? 'Unknown',
                SellerLastName: seller?.LastName ?? '',
                SellerEmail: seller?.Email ?? '',
                images: (p.images || []).slice().sort((a, b) => a.SortOrder - b.SortOrder)
            };
        }));
    } catch (err) {
        sendError(res, 'Get All Listings Error', err);
    }
});

// --- B1. GET ALL PENDING LISTINGS ---
// GET /api/admin/listings/pending
router.get('/listings/pending', auth, adminOnly, async (req, res) => {
    try {
        const products = await Product.find({ Status: 'Pending Approval' }, NO_ID)
            .sort({ DatePosted: 1 })
            .lean();

        const [categories, sellers] = await Promise.all([
            Category.find({ CategoryID: { $in: products.map(p => p.CategoryID) } }, NO_ID).lean(),
            User.find({ UserID: { $in: products.map(p => p.UserID) } },
                { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1, Email: 1 }).lean()
        ]);
        const categoryMap = indexBy(categories, 'CategoryID');
        const sellerMap   = indexBy(sellers, 'UserID');

        // INNER JOIN semantics: skip listings whose category or seller no longer exists
        const rows = [];
        for (const p of products) {
            const c = categoryMap.get(p.CategoryID);
            const u = sellerMap.get(p.UserID);
            if (!c || !u) continue;
            rows.push({
                ProductID:        p.ProductID,
                ProductName:      p.ProductName,
                Price:            p.Price,
                ProductCondition: p.ProductCondition,
                Description:      p.Description,
                Quantity:         p.Quantity,
                ImageURL:         p.ImageURL,
                DatePosted:       p.DatePosted,
                CategoryName:     c.CategoryName,
                SellerID:         u.UserID,
                SellerFirstName:  u.FirstName,
                SellerLastName:   u.LastName,
                SellerEmail:      u.Email,
                images:           (p.images || []).slice().sort((a, b) => a.SortOrder - b.SortOrder)
            });
        }

        res.json(rows);
    } catch (err) {
        sendError(res, 'Get Pending Listings Error', err);
    }
});

// --- B2. APPROVE A LISTING ---
// PATCH /api/admin/listings/:id/approve
router.patch('/listings/:id/approve', auth, adminOnly, async (req, res) => {
    const productID = toInt(req.params.id);

    try {
        const product = productID === null ? null
            : await Product.findOne({ ProductID: productID }, { ProductID: 1, ProductName: 1, Status: 1, UserID: 1 }).lean();

        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }
        if (product.Status !== 'Pending Approval') {
            return res.status(400).json({ message: 'Listing is not pending approval.' });
        }

        await Product.updateOne({ ProductID: productID }, { $set: { Status: 'Available' } });

        // System message → seller
        await sendSystemMessage(
            product.UserID,
            null,
            `Your listing "${product.ProductName}" has been approved and is now live on the marketplace!`
        );

        res.json({ message: 'Listing approved and now live.' });
    } catch (err) {
        sendError(res, 'Approve Listing Error', err);
    }
});

// --- B3. REJECT A LISTING ---
// PATCH /api/admin/listings/:id/reject
// Body: { reason }
router.patch('/listings/:id/reject', auth, adminOnly, async (req, res) => {
    const productID = toInt(req.params.id);
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ message: 'A reason is required when rejecting a listing.' });
    }

    try {
        const product = productID === null ? null
            : await Product.findOne({ ProductID: productID }, { ProductID: 1, ProductName: 1, Status: 1, UserID: 1 }).lean();

        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }
        if (product.Status !== 'Pending Approval') {
            return res.status(400).json({ message: 'Listing is not pending approval.' });
        }

        // Delete the listing entirely on rejection (embedded images go with it)
        await Product.deleteOne({ ProductID: productID });
        await SavedItem.deleteMany({ ProductID: productID });

        // System message → seller with reason
        await sendSystemMessage(
            product.UserID,
            null,
            `Your listing "${product.ProductName}" was rejected. Reason: ${reason.trim()}`
        );

        res.json({ message: 'Listing rejected and removed. Seller has been notified.' });
    } catch (err) {
        sendError(res, 'Reject Listing Error', err);
    }
});

// --- B4. DELETE ANY LISTING ---
// DELETE /api/admin/listings/:id
router.delete('/listings/:id', auth, adminOnly, async (req, res) => {
    const productID = toInt(req.params.id);
    try {
        const product = productID === null ? null
            : await Product.findOne({ ProductID: productID }, { ProductID: 1, ImageURL: 1, images: 1 }).lean();
        if (!product) return res.status(404).json({ message: 'Product not found.' });

        const hasTransactions = await Transaction.exists({ ProductID: productID });
        if (hasTransactions) {
            return res.status(400).json({ message: 'This listing has purchase records and cannot be deleted.' });
        }

        deleteProductImageFiles(product.images, product.ImageURL);
        await Product.deleteOne({ ProductID: productID });
        await SavedItem.deleteMany({ ProductID: productID });
        res.json({ message: 'Listing deleted successfully.' });
    } catch (err) {
        sendError(res, 'Admin Delete Listing Error', err);
    }
});

// -------------------------------------------------------
// SECTION C: PAYMENT APPROVALS
// -------------------------------------------------------

// --- C1. GET ALL PENDING PAYMENTS ---
// GET /api/admin/payments/pending
router.get('/payments/pending', auth, adminOnly, async (req, res) => {
    try {
        const transactions = await Transaction.find({ Status: 'Pending' }, NO_ID)
            .sort({ TransactionDate: 1 })
            .lean();

        const [products, users] = await Promise.all([
            Product.find({ ProductID: { $in: transactions.map(t => t.ProductID) } }, NO_ID).lean(),
            User.find({ UserID: { $in: transactions.flatMap(t => [t.BuyerID, t.SellerID]) } },
                { ...NO_ID, UserID: 1, FirstName: 1, LastName: 1, Email: 1 }).lean()
        ]);
        const productMap = indexBy(products, 'ProductID');
        const userMap    = indexBy(users, 'UserID');

        const rows = [];
        for (const t of transactions) {
            const p      = productMap.get(t.ProductID);
            const buyer  = userMap.get(t.BuyerID);
            const seller = userMap.get(t.SellerID);
            if (!p || !buyer || !seller) continue;
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
                BuyerID:           buyer.UserID,
                BuyerFirstName:    buyer.FirstName,
                BuyerLastName:     buyer.LastName,
                BuyerEmail:        buyer.Email,
                SellerID:          seller.UserID,
                SellerFirstName:   seller.FirstName,
                SellerLastName:    seller.LastName
            });
        }

        res.json(rows);
    } catch (err) {
        sendError(res, 'Get Pending Payments Error', err);
    }
});

// --- C2. APPROVE A PAYMENT ---
// PATCH /api/admin/payments/:id/approve
// Flips transaction to 'Payment Approved'
// Flips product to 'Sold'
// Notifies both buyer and seller via system messages
router.patch('/payments/:id/approve', auth, adminOnly, async (req, res) => {
    const transactionID = toInt(req.params.id);

    try {
        const tx = transactionID === null ? null
            : await Transaction.findOne({ TransactionID: transactionID }).lean();
        const product = tx && await Product.findOne({ ProductID: tx.ProductID }, { ProductName: 1 }).lean();

        if (!tx || !product) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }
        if (tx.Status !== 'Pending') {
            return res.status(400).json({ message: 'Transaction is not pending payment approval.' });
        }

        // Flip transaction status (only if still Pending, so a double-click can't approve twice)
        const updated = await Transaction.updateOne(
            { TransactionID: transactionID, Status: 'Pending' },
            { $set: { Status: 'Payment Approved' } }
        );
        if (updated.modifiedCount === 0) {
            return res.status(400).json({ message: 'Transaction is not pending payment approval.' });
        }

        // Flip product to Sold
        await Product.updateOne({ ProductID: tx.ProductID }, { $set: { Status: 'Sold' } });

        // System notification → seller
        await sendSystemMessage(
            tx.SellerID, transactionID,
            `✅ Payment for "${product.ProductName}" has been confirmed by admin! Please drop it off at ${PICKUP_LOCATION} as soon as possible.`
        );

        // System notification → buyer
        await sendSystemMessage(
            tx.BuyerID, transactionID,
            `✅ Your payment for "${product.ProductName}" has been confirmed! The seller has been notified to drop it off at ${PICKUP_LOCATION}.`
        );

        res.json({ message: 'Payment approved. Both parties have been notified.' });
    } catch (err) {
        sendError(res, 'Approve Payment Error', err);
    }
});

// --- C3. REJECT A PAYMENT ---
// PATCH /api/admin/payments/:id/reject
// Body: { reason }
// Cancels the transaction, puts product back to Available
// Notifies buyer via system message
router.patch('/payments/:id/reject', auth, adminOnly, async (req, res) => {
    const transactionID = toInt(req.params.id);
    const { reason }    = req.body;

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ message: 'A reason is required when rejecting a payment.' });
    }

    try {
        const tx = transactionID === null ? null
            : await Transaction.findOne({ TransactionID: transactionID }).lean();
        const product = tx && await Product.findOne({ ProductID: tx.ProductID }, { ProductName: 1 }).lean();

        if (!tx || !product) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }
        if (tx.Status !== 'Pending') {
            return res.status(400).json({ message: 'Transaction is not pending payment approval.' });
        }

        // Cancel the transaction (only if still Pending)
        const updated = await Transaction.updateOne(
            { TransactionID: transactionID, Status: 'Pending' },
            { $set: { Status: 'Cancelled' } }
        );
        if (updated.modifiedCount === 0) {
            return res.status(400).json({ message: 'Transaction is not pending payment approval.' });
        }

        // Put product back to Available
        await Product.updateOne({ ProductID: tx.ProductID }, { $set: { Status: 'Available' } });

        // System message → buyer with reason
        await sendSystemMessage(
            tx.BuyerID, transactionID,
            `Your payment proof for "${product.ProductName}" was rejected. Reason: ${reason.trim()}. Please resubmit or contact contact.enyukado@gmail.com.`
        );

        // System message → seller
        await sendSystemMessage(
            tx.SellerID, transactionID,
            `The payment for "${product.ProductName}" was rejected by admin. The listing has been restored to available.`
        );

        res.json({ message: 'Payment rejected. Transaction cancelled. Product restored to available.' });
    } catch (err) {
        sendError(res, 'Reject Payment Error', err);
    }
});

// -------------------------------------------------------
// SECTION D: ADMIN OVERVIEW
// -------------------------------------------------------

// --- D1. GET PENDING COUNTS (for admin dashboard badges) ---
// GET /api/admin/counts
// Returns pending counts for all three approval sections
router.get('/counts', auth, adminOnly, async (req, res) => {
    try {
        const [pendingAccounts, totalAccounts, pendingListings, pendingPayments, totalListings] = await Promise.all([
            User.countDocuments({ IsApproved: false, IsAdmin: false }),
            User.countDocuments({ IsAdmin: { $ne: true } }),
            Product.countDocuments({ Status: 'Pending Approval' }),
            Transaction.countDocuments({ Status: 'Pending' }),
            Product.countDocuments({})
        ]);

        res.json({ pendingAccounts, totalAccounts, pendingListings, pendingPayments, totalListings });
    } catch (err) {
        sendError(res, 'Get Admin Counts Error', err);
    }
});

module.exports = router;
