const sql = require('mssql');

// FIX: Removed the wrong '../.env' relative path.
// server.js already calls require('dotenv').config() at the root level,
// so by the time this file is loaded, process.env is already populated.
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

// Safety check
if (!config.user || !config.database) {
    console.error('❌ ERROR: Missing .env variables! Check your .env file.');
}

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ Connected to SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('❌ Database Connection Failed:', err.message);
        throw err;
    });

module.exports = { sql, poolPromise };