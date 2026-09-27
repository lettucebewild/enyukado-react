const { poolPromise, sql } = require('./config/db');

const seedDatabase = async () => {
    try {
        const pool = await poolPromise;
        console.log('✅ Connected to SQL Server');

        // 1. Get a valid UserID from your table
        const userCheck = await pool.request().query('SELECT TOP 1 UserID FROM Users');
        
        if (userCheck.recordset.length === 0) {
            console.error('❌ Error: No users found. Run the INSERT INTO Users command in SSMS first.');
            process.exit(1);
        }

        const validUserID = userCheck.recordset[0].UserID;
        console.log(`👤 Using UserID: ${validUserID}`);

        // 2. Insert the product with ALL mandatory columns
        console.log('⏳ Inserting test item for Lyle...');
        await pool.request()
            .input('sellerName', sql.NVarChar, 'Lyle')
            .input('productName', sql.NVarChar, 'Engineering Physics Textbook')
            .input('price', sql.Decimal(10, 2), 500.00)
            .input('description', sql.NVarChar, 'Slightly used, no highlights. Great for physics midterms!')
            .input('category', sql.NVarChar, 'Books')
            .input('UserID', sql.Int, validUserID)
            .input('ProductCondition', sql.NVarChar, 'Used')
            // Added CategoryID to fix the final NULL error
            .input('CategoryID', sql.Int, 1) 
            .query(`
                INSERT INTO Products (sellerName, productName, price, description, category, UserID, ProductCondition, CategoryID) 
                VALUES (@sellerName, @productName, @price, @description, @category, @UserID, @ProductCondition, @CategoryID)
            `);

        console.log('✅ Success! Lyle\'s textbook is now in the database.');
        process.exit(0);

    } catch (err) {
        console.error('❌ Insertion failed:', err.message);
        process.exit(1);
    }
};

seedDatabase();