const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Sender information
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  senderFirebaseUid: {
    type: String,
    required: true,
  },
  senderName: {
    type: String,
    required: true,
  },
  senderRole: {
    type: String,
    enum: ['patient', 'doctor', 'admin'],
    required: true,
  },
  // Recipient information
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  recipientFirebaseUid: {
    type: String,
    required: true,
  },
  // Message content
  content: {
    type: String,
    required: true,
    trim: true,
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text',
  },
  // Message status
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
    default: null,
  },
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Compound index for conversation queries
messageSchema.index({ senderId: 1, recipientId: 1, createdAt: -1 });
messageSchema.index({ recipientId: 1, isRead: 1 });

// Virtual for conversation participants (sorted to ensure consistency)
messageSchema.virtual('conversationId').get(function() {
  const ids = [this.senderId.toString(), this.recipientId.toString()].sort();
  return ids.join('_');
});

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;

