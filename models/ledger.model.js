const mongoose = require('mongoose');

// Ledger Schema
const ledgerSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    vendor: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: false,
    },
    transactionType: {
      type: String,
      enum: ['payable', 'receivable'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    openingBalance: {
      type: Number,
      required: true,
      default: 0,
    },
    closingBalance: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
ledgerSchema.index({ date: -1, vendor: 1 });
ledgerSchema.index({ vendor: 1 });

module.exports = mongoose.model('Ledger', ledgerSchema);