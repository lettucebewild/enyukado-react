const express = require('express');
const router  = require('express').Router();
const auth    = require('../middleware/auth');
const { poolPromise, sql } = require('../config/db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ============================================================
// MULTER — product images saved to /uploads/products
// Accepts up to 5 images per listing (field name: productImages)
// ============================================================
const productImgDir = path.join(__dirname, '..', 'uploads', 'products');
if (!fs.existsSync(productImgDir)) fs.mkdirSync(productImgDir, { recursive: true });

const productImgStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, productImgDir),
    filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `product_${req.user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`);
    }
});

const productImgUpload = multer({
    storage: productImgStorage,
    limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB per file
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Only image files are allowed.'));
    }
});

// ============================================================
// HELPER — insert images into ProductImages table
// ============================================================
async function insertProductImages(pool, productID, files) {
    for (let i = 0; i < files.length; i++) {
        const imageURL = `http://localhost:5000/uploads/products/${files[i].filename}`;
        await pool.request()
            .input('productID', sql.Int,     productID)
            .input('imageURL',  sql.VarChar, imageURL)
            .input('sortOrder', sql.Int,     i) // 0 = primary/thumbnail
            .query(`
                INSERT INTO ProductImages (ProductID, ImageURL, SortOrder)
                VALUES (@productID, @imageURL, @sortOrder)
            `);
    }
}

