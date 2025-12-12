const express = require('express');
const ledgerController = require('../controllers/ledger.controller');

const router = express.Router();

// Add a new transaction
router.post('/transaction', ledgerController.addTransaction);

// Get daily ledger (all vendors for a date)
router.get('/daily', ledgerController.getDailyLedger);

// Get vendor ledger (all transactions for a vendor)
router.get('/vendor/:vendor', ledgerController.getVendorLedger);

// Get day end summary (opening and closing balance for all vendors)
router.get('/summary/day-end', ledgerController.getDayEndSummary);

// Get all vendors
router.get('/vendors', ledgerController.getAllVendors);

// Update transaction status
router.put('/transaction/:id', ledgerController.updateTransaction);

// Delete transaction
router.delete('/transaction/:id', ledgerController.deleteTransaction);

module.exports = router;