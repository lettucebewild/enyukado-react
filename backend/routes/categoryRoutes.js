const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../config/db');

// --- GET ALL CATEGORIES (Public) ---
// Used by the frontend to populate listing form dropdowns
router.get('/', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query('SELECT CategoryID, CategoryName FROM Categories ORDER BY CategoryName ASC');

        res.json(result.recordset);
    } catch (err) {
        console.error('Get Categories Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- GET SINGLE CATEGORY BY ID (Public) ---
router.get('/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query('SELECT CategoryID, CategoryName FROM Categories WHERE CategoryID = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Category not found.' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Get Category Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;