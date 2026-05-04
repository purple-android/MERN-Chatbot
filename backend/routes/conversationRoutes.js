const express = require('express');
const router = express.Router();

const {
  getAllConversations,
  getConversation,
  createConversation,
  sendMessage,
  deleteConversation
} = require('../controllers/conversationController');

const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.get('/', getAllConversations);
router.get('/:id', getConversation);
router.post('/', createConversation);
router.post('/:id/message', sendMessage);
router.delete('/:id', deleteConversation);

module.exports = router;