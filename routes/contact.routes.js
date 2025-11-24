const express = require('express');
const router = express.Router();
const {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  getContactsByType,
  searchContacts
} = require('../controllers/contact.controller');
const { protect } = require('../middleware/auth.middleware');

// Main routes - PROTECT EACH ROUTE SEPARATELY
router.route('/')
  .get(protect, getContacts)
  .post(protect, createContact);

router.route('/:id')
  .get(protect, getContact)
  .put(protect, updateContact)
  .delete(protect, deleteContact);

// Specialized routes
router.get('/type/:type', protect, getContactsByType);
router.get('/search/:query', protect, searchContacts);

module.exports = router;