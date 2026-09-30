const express = require('express');
const router = express.Router();
const { Category, NO_ID } = require('../models');
const { toInt, sendError } = require('../utils/helpers');

// --- GET ALL CATEGORIES (Public) ---
// Used by the frontend to populate listing form dropdowns
router.get('/', async (req, res) => {
    try {
        const categories = await Category
            .find({}, { ...NO_ID, CategoryID: 1, CategoryName: 1 })
            .sort({ CategoryName: 1 })
            .lean();

        res.json(categories);
    } catch (err) {
        sendError(res, 'Get Categories Error', err);
    }
});

// --- GET SINGLE CATEGORY BY ID (Public) ---
router.get('/:id', async (req, res) => {
    try {
        const id = toInt(req.params.id);
        if (id === null) return res.status(404).json({ message: 'Category not found.' });

        const category = await Category
            .findOne({ CategoryID: id }, { ...NO_ID, CategoryID: 1, CategoryName: 1 })
            .lean();

        if (!category) {
            return res.status(404).json({ message: 'Category not found.' });
        }

        res.json(category);
    } catch (err) {
        sendError(res, 'Get Category Error', err);
    }
});

module.exports = router;
