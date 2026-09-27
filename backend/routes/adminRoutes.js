const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { poolPromise, sql } = require('../config/db');

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

// ============================================================
// CONSTANTS
// ============================================================
const BOT_USER_ID = 4; // Enyukado Bot account

// ============================================================
// HELPER — send a message FROM the Enyukado Bot
// ============================================================
async function sendSystemMessage(pool, receiverID, transactionID, content) {
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
// ROUTES — all require auth + adminOnly
// ============================================================

// -------------------------------------------------------
// SECTION A: ACCOUNT APPROVALS
// -------------------------------------------------------

// --- A1. GET ALL PENDING ACCOUNTS ---
// GET /api/admin/accounts/pending
router.get('/accounts/pending', auth, adminOnly, async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT UserID, FirstName, LastName, Email, DateCreated
                FROM Users
                WHERE IsApproved = 0
                AND   IsAdmin    = 0
                ORDER BY DateCreated ASC
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get Pending Accounts Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- A2. APPROVE AN ACCOUNT ---
// PATCH /api/admin/accounts/:id/approve
router.patch('/accounts/:id/approve', auth, adminOnly, async (req, res) => {
    const userID = parseInt(req.params.id);

    try {
        const pool  = await poolPromise;
        const check = await pool.request()
            .input('id', sql.Int, userID)
            .query('SELECT UserID, FirstName, IsApproved FROM Users WHERE UserID = @id');

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (check.recordset[0].IsApproved) {
            return res.status(400).json({ message: 'Account is already approved.' });
        }

        await pool.request()
            .input('id', sql.Int, userID)
            .query('UPDATE Users SET IsApproved = 1 WHERE UserID = @id');

        res.json({ message: `Account for ${check.recordset[0].FirstName} approved successfully.` });
    } catch (err) {
        console.error('Approve Account Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- A3. REJECT AN ACCOUNT ---
// PATCH /api/admin/accounts/:id/reject
// Body: { reason (optional) }
// Account is deleted since they can't log in to see a message
router.patch('/accounts/:id/reject', auth, adminOnly, async (req, res) => {
    const userID = parseInt(req.params.id);

    try {
        const pool  = await poolPromise;
        const check = await pool.request()
            .input('id', sql.Int, userID)
            .query('SELECT UserID, FirstName, IsApproved FROM Users WHERE UserID = @id');

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (check.recordset[0].IsApproved) {
            return res.status(400).json({ message: 'Cannot reject an already approved account.' });
        }

        // Delete the account — they can't log in to receive a message anyway
        await pool.request()
            .input('id', sql.Int, userID)
            .query('DELETE FROM Users WHERE UserID = @id');

        res.json({ message: `Account rejected and removed.` });
    } catch (err) {
        console.error('Reject Account Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------
// SECTION B: LISTING APPROVALS
// -------------------------------------------------------

// --- B1. GET ALL PENDING LISTINGS ---
// GET /api/admin/listings/pending
router.get('/listings/pending', auth, adminOnly, async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT
                    p.ProductID,
                    p.ProductName,
                    p.Price,
                    p.ProductCondition,
                    p.Description,
                    p.Quantity,
                    p.ImageURL,
                    p.DatePosted,
                    c.CategoryName,
                    u.UserID    AS SellerID,
                    u.FirstName AS SellerFirstName,
                    u.LastName  AS SellerLastName,
                    u.Email     AS SellerEmail
                FROM Products p
                JOIN Categories c ON p.CategoryID = c.CategoryID
                JOIN Users u      ON p.UserID      = u.UserID
                WHERE p.Status = 'Pending Approval'
                ORDER BY p.DatePosted ASC
            `);

        const products = result.recordset;

        // Attach images to each listing
        for (const product of products) {
            const imgs = await pool.request()
                .input('productID', sql.Int, product.ProductID)
                .query(`
                    SELECT ImageID, ImageURL, SortOrder
                    FROM ProductImages
                    WHERE ProductID = @productID
                    ORDER BY SortOrder ASC
                `);
            product.images = imgs.recordset;
        }

        res.json(products);
    } catch (err) {
        console.error('Get Pending Listings Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- B2. APPROVE A LISTING ---
// PATCH /api/admin/listings/:id/approve
router.patch('/listings/:id/approve', auth, adminOnly, async (req, res) => {
    const productID = parseInt(req.params.id);

    try {
        const pool  = await poolPromise;
        const check = await pool.request()
            .input('id', sql.Int, productID)
            .query(`
                SELECT p.ProductID, p.ProductName, p.Status, p.UserID
                FROM Products p
                WHERE p.ProductID = @id
            `);

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'Product not found.' });
        }
        if (check.recordset[0].Status !== 'Pending Approval') {
            return res.status(400).json({ message: 'Listing is not pending approval.' });
        }

        await pool.request()
            .input('id', sql.Int, productID)
            .query(`UPDATE Products SET Status = 'Available' WHERE ProductID = @id`);

        // System message → seller
        await sendSystemMessage(
            pool,
            check.recordset[0].UserID,
            null,
            `Your listing "${check.recordset[0].ProductName}" has been approved and is now live on the marketplace!`
        );

        res.json({ message: 'Listing approved and now live.' });
    } catch (err) {
        console.error('Approve Listing Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- B3. REJECT A LISTING ---
// PATCH /api/admin/listings/:id/reject
// Body: { reason }
router.patch('/listings/:id/reject', auth, adminOnly, async (req, res) => {
    const productID = parseInt(req.params.id);
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ message: 'A reason is required when rejecting a listing.' });
    }

    try {
        const pool  = await poolPromise;
        const check = await pool.request()
            .input('id', sql.Int, productID)
            .query(`
                SELECT p.ProductID, p.ProductName, p.Status, p.UserID
                FROM Products p
                WHERE p.ProductID = @id
            `);

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'Product not found.' });
        }
        if (check.recordset[0].Status !== 'Pending Approval') {
            return res.status(400).json({ message: 'Listing is not pending approval.' });
        }

        // Delete the listing entirely on rejection
        await pool.request()
            .input('id', sql.Int, productID)
            .query('DELETE FROM Products WHERE ProductID = @id');

        // System message → seller with reason
        await sendSystemMessage(
            pool,
            check.recordset[0].UserID,
            null,
            `Your listing "${check.recordset[0].ProductName}" was rejected. Reason: ${reason.trim()}`
        );

        res.json({ message: 'Listing rejected and removed. Seller has been notified.' });
    } catch (err) {
        console.error('Reject Listing Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------
// SECTION C: PAYMENT APPROVALS
// -------------------------------------------------------

// --- C1. GET ALL PENDING PAYMENTS ---
// GET /api/admin/payments/pending
router.get('/payments/pending', auth, adminOnly, async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
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
                    buyer.UserID    AS BuyerID,
                    buyer.FirstName AS BuyerFirstName,
                    buyer.LastName  AS BuyerLastName,
                    buyer.Email     AS BuyerEmail,
                    seller.UserID   AS SellerID,
                    seller.FirstName AS SellerFirstName,
                    seller.LastName  AS SellerLastName
                FROM Transactions t
                JOIN Products p      ON t.ProductID = p.ProductID
                JOIN Users buyer     ON t.BuyerID   = buyer.UserID
                JOIN Users seller    ON t.SellerID  = seller.UserID
                WHERE t.Status = 'Pending'
                ORDER BY t.TransactionDate ASC
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Get Pending Payments Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- C2. APPROVE A PAYMENT ---
// PATCH /api/admin/payments/:id/approve
// Flips transaction to 'Payment Approved'
// Flips product to 'Sold'
// Notifies both buyer and seller via system messages
router.patch('/payments/:id/approve', auth, adminOnly, async (req, res) => {
    const transactionID = parseInt(req.params.id);

    try {
        const pool  = await poolPromise;
        const check = await pool.request()
            .input('id', sql.Int, transactionID)
            .query(`
                SELECT
                    t.TransactionID, t.Status, t.BuyerID, t.SellerID, t.ProductID,
                    p.ProductName
                FROM Transactions t
                JOIN Products p ON t.ProductID = p.ProductID
                WHERE t.TransactionID = @id
            `);

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }
        if (check.recordset[0].Status !== 'Pending') {
            return res.status(400).json({ message: 'Transaction is not pending payment approval.' });
        }

        const tx = check.recordset[0];

        // Flip transaction status
        await pool.request()
            .input('id', sql.Int, transactionID)
            .query(`UPDATE Transactions SET Status = 'Payment Approved' WHERE TransactionID = @id`);

        // Flip product to Sold
        await pool.request()
            .input('productID', sql.Int, tx.ProductID)
            .query(`UPDATE Products SET Status = 'Sold' WHERE ProductID = @productID`);

        // System notification → seller
        await sendSystemMessage(
            pool, tx.SellerID, transactionID,
            `✅ Payment for "${tx.ProductName}" has been confirmed by admin! Please drop it off at ${PICKUP_LOCATION} as soon as possible.`
        );

        // System notification → buyer
        await sendSystemMessage(
            pool, tx.BuyerID, transactionID,
            `✅ Your payment for "${tx.ProductName}" has been confirmed! The seller has been notified to drop it off at ${PICKUP_LOCATION}.`
        );

        res.json({ message: 'Payment approved. Both parties have been notified.' });
    } catch (err) {
        console.error('Approve Payment Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- C3. REJECT A PAYMENT ---
// PATCH /api/admin/payments/:id/reject
// Body: { reason }
// Cancels the transaction, puts product back to Available
// Notifies buyer via system message
router.patch('/payments/:id/reject', auth, adminOnly, async (req, res) => {
    const transactionID = parseInt(req.params.id);
    const { reason }    = req.body;

    if (!reason || reason.trim() === '') {
        return res.status(400).json({ message: 'A reason is required when rejecting a payment.' });
    }

    try {
        const pool  = await poolPromise;
        const check = await pool.request()
            .input('id', sql.Int, transactionID)
            .query(`
                SELECT
                    t.TransactionID, t.Status, t.BuyerID, t.SellerID, t.ProductID,
                    p.ProductName
                FROM Transactions t
                JOIN Products p ON t.ProductID = p.ProductID
                WHERE t.TransactionID = @id
            `);

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }
        if (check.recordset[0].Status !== 'Pending') {
            return res.status(400).json({ message: 'Transaction is not pending payment approval.' });
        }

        const tx = check.recordset[0];

        // Cancel the transaction
        await pool.request()
            .input('id', sql.Int, transactionID)
            .query(`UPDATE Transactions SET Status = 'Cancelled' WHERE TransactionID = @id`);

        // Put product back to Available
        await pool.request()
            .input('productID', sql.Int, tx.ProductID)
            .query(`UPDATE Products SET Status = 'Available' WHERE ProductID = @productID`);

        // System message → buyer with reason
        await sendSystemMessage(
            pool, tx.BuyerID, transactionID,
            `Your payment proof for "${tx.ProductName}" was rejected. Reason: ${reason.trim()}. Please resubmit or contact contact.enyukado@gmail.com.`
        );

        // System message → seller
        await sendSystemMessage(
            pool, tx.SellerID, transactionID,
            `The payment for "${tx.ProductName}" was rejected by admin. The listing has been restored to available.`
        );

        res.json({ message: 'Payment rejected. Transaction cancelled. Product restored to available.' });
    } catch (err) {
        console.error('Reject Payment Error:', err.message);
        res.status(500).json({ error: err.message });
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
        const pool = await poolPromise;

        const accounts = await pool.request()
            .query(`SELECT COUNT(*) AS Count FROM Users WHERE IsApproved = 0 AND IsAdmin = 0`);

        const listings = await pool.request()
            .query(`SELECT COUNT(*) AS Count FROM Products WHERE Status = 'Pending Approval'`);

        const payments = await pool.request()
            .query(`SELECT COUNT(*) AS Count FROM Transactions WHERE Status = 'Pending'`);

        res.json({
            pendingAccounts: accounts.recordset[0].Count,
            pendingListings: listings.recordset[0].Count,
            pendingPayments: payments.recordset[0].Count
        });
    } catch (err) {
        console.error('Get Admin Counts Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
