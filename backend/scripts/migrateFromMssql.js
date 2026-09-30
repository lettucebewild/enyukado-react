// OPTIONAL — one-time copy of your existing SQL Server data into MongoDB.
// Skip this if you're starting with an empty database (use `npm run seed` instead).
//
//   1. npm install --no-save mssql          (mssql is no longer a dependency)
//   2. Keep your old DB_USER / DB_PASSWORD / DB_SERVER / DB_NAME in .env, and add MONGODB_URI
//   3. npm run migrate:mssql
//
// IDs, password hashes and dates are copied as-is, so existing JWTs, image URLs and the
// bot's UserID keep working. Re-running is safe: every row is upserted by its ID.
require('dotenv').config();

let sql;
try { sql = require('mssql'); }
catch { console.error('❌ Run `npm install --no-save mssql` first.'); process.exit(1); }

const { connectDB, mongoose } = require('../config/db');
const M = require('../models');

const mssqlConfig = {
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server:   process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME,
    options:  { encrypt: true, trustServerCertificate: true, enableArithAbort: true }
};

const orNull = v => (v === undefined ? null : v);

// Upsert rows by their ID field, then move the ID counter past the highest one copied
async function copy(pool, { table, model, idField, map, counter }) {
    const { recordset } = await pool.request().query(`SELECT * FROM ${table}`);
    if (recordset.length) {
        await model.bulkWrite(recordset.map(row => {
            const doc = map(row);
            return { replaceOne: { filter: { [idField]: doc[idField] }, replacement: doc, upsert: true } };
        }));
        await M.bumpCounter(counter, Math.max(...recordset.map(r => r[idField])));
    }
    console.log(`  ${table}: ${recordset.length} rows`);
}

async function main() {
    await connectDB();
    const pool = await new sql.ConnectionPool(mssqlConfig).connect();
    console.log('✅ Connected to SQL Server — copying…');

    await copy(pool, { table: 'Categories', model: M.Category, idField: 'CategoryID', counter: 'CategoryID',
        map: r => ({ CategoryID: r.CategoryID, CategoryName: r.CategoryName }) });

    await copy(pool, { table: 'Users', model: M.User, idField: 'UserID', counter: 'UserID',
        map: r => ({
            UserID: r.UserID, FirstName: r.FirstName, LastName: r.LastName,
            Email: String(r.Email).toLowerCase().trim(), Password: r.Password,
            IsAdmin: !!r.IsAdmin, IsApproved: !!r.IsApproved,
            QRCodeImage: orNull(r.QRCodeImage), Bio: orNull(r.Bio), Course: orNull(r.Course),
            Year: orNull(r.Year), CampusArea: orNull(r.CampusArea),
            DateCreated: r.DateCreated || new Date(), PasswordChangedAt: orNull(r.PasswordChangedAt)
        }) });

    // ProductImages become an embedded array on each product
    const imgRows = (await pool.request().query('SELECT * FROM ProductImages ORDER BY SortOrder')).recordset;
    const imagesByProduct = new Map();
    for (const i of imgRows) {
        if (!imagesByProduct.has(i.ProductID)) imagesByProduct.set(i.ProductID, []);
        imagesByProduct.get(i.ProductID).push({ ImageID: i.ImageID, ImageURL: i.ImageURL, SortOrder: i.SortOrder ?? 0 });
    }
    await M.bumpCounter('ImageID', imgRows.length ? Math.max(...imgRows.map(i => i.ImageID)) : 0);

    await copy(pool, { table: 'Products', model: M.Product, idField: 'ProductID', counter: 'ProductID',
        map: r => ({
            ProductID: r.ProductID, UserID: r.UserID, CategoryID: r.CategoryID,
            ProductName: r.ProductName, sellerName: r.sellerName, Description: orNull(r.Description),
            Price: Number(r.Price), ProductCondition: r.ProductCondition, Quantity: r.Quantity ?? 1,
            ImageURL: orNull(r.ImageURL), Status: r.Status || 'Available',
            DatePosted: r.DatePosted || new Date(), images: imagesByProduct.get(r.ProductID) || []
        }) });

    await copy(pool, { table: 'SavedItems', model: M.SavedItem, idField: 'SavedID', counter: 'SavedID',
        map: r => ({ SavedID: r.SavedID, UserID: r.UserID, ProductID: r.ProductID, DateSaved: r.DateSaved || new Date() }) });

    await copy(pool, { table: 'Transactions', model: M.Transaction, idField: 'TransactionID', counter: 'TransactionID',
        map: r => ({
            TransactionID: r.TransactionID, ProductID: r.ProductID, BuyerID: r.BuyerID, SellerID: r.SellerID,
            Status: r.Status || 'Pending', PaymentMethod: orNull(r.PaymentMethod),
            PaymentProofImage: orNull(r.PaymentProofImage), TransactionDate: r.TransactionDate || new Date()
        }) });

    await copy(pool, { table: 'Reviews', model: M.Review, idField: 'ReviewID', counter: 'ReviewID',
        map: r => ({
            ReviewID: r.ReviewID, TransactionID: r.TransactionID, ReviewerID: r.ReviewerID,
            Rating: r.Rating, Comment: orNull(r.Comment), DateCreated: r.DateCreated || new Date()
        }) });

    await copy(pool, { table: 'Messages', model: M.Message, idField: 'MessageID', counter: 'MessageID',
        map: r => ({
            MessageID: r.MessageID, SenderID: orNull(r.SenderID), ReceiverID: r.ReceiverID,
            TransactionID: orNull(r.TransactionID), Content: orNull(r.Content), ImageURL: orNull(r.ImageURL),
            IsRead: !!r.IsRead, DateSent: r.DateSent || new Date()
        }) });

    await pool.close();
    console.log('✅ Migration complete.');
}

main()
    .catch(err => { console.error('❌ Migration failed:', err.message); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
