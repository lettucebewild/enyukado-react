const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { poolPromise, sql } = require('../config/db');

// --- 1. GET MY SAVED ITEMS ---
router.get('/', auth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('userID', sql.Int, req.user.id)
            .query(`
                SELECT
                    s.SavedID,
                    s.DateSaved,
                    p.ProductID,
                    p.ProductName,
                    p.Price,
                    p.ImageURL,
                    p.ProductCondition,
                    p.Status,
                    p.Quantity,
                    p.sellerName,
                    c.CategoryName
                FROM SavedItems s
                JOIN Products  p ON s.ProductID  = p.ProductID
                JOIN Categories c ON p.CategoryID = c.CategoryID
                WHERE s.UserID = @userID
                ORDER BY s.DateSaved DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Get Saved Items Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 2. SAVE AN ITEM ---
router.post('/', auth, async (req, res) => {
    const { productID } = req.body;
    if (!productID) return res.status(400).json({ message: 'productID is required.' });

    try {
        const pool = await poolPromise;

        // Check already saved
        const existing = await pool.request()
            .input('userID',    sql.Int, req.user.id)
            .input('productID', sql.Int, productID)
            .query('SELECT SavedID FROM SavedItems WHERE UserID = @userID AND ProductID = @productID');

        if (existing.recordset.length > 0) {
            return res.status(400).json({ message: 'Item already saved.' });
        }

        await pool.request()
            .input('userID',    sql.Int, req.user.id)
            .input('productID', sql.Int, productID)
            .query('INSERT INTO SavedItems (UserID, ProductID) VALUES (@userID, @productID)');

        res.status(201).json({ message: 'Item saved!' });
    } catch (err) {
        console.error('Save Item Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 3. UNSAVE AN ITEM ---
router.delete('/:productID', auth, async (req, res) => {
    const productID = parseInt(req.params.productID);
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('userID',    sql.Int, req.user.id)
            .input('productID', sql.Int, productID)
            .query('DELETE FROM SavedItems WHERE UserID = @userID AND ProductID = @productID');

        res.json({ message: 'Item removed from saved.' });
    } catch (err) {
        console.error('Unsave Item Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 4. CHECK IF ITEM IS SAVED ---
router.get('/check/:productID', auth, async (req, res) => {
    const productID = parseInt(req.params.productID);
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('userID',    sql.Int, req.user.id)
            .input('productID', sql.Int, productID)
            .query('SELECT SavedID FROM SavedItems WHERE UserID = @userID AND ProductID = @productID');

        res.json({ saved: result.recordset.length > 0 });
    } catch (err) {
        console.error('Check Saved Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
