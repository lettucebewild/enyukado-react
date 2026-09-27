const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { poolPromise, sql } = require('../config/db');

// --- 1. SUBMIT A REVIEW (Private - Buyer only) ---
// Rules:
//   - Must have a Completed transaction with that seller
//   - Can only review once per transaction
//   - Rating must be between 1 and 5
router.post('/', auth, async (req, res) => {
    const { transactionID, rating, comment } = req.body;
    const reviewerID = req.user.id;

    if (!transactionID || !rating) {
        return res.status(400).json({ message: 'TransactionID and Rating are required.' });
    }

    if (rating < 1 || rating > 5 || !Number.isInteger(Number(rating))) {
        return res.status(400).json({ message: 'Rating must be a whole number between 1 and 5.' });
    }

    try {
        const pool = await poolPromise;

        // Verify the transaction exists, is Completed, and the reviewer is the buyer
        const txCheck = await pool.request()
            .input('transactionID', sql.Int, transactionID)
            .input('reviewerID',    sql.Int, reviewerID)
            .query(`
                SELECT TransactionID, BuyerID, SellerID, Status
                FROM Transactions
                WHERE TransactionID = @transactionID
            `);

        if (txCheck.recordset.length === 0) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        const transaction = txCheck.recordset[0];

        // Only the buyer can leave a review
        if (transaction.BuyerID !== reviewerID) {
            return res.status(403).json({ message: 'Only the buyer can leave a review.' });
        }

        // Transaction must be completed
        if (transaction.Status !== 'Completed') {
            return res.status(400).json({ message: 'You can only review after the transaction is completed.' });
        }

        // Check if a review already exists for this transaction
        const reviewCheck = await pool.request()
            .input('transactionID', sql.Int, transactionID)
            .query('SELECT ReviewID FROM Reviews WHERE TransactionID = @transactionID');

        if (reviewCheck.recordset.length > 0) {
            return res.status(400).json({ message: 'You have already reviewed this transaction.' });
        }

        // Insert the review
        const result = await pool.request()
            .input('transactionID', sql.Int,     transactionID)
            .input('reviewerID',    sql.Int,     reviewerID)
            .input('rating',        sql.Int,     Number(rating))
            .input('comment',       sql.VarChar, comment || null)
            .query(`
                INSERT INTO Reviews (TransactionID, ReviewerID, Rating, Comment)
                OUTPUT INSERTED.ReviewID
                VALUES (@transactionID, @reviewerID, @rating, @comment)
            `);

        const reviewID = result.recordset[0].ReviewID;
        res.status(201).json({ message: 'Review submitted successfully!', reviewId: reviewID });
    } catch (err) {
        console.error('Submit Review Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 2. GET REVIEWS FOR A USER (Public) ---
// Returns all reviews received by a specific seller
// Also returns their average rating
router.get('/user/:userID', async (req, res) => {
    const sellerID = parseInt(req.params.userID);

    try {
        const pool = await poolPromise;

        // Get all reviews where the reviewed user is the seller in the transaction
        const result = await pool.request()
            .input('sellerID', sql.Int, sellerID)
            .query(`
                SELECT 
                    r.ReviewID,
                    r.Rating,
                    r.Comment,
                    r.DateCreated,
                    u.FirstName AS ReviewerFirstName,
                    u.LastName  AS ReviewerLastName,
                    p.ProductName
                FROM Reviews r
                JOIN Transactions t ON r.TransactionID = t.TransactionID
                JOIN Users u        ON r.ReviewerID    = u.UserID
                JOIN Products p     ON t.ProductID     = p.ProductID
                WHERE t.SellerID = @sellerID
                ORDER BY r.DateCreated DESC
            `);

        // Calculate average rating
        const reviews = result.recordset;
        const avgRating = reviews.length > 0
            ? (reviews.reduce((sum, r) => sum + r.Rating, 0) / reviews.length).toFixed(1)
            : null;

        res.json({
            totalReviews: reviews.length,
            averageRating: avgRating,
            reviews
        });
    } catch (err) {
        console.error('Get Reviews Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 3. GET REVIEW BY TRANSACTION ID (Private) ---
// Used by frontend to check if buyer already reviewed a transaction
router.get('/transaction/:transactionID', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('transactionID', sql.Int, parseInt(req.params.transactionID))
            .input('reviewerID',    sql.Int, req.user.id)
            .query(`
                SELECT ReviewID, Rating, Comment, DateCreated
                FROM Reviews
                WHERE TransactionID = @transactionID
                AND   ReviewerID    = @reviewerID
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'No review found.' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Get Review by Transaction Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 4. GET SINGLE REVIEW BY ID (Public) ---
router.get('/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`
                SELECT 
                    r.ReviewID,
                    r.Rating,
                    r.Comment,
                    r.DateCreated,
                    u.FirstName AS ReviewerFirstName,
                    u.LastName  AS ReviewerLastName,
                    p.ProductName
                FROM Reviews r
                JOIN Transactions t ON r.TransactionID = t.TransactionID
                JOIN Users u        ON r.ReviewerID    = u.UserID
                JOIN Products p     ON t.ProductID     = p.ProductID
                WHERE r.ReviewID = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Review not found.' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Get Review Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 5. DELETE A REVIEW (Private - Reviewer only) ---
router.delete('/:id', auth, async (req, res) => {
    const reviewID = parseInt(req.params.id);
    const userID = req.user.id;

    try {
        const pool = await poolPromise;

        const check = await pool.request()
            .input('id', sql.Int, reviewID)
            .query('SELECT ReviewerID FROM Reviews WHERE ReviewID = @id');

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'Review not found.' });
        }
        if (check.recordset[0].ReviewerID !== userID) {
            return res.status(403).json({ message: 'Unauthorized: You did not write this review.' });
        }

        await pool.request()
            .input('id', sql.Int, reviewID)
            .query('DELETE FROM Reviews WHERE ReviewID = @id');

        res.json({ message: 'Review deleted successfully!' });
    } catch (err) {
        console.error('Delete Review Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
