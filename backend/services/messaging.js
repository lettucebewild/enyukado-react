const { Message, nextId, BOT_USER_ID } = require('../models');

// Insert one message row
async function createMessage({ senderID = null, receiverID, transactionID = null, content = null, imageURL = null }) {
    return Message.create({
        MessageID:     await nextId('MessageID'),
        SenderID:      senderID,
        ReceiverID:    receiverID,
        TransactionID: transactionID,
        Content:       content,
        ImageURL:      imageURL
    });
}

// Message that looks like it came from one user to another (auto-replies in a purchase)
function sendAutoMessage(senderID, receiverID, transactionID, content) {
    return createMessage({ senderID, receiverID, transactionID, content });
}

// System notification from the Enyukado Bot.
//   - Tied to a transaction  -> stored as a system message (SenderID null); the frontend reads
//                               these through GET /api/messages/system/:transactionID
//   - Not tied to anything   -> sent from the bot account, so it shows up in the user's inbox
//                               as a conversation with "Enyukado Bot"
function sendBotMessage(receiverID, transactionID, content) {
    return createMessage({
        senderID:      transactionID ? null : BOT_USER_ID,
        receiverID,
        transactionID: transactionID || null,
        content
    });
}

module.exports = { BOT_USER_ID, createMessage, sendAutoMessage, sendBotMessage };
