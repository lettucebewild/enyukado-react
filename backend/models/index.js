const mongoose = require('mongoose');
require('dotenv').config();

const { Schema } = mongoose;

// The Enyukado Bot's UserID (frontend expects 4 — see BOT_ID in MessagesPanel.jsx)
const BOT_USER_ID = parseInt(process.env.BOT_USER_ID, 10) || 4;

// Projection helper: hides Mongo's internal _id (the API uses the numeric *ID fields)
const NO_ID = { _id: 0 };

// ============================================================
// COUNTERS — auto-increment numeric IDs (replaces SQL IDENTITY columns)
// ============================================================
const Counter = mongoose.model('Counter', new Schema({
    _id: String,
    seq: { type: Number, default: 0 }
}, { versionKey: false }));

// Atomically get the next ID for a sequence, e.g. nextId('UserID') -> 1, 2, 3 ...
async function nextId(name) {
    let doc = await Counter.findOneAndUpdate(
        { _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true }
    );
    // A normal sign-up must never be handed the bot's ID
    if (name === 'UserID' && doc.seq === BOT_USER_ID) {
        doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true });
    }
    return doc.seq;
}

// Make sure a counter is at least `value` (used by seed / migration)
async function bumpCounter(name, value) {
    await Counter.findOneAndUpdate({ _id: name }, { $max: { seq: value } }, { upsert: true });
}

// ============================================================
// SCHEMAS  (field names match what the routes and frontend use)
// ============================================================
const userSchema = new Schema({
    UserID:            { type: Number, required: true, unique: true },
    FirstName:         { type: String, required: true, trim: true },
    LastName:          { type: String, required: true, trim: true },
    Email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
    Password:          { type: String, required: true },
    IsAdmin:           { type: Boolean, default: false },
    IsApproved:        { type: Boolean, default: false },
    QRCodeImage:       { type: String, default: null },
    Bio:               { type: String, default: null },
    Course:            { type: String, default: null },
    Year:              { type: String, default: null },
    CampusArea:        { type: String, default: null },
    DateCreated:       { type: Date, default: Date.now },
    PasswordChangedAt: { type: Date, default: null }
}, { versionKey: false });
userSchema.index({ IsApproved: 1, IsAdmin: 1 });

const categorySchema = new Schema({
    CategoryID:   { type: Number, required: true, unique: true },
    CategoryName: { type: String, required: true, unique: true, trim: true }
}, { versionKey: false });

const productImageSchema = new Schema({
    ImageID:   { type: Number, required: true },
    ImageURL:  { type: String, required: true },
    SortOrder: { type: Number, default: 0 }   // 0 = primary / thumbnail
}, { _id: false });

const productSchema = new Schema({
    ProductID:        { type: Number, required: true, unique: true },
    UserID:           { type: Number, required: true, index: true },
    CategoryID:       { type: Number, required: true, index: true },
    ProductName:      { type: String, required: true, trim: true },
    sellerName:       { type: String, required: true },
    Description:      { type: String, default: null },
    Price:            { type: Number, required: true, min: 0 },
    ProductCondition: { type: String, required: true },
    Quantity:         { type: Number, default: 1, min: 0 },
    ImageURL:         { type: String, default: null },
    Status:           { type: String, default: 'Pending Approval',
                        enum: ['Pending Approval', 'Available', 'Sold'] },
    DatePosted:       { type: Date, default: Date.now },
    images:           { type: [productImageSchema], default: [] }
}, { versionKey: false });
productSchema.index({ Status: 1, DatePosted: -1 });

const savedItemSchema = new Schema({
    SavedID:   { type: Number, required: true, unique: true },
    UserID:    { type: Number, required: true },
    ProductID: { type: Number, required: true },
    DateSaved: { type: Date, default: Date.now }
}, { versionKey: false });
savedItemSchema.index({ UserID: 1, ProductID: 1 }, { unique: true });

const transactionSchema = new Schema({
    TransactionID:     { type: Number, required: true, unique: true },
    ProductID:         { type: Number, required: true, index: true },
    BuyerID:           { type: Number, required: true, index: true },
    SellerID:          { type: Number, required: true, index: true },
    Status:            { type: String, default: 'Pending',
                         enum: ['Pending', 'Payment Approved', 'Dropped Off', 'Completed', 'Cancelled'] },
    PaymentMethod:     { type: String, default: null },
    PaymentProofImage: { type: String, default: null },
    TransactionDate:   { type: Date, default: Date.now }
}, { versionKey: false });

const reviewSchema = new Schema({
    ReviewID:      { type: Number, required: true, unique: true },
    TransactionID: { type: Number, required: true, unique: true },   // one review per transaction
    ReviewerID:    { type: Number, required: true },
    Rating:        { type: Number, required: true, min: 1, max: 5 },
    Comment:       { type: String, default: null },
    DateCreated:   { type: Date, default: Date.now }
}, { versionKey: false });

const messageSchema = new Schema({
    MessageID:     { type: Number, required: true, unique: true },
    SenderID:      { type: Number, default: null },      // null = system notification
    ReceiverID:    { type: Number, required: true },
    TransactionID: { type: Number, default: null },
    Content:       { type: String, default: null },
    ImageURL:      { type: String, default: null },
    IsRead:        { type: Boolean, default: false },
    DateSent:      { type: Date, default: Date.now }
}, { versionKey: false });
messageSchema.index({ ReceiverID: 1, IsRead: 1 });
messageSchema.index({ SenderID: 1, ReceiverID: 1, DateSent: 1 });
messageSchema.index({ TransactionID: 1, ReceiverID: 1 });

module.exports = {
    BOT_USER_ID, NO_ID, nextId, bumpCounter, Counter,
    User:        mongoose.model('User',        userSchema),
    Category:    mongoose.model('Category',    categorySchema),
    Product:     mongoose.model('Product',     productSchema),
    SavedItem:   mongoose.model('SavedItem',   savedItemSchema),
    Transaction: mongoose.model('Transaction', transactionSchema),
    Review:      mongoose.model('Review',      reviewSchema),
    Message:     mongoose.model('Message',     messageSchema)
};
