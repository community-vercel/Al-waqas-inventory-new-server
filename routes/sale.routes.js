// routes/sale.routes.js
const express = require('express');
const { 
  getSales, 
  createSale, 
  deleteSale, 
  getSalesStats,
  getDailySales,
  getDailySummary,
  getSalesByDateRange,
  createBulkSales 
} = require('../controllers/sale.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Get all sales with filters (default: today's sales)
router.get('/', protect, getSales);

// Get sales for specific date
router.get('/daily/:date', protect, getDailySales);

// Get daily summary statistics
router.get('/summary/:date', protect, getDailySummary);

// Get sales by date range (for reporting)
router.get('/date-range', protect, getSalesByDateRange);

// Get sales statistics (today, yesterday, week, month)
router.get('/stats', protect, getSalesStats);

// Create single sale
router.post('/', protect, createSale);

// Create multiple sales at once
router.post('/bulk', protect, createBulkSales);

// Delete a sale
router.delete('/:id', protect, deleteSale);

module.exports = router;