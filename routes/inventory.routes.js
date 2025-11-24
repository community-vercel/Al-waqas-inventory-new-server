// routes/inventory.routes.js
const express = require('express');
const { getInventory, getLowStock, updateInventory } = require('../controllers/inventory.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', protect, getInventory);
router.get('/low-stock', protect, getLowStock);
router.put('/:id', protect, updateInventory);

module.exports = router;