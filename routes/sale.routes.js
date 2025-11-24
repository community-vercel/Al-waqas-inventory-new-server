// routes/sale.routes.js
const express = require('express');
const { getSales, createSale, deleteSale, getSalesStats } = require('../controllers/sale.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', protect, getSales);
router.get('/stats', protect, getSalesStats);
router.post('/', protect, createSale);
router.delete('/:id', protect, deleteSale);

module.exports = router;