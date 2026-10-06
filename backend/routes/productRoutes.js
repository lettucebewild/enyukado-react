const router  = require('express').Router();
const auth    = require('../middleware/auth');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { Product, Category, User, SavedItem, Transaction, nextId, NO_ID } = require('../models');
const { BASE_URL, toInt, escapeRegex, indexBy, sendError } = require('../utils/helpers');

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
// HELPER — build the embedded `images` array for a product
// (replaces the old ProductImages table; SortOrder 0 = primary/thumbnail)
// ============================================================
async function buildImages(files) {
    const images = [];
    for (let i = 0; i < files.length; i++) {
        images.push({
            ImageID:   await nextId('ImageID'),
            ImageURL:  `${BASE_URL}/uploads/products/${files[i].filename}`,
            SortOrder: i
        });
    }
    return images;
}

// Images are stored inside the product doc; always return them sorted
function sortImages(product) {
    product.images = (product.images || []).slice().sort((a, b) => a.SortOrder - b.SortOrder);
    return product;
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

// Attach CategoryName (LEFT JOIN Categories) to a list of product docs
async function withCategoryNames(products) {
    const categories = await Category.find(
        { CategoryID: { $in: [...new Set(products.map(p => p.CategoryID))] } }, NO_ID
    ).lean();
    const categoryMap = indexBy(categories, 'CategoryID');

    return products.map(p => sortImages({
        ...p,
        CategoryName: categoryMap.get(p.CategoryID)?.CategoryName ?? null
    }));
}

// ============================================================
// ROUTES
// ============================================================

// --- 1. GET ALL PRODUCTS (Public) ---
// Only shows 'Available' products by default (approved + not sold)
// Supports: ?search= ?category= ?condition= ?minPrice= ?maxPrice= ?sort=
// Each product includes its images array
router.get('/', async (req, res) => {
    const { search, category, condition, minPrice, maxPrice, sort } = req.query;

    try {
        const filter = { Status: 'Available' };

        if (search) {
            const rx = new RegExp(escapeRegex(search), 'i');
            filter.$or = [{ ProductName: rx }, { Description: rx }, { sellerName: rx }];
        }
        if (category)  filter.CategoryID = toInt(category) ?? -1; // invalid id -> no matches
        if (condition) filter.ProductCondition = String(condition);

        const price = {};
        if (minPrice && !Number.isNaN(parseFloat(minPrice))) price.$gte = parseFloat(minPrice);
        if (maxPrice && !Number.isNaN(parseFloat(maxPrice))) price.$lte = parseFloat(maxPrice);
        if (Object.keys(price).length) filter.Price = price;

        let sortBy;
        if (sort === 'price_asc')       sortBy = { Price: 1 };
        else if (sort === 'price_desc') sortBy = { Price: -1 };
        else if (sort === 'oldest')     sortBy = { DatePosted: 1 };
        else                            sortBy = { DatePosted: -1 }; // default: newest

        const products = await Product.find(filter, NO_ID).sort(sortBy).lean();
        res.json(await withCategoryNames(products));
    } catch (err) {
        sendError(res, 'Get Products Error', err);
    }
});

// --- 2. GET MY LISTINGS (Private) ---
// Returns all of the logged-in user's listings including pending ones
// Must be defined before /:id to avoid route conflict
router.get('/my/listings', auth, async (req, res) => {
    try {
        const products = await Product.find({ UserID: req.user.id }, NO_ID)
            .sort({ DatePosted: -1 })
            .lean();

        res.json(await withCategoryNames(products));
    } catch (err) {
        sendError(res, 'My Listings Error', err);
    }
});

// --- 3. GET SINGLE PRODUCT BY ID (Public) ---
// Returns product + seller QR code + all images
router.get('/:id', async (req, res) => {
    try {
        const id = toInt(req.params.id);
        if (id === null) return res.status(404).json({ message: 'Product not found.' });

        const product = await Product.findOne({ ProductID: id }, NO_ID).lean();
        const seller  = product && await User.findOne(
            { UserID: product.UserID },
            { ...NO_ID, QRCodeImage: 1, FirstName: 1, LastName: 1 }
        ).lean();

        // Old query was an INNER JOIN on Users, so a product without a seller = not found
        if (!product || !seller) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        // The list routes attach CategoryName; this one must too, otherwise the
        // product page falls back to showing "Others" for every item.
        const category = await Category.findOne({ CategoryID: product.CategoryID }, NO_ID).lean();

        res.json(sortImages({
            ...product,
            CategoryName:    category?.CategoryName ?? null,
            QRCodeImage:     seller.QRCodeImage,
            SellerFirstName: seller.FirstName,
            SellerLastName:  seller.LastName
        }));
    } catch (err) {
        sendError(res, 'Get Product Error', err);
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

    const cleanupFiles = () =>
        files.forEach(f => deleteImageFile(`${BASE_URL}/uploads/products/${f.filename}`));

    if (!productName || !price || !productCondition || !categoryID) {
        cleanupFiles();
        return res.status(400).json({ message: 'ProductName, Price, ProductCondition, and CategoryID are required.' });
    }

    if (files.length === 0) {
        return res.status(400).json({ message: 'At least 1 product image is required.' });
    }

    if (files.length > 5) {
        cleanupFiles();
        return res.status(400).json({ message: 'Maximum 5 images allowed.' });
    }

    const userID = req.user.id;

    try {
        // MongoDB has no foreign keys, so check the category ourselves
        const categoryExists = await Category.exists({ CategoryID: toInt(categoryID) });
        if (!categoryExists) {
            cleanupFiles();
            return res.status(400).json({ message: 'Invalid category.' });
        }

        // Get seller name from DB — never trust the client
        const user       = await User.findOne({ UserID: userID }, { FirstName: 1, LastName: 1 }).lean();
        const sellerName = user ? `${user.FirstName} ${user.LastName}` : 'Unknown';

        // Primary image (first upload) stored on Product.ImageURL for backwards compat
        const primaryImageURL = `${BASE_URL}/uploads/products/${files[0].filename}`;
        const productID       = await nextId('ProductID');

        await Product.create({
            ProductID:        productID,
            UserID:           userID,
            CategoryID:       toInt(categoryID),
            ProductName:      productName,
            sellerName,
            Description:      description || null,
            Price:            parseFloat(price),
            ProductCondition: productCondition,
            Quantity:         parseInt(quantity) || 1,
            ImageURL:         primaryImageURL,
            Status:           'Pending Approval',
            images:           await buildImages(files)
        });

        res.status(201).json({
            message:   'Listing submitted for admin approval!',
            productId: productID
        });
    } catch (err) {
        // Clean up uploaded files on DB error
        cleanupFiles();
        sendError(res, 'Add Product Error', err);
    }
});

// --- 5. EDIT A PRODUCT (Private - Owner only) ---
// Can replace images by uploading new ones (replaces ALL existing images)
// If no new images uploaded, existing images are kept
router.put('/:id', auth, productImgUpload.array('productImages', 5), async (req, res) => {
    const { productName, price, description, productCondition, categoryID, quantity } = req.body;
    const productId = toInt(req.params.id);
    const userID    = req.user.id;
    const files     = req.files || [];

    const cleanupFiles = () =>
        files.forEach(f => deleteImageFile(`${BASE_URL}/uploads/products/${f.filename}`));

    if (!productName || !price || !productCondition || !categoryID) {
        cleanupFiles();
        return res.status(400).json({ message: 'ProductName, Price, ProductCondition, and CategoryID are required.' });
    }

    if (files.length > 5) {
        cleanupFiles();
        return res.status(400).json({ message: 'Maximum 5 images allowed.' });
    }

    try {
        // Verify ownership
        const existing = productId === null ? null
            : await Product.findOne({ ProductID: productId }, { UserID: 1, ImageURL: 1, images: 1 }).lean();

        if (!existing) {
            cleanupFiles();
            return res.status(404).json({ message: 'Product not found.' });
        }
        if (existing.UserID !== userID) {
            cleanupFiles();
            return res.status(403).json({ message: 'Unauthorized: You do not own this listing.' });
        }

        const categoryExists = await Category.exists({ CategoryID: toInt(categoryID) });
        if (!categoryExists) {
            cleanupFiles();
            return res.status(400).json({ message: 'Invalid category.' });
        }

        const update = {
            ProductName:      productName,
            Price:            parseFloat(price),
            Description:      description || null,
            ProductCondition: productCondition,
            CategoryID:       toInt(categoryID),
            Quantity:         parseInt(quantity) || 1,
            ImageURL:         existing.ImageURL || null,
            Status:           'Pending Approval' // editing resets status to Pending Approval
        };

        // If new images uploaded — replace all the old ones
        if (files.length > 0) {
            update.images   = await buildImages(files);
            update.ImageURL = `${BASE_URL}/uploads/products/${files[0].filename}`;
        }

        await Product.updateOne({ ProductID: productId }, { $set: update }, { runValidators: true });

        // Only delete the old files from disk once the DB update has succeeded
        if (files.length > 0) {
            (existing.images || []).forEach(img => deleteImageFile(img.ImageURL));
        }

        res.json({ message: 'Product updated! Re-submitted for admin approval.' });
    } catch (err) {
        cleanupFiles();
        sendError(res, 'Edit Product Error', err);
    }
});

// --- 6. DELETE A PRODUCT (Private - Owner only) ---
// Images are embedded in the product, so they go with it; files are removed from disk too
router.delete('/:id', auth, async (req, res) => {
    const productId = toInt(req.params.id);
    const userID    = req.user.id;

    try {
        const product = productId === null ? null
            : await Product.findOne({ ProductID: productId }, { UserID: 1, ImageURL: 1, images: 1 }).lean();

        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }
        if (product.UserID !== userID) {
            return res.status(403).json({ message: 'Unauthorized: You do not own this listing.' });
        }

        // SQL Server blocked this with a foreign key; MongoDB won't, so enforce it here
        const hasTransactions = await Transaction.exists({ ProductID: productId });
        if (hasTransactions) {
            return res.status(400).json({ message: 'This listing has purchase records and cannot be deleted.' });
        }

        (product.images || []).forEach(img => deleteImageFile(img.ImageURL));
        deleteImageFile(product.ImageURL);

        await Product.deleteOne({ ProductID: productId });
        await SavedItem.deleteMany({ ProductID: productId });

        res.json({ message: 'Product deleted successfully!' });
    } catch (err) {
        sendError(res, 'Delete Product Error', err);
    }
});

module.exports = router;