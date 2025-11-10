const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// All chat routes require authentication
router.use(authenticateToken);

/**
 * GET /api/chat/conversations
 * Get all conversations for the current user
 */
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // For doctors, get only conversations with their assigned patients
    let allowedPartnerIds = null;
    if (userRole === 'doctor') {
      const doctor = await User.findById(userId).select('patients');
      if (doctor && doctor.patients) {
        // Convert to ObjectIds for matching
        allowedPartnerIds = doctor.patients.map(p => p.toString());
      }
    }

    // Get all unique conversation partners
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [
            { senderId: userId },
            { recipientId: userId }
          ],
          isDeleted: false
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$senderId', userId] },
              '$recipientId',
              '$senderId'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$recipientId', userId] },
                    { $eq: ['$isRead', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Populate user details and filter by assigned patients if doctor
    const conversations = await Promise.all(
      messages.map(async (conv) => {
        const partner = await User.findById(conv._id).select('displayName email role');

        // For doctors, only include conversations with their assigned patients
        if (userRole === 'doctor') {
          if (!allowedPartnerIds || !allowedPartnerIds.includes(conv._id.toString())) {
            return null;
          }
        }

        return {
          partnerId: conv._id,
          partner,
          lastMessage: conv.lastMessage,
          unreadCount: conv.unreadCount
        };
      })
    );

    // Filter out null values (conversations not with assigned patients)
    const filteredConversations = conversations.filter(conv => conv !== null);

    res.json(filteredConversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /api/chat/messages/:userId
 * Get chat history with a specific user
 */
router.get('/messages/:partnerId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { partnerId } = req.params;
    const { limit = 50, before } = req.query;
    
    const query = {
      $or: [
        { senderId: userId, recipientId: partnerId },
        { senderId: partnerId, recipientId: userId }
      ],
      isDeleted: false
    };

    // Pagination support
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('senderId', 'displayName email role')
      .populate('recipientId', 'displayName email role');

    // Mark messages as read
    await Message.updateMany(
      {
        senderId: partnerId,
        recipientId: userId,
        isRead: false
      },
      {
        $set: { isRead: true, readAt: new Date() }
      }
    );

    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * POST /api/chat/messages
 * Send a new message
 */
router.post('/messages', async (req, res) => {
  try {
    const { recipientId, content, messageType = 'text' } = req.body;
    const sender = req.user.dbUser;

    if (!content || !recipientId) {
      return res.status(400).json({ error: 'Content and recipientId are required' });
    }

    // Verify recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Create message
    const message = new Message({
      senderId: sender._id,
      senderFirebaseUid: sender.firebaseUid,
      senderName: sender.displayName || sender.email,
      senderRole: sender.role,
      recipientId: recipient._id,
      recipientFirebaseUid: recipient.firebaseUid,
      content,
      messageType,
    });

    await message.save();

    // Populate sender and recipient details
    await message.populate('senderId', 'displayName email role');
    await message.populate('recipientId', 'displayName email role');

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * PATCH /api/chat/messages/:messageId/read
 * Mark a message as read
 */
router.patch('/messages/:messageId/read', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.userId;

    const message = await Message.findOneAndUpdate(
      { _id: messageId, recipientId: userId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

module.exports = router;