// ============================================================
// HELPER — delete product image files from disk
// ============================================================
function deleteImageFile(imageURL) {
    if (imageURL && imageURL.includes('/uploads/products/')) {
        const filename = imageURL.split('/uploads/products/')[1];
        const filePath = path.join(productImgDir, filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
}

// ============================================================
// ROUTES
// ============================================================

// --- 1. GET ALL PRODUCTS (Public) ---
// Only shows 'Available' products by default (approved + not sold)
// Supports: ?search= ?category= ?condition= ?minPrice= ?maxPrice= ?sort=
// Each product includes its images array from ProductImages
router.get('/', async (req, res) => {
    const { search, category, condition, minPrice, maxPrice, sort } = req.query;

    try {
        const pool    = await poolPromise;
        const request = pool.request();

        let query = `
            SELECT p.*, c.CategoryName
            FROM Products p
            LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
            WHERE p.Status = 'Available'`;

        if (search) {
            request.input('search', sql.VarChar, `%${search}%`);
            query += ` AND (p.ProductName LIKE @search OR p.Description LIKE @search OR p.sellerName LIKE @search)`;
        }
        if (category) {
            request.input('category', sql.Int, parseInt(category));
            query += ` AND p.CategoryID = @category`;
        }
        if (condition) {
            request.input('condition', sql.VarChar, condition);
            query += ` AND p.ProductCondition = @condition`;
        }
        if (minPrice) {
            request.input('minPrice', sql.Decimal(10, 2), parseFloat(minPrice));
            query += ` AND p.Price >= @minPrice`;
        }
        if (maxPrice) {
            request.input('maxPrice', sql.Decimal(10, 2), parseFloat(maxPrice));
            query += ` AND p.Price <= @maxPrice`;
        }

        if (sort === 'price_asc')       query += ` ORDER BY p.Price ASC`;
        else if (sort === 'price_desc') query += ` ORDER BY p.Price DESC`;
        else if (sort === 'oldest')     query += ` ORDER BY p.DatePosted ASC`;
        else                            query += ` ORDER BY p.DatePosted DESC`; // default: newest

        const result = await request.query(query);
        const products = result.recordset;

        // Attach images array to each product
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
        console.error('Get Products Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 2. GET MY LISTINGS (Private) ---
// Returns all of the logged-in user's listings including pending ones
// Must be defined before /:id to avoid route conflict
router.get('/my/listings', auth, async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('UserID', sql.Int, req.user.id)
            .query(`
                SELECT p.*, c.CategoryName
                FROM Products p
                LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
                WHERE p.UserID = @UserID
                ORDER BY p.DatePosted DESC
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
        console.error('My Listings Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 3. GET SINGLE PRODUCT BY ID (Public) ---
// Returns product + seller QR code + all images
router.get('/:id', async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`
                SELECT p.*, u.QRCodeImage, u.FirstName AS SellerFirstName, u.LastName AS SellerLastName
                FROM Products p
                JOIN Users u ON p.UserID = u.UserID
                WHERE p.ProductID = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        const product = result.recordset[0];

        // Attach images
        const imgs = await pool.request()
            .input('productID', sql.Int, product.ProductID)
            .query(`
                SELECT ImageID, ImageURL, SortOrder
                FROM ProductImages
                WHERE ProductID = @productID
                ORDER BY SortOrder ASC
            `);
        product.images = imgs.recordset;

        res.json(product);
    } catch (err) {
        console.error('Get Product Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 4. ADD A NEW PRODUCT (Private) ---
// Required: productName, price, productCondition, categoryID
// Optional: description, quantity
// Images: 1–5 files via field name 'productImages'
// Status defaults to 'Pending Approval' — admin must approve before it shows
router.post('/add', auth, productImgUpload.array('productImages', 5), async (req, res) => {
    const { productName, price, description, productCondition, categoryID, quantity } = req.body;
    const files = req.files || [];

    if (!productName || !price || !productCondition || !categoryID) {
        // Clean up any uploaded files if validation fails
        files.forEach(f => deleteImageFile(`http://localhost:5000/uploads/products/${f.filename}`));
        return res.status(400).json({ message: 'ProductName, Price, ProductCondition, and CategoryID are required.' });
    }

    if (files.length === 0) {
        return res.status(400).json({ message: 'At least 1 product image is required.' });
    }

    if (files.length > 5) {
        files.forEach(f => deleteImageFile(`http://localhost:5000/uploads/products/${f.filename}`));
        return res.status(400).json({ message: 'Maximum 5 images allowed.' });
    }

    const userID = req.user.id;

    try {
        const pool = await poolPromise;

        // Get seller name from DB — never trust the client
        const userResult = await pool.request()
            .input('id', sql.Int, userID)
            .query('SELECT FirstName, LastName FROM Users WHERE UserID = @id');

        const user       = userResult.recordset[0];
        const sellerName = user ? `${user.FirstName} ${user.LastName}` : 'Unknown';

        // Primary image (first upload) stored on Products.ImageURL for backwards compat
        const primaryImageURL = `http://localhost:5000/uploads/products/${files[0].filename}`;

        const result = await pool.request()
            .input('userID',           sql.Int,           userID)
            .input('categoryID',       sql.Int,           parseInt(categoryID))
            .input('productName',      sql.VarChar,       productName)
            .input('description',      sql.VarChar,       description      || null)
            .input('price',            sql.Decimal(10, 2), parseFloat(price))
            .input('productCondition', sql.VarChar,       productCondition)
            .input('quantity',         sql.Int,           parseInt(quantity) || 1)
            .input('imageURL',         sql.VarChar,       primaryImageURL)
            .input('sellerName',       sql.VarChar,       sellerName)
            .query(`
                INSERT INTO Products
                    (UserID, CategoryID, ProductName, Description, Price,
                     ProductCondition, Quantity, ImageURL, Status, sellerName)
                OUTPUT INSERTED.ProductID
                VALUES
                    (@userID, @categoryID, @productName, @description, @price,
                     @productCondition, @quantity, @imageURL, 'Pending Approval', @sellerName)
            `);

        const newProductID = result.recordset[0].ProductID;

        // Insert all images into ProductImages table
        await insertProductImages(pool, newProductID, files);

        res.status(201).json({
            message:   'Listing submitted for admin approval!',
            productId: newProductID
        });
    } catch (err) {
        // Clean up uploaded files on DB error
        files.forEach(f => deleteImageFile(`http://localhost:5000/uploads/products/${f.filename}`));
        console.error('Add Product Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 5. EDIT A PRODUCT (Private - Owner only) ---
// Can replace images by uploading new ones (replaces ALL existing images)
// If no new images uploaded, existing images are kept
router.put('/:id', auth, productImgUpload.array('productImages', 5), async (req, res) => {
    const { productName, price, description, productCondition, categoryID, quantity } = req.body;
    const productId = parseInt(req.params.id);
    const userID    = req.user.id;
    const files     = req.files || [];

    if (!productName || !price || !productCondition || !categoryID) {
        files.forEach(f => deleteImageFile(`http://localhost:5000/uploads/products/${f.filename}`));
        return res.status(400).json({ message: 'ProductName, Price, ProductCondition, and CategoryID are required.' });
    }

    if (files.length > 5) {
        files.forEach(f => deleteImageFile(`http://localhost:5000/uploads/products/${f.filename}`));
        return res.status(400).json({ message: 'Maximum 5 images allowed.' });
    }

    try {
        const pool = await poolPromise;

        // Verify ownership
        const check = await pool.request()
            .input('id', sql.Int, productId)
            .query('SELECT UserID, ImageURL FROM Products WHERE ProductID = @id');

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'Product not found.' });
        }
        if (check.recordset[0].UserID !== userID) {
            files.forEach(f => deleteImageFile(`http://localhost:5000/uploads/products/${f.filename}`));
            return res.status(403).json({ message: 'Unauthorized: You do not own this listing.' });
        }

        let primaryImageURL = check.recordset[0].ImageURL;

        // If new images uploaded — delete old ones and replace
        if (files.length > 0) {
            // Get existing images from ProductImages
            const oldImgs = await pool.request()
                .input('productID', sql.Int, productId)
                .query('SELECT ImageURL FROM ProductImages WHERE ProductID = @productID');

            // Delete old files from disk
            oldImgs.recordset.forEach(img => deleteImageFile(img.ImageURL));

            // Delete old records from DB
            await pool.request()
                .input('productID', sql.Int, productId)
                .query('DELETE FROM ProductImages WHERE ProductID = @productID');

            // Insert new images
            await insertProductImages(pool, productId, files);

            primaryImageURL = `http://localhost:5000/uploads/products/${files[0].filename}`;
        }

        // Update product — editing resets status to Pending Approval
        await pool.request()
            .input('id',               sql.Int,            productId)
            .input('productName',      sql.VarChar,        productName)
            .input('price',            sql.Decimal(10, 2), parseFloat(price))
            .input('description',      sql.VarChar,        description      || null)
            .input('productCondition', sql.VarChar,        productCondition)
            .input('categoryID',       sql.Int,            parseInt(categoryID))
            .input('quantity',         sql.Int,            parseInt(quantity) || 1)
            .input('imageURL',         sql.VarChar,        primaryImageURL  || null)
            .query(`
                UPDATE Products
                SET ProductName      = @productName,
                    Price            = @price,
                    Description      = @description,
                    ProductCondition = @productCondition,
                    CategoryID       = @categoryID,
                    Quantity         = @quantity,
                    ImageURL         = @imageURL,
                    Status           = 'Pending Approval'
                WHERE ProductID = @id
            `);

        res.json({ message: 'Product updated! Re-submitted for admin approval.' });
    } catch (err) {
        files.forEach(f => deleteImageFile(`http://localhost:5000/uploads/products/${f.filename}`));
        console.error('Edit Product Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 6. DELETE A PRODUCT (Private - Owner only) ---
// Also deletes all associated images from disk and ProductImages table
router.delete('/:id', auth, async (req, res) => {
    const productId = parseInt(req.params.id);
    const userID    = req.user.id;

    try {
        const pool = await poolPromise;

        const check = await pool.request()
            .input('id', sql.Int, productId)
            .query('SELECT UserID FROM Products WHERE ProductID = @id');

        if (check.recordset.length === 0) {
            return res.status(404).json({ message: 'Product not found.' });
        }
        if (check.recordset[0].UserID !== userID) {
            return res.status(403).json({ message: 'Unauthorized: You do not own this listing.' });
        }

        // Delete image files from disk
        const imgs = await pool.request()
            .input('productID', sql.Int, productId)
            .query('SELECT ImageURL FROM ProductImages WHERE ProductID = @productID');

        imgs.recordset.forEach(img => deleteImageFile(img.ImageURL));

        // ProductImages rows deleted automatically via ON DELETE CASCADE
        await pool.request()
            .input('id', sql.Int, productId)
            .query('DELETE FROM Products WHERE ProductID = @id');

        res.json({ message: 'Product deleted successfully!' });
    } catch (err) {
        console.error('Delete Product Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
