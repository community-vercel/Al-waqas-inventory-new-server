const Ledger = require('../models/ledger.model');

// Get opening balance for a vendor on a specific date
const getOpeningBalance = async (vendor, date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const lastTransaction = await Ledger.findOne({
    vendor,
    date: { $lt: startOfDay },
  }).sort({ date: -1 });

  return lastTransaction ? lastTransaction.closingBalance : 0;
};

// Calculate closing balance
const calculateClosingBalance = (openingBalance, transactionType, amount) => {
  if (transactionType === 'receivable') {
    return openingBalance + amount;
  } else if (transactionType === 'payable') {
    return openingBalance - amount;
  }
  return openingBalance;
};

// Add Transaction
exports.addTransaction = async (req, res) => {
  try {
    const { vendor, transactionType, amount, description, date } = req.body;

    // Validation
    if (!vendor || !transactionType || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Vendor, transactionType, and amount are required',
      });
    }

    if (!['payable', 'receivable'].includes(transactionType)) {
      return res.status(400).json({
        success: false,
        message: 'transactionType must be payable or receivable',
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0',
      });
    }

    const transactionDate = date ? new Date(date) : new Date();

    // Get opening balance
    const openingBalance = await getOpeningBalance(vendor, transactionDate);

    // Calculate closing balance
    const closingBalance = calculateClosingBalance(
      openingBalance,
      transactionType,
      amount
    );

    // Create new transaction
    const ledgerEntry = new Ledger({
      vendor,
      transactionType,
      amount,
      description,
      date: transactionDate,
      openingBalance,
      closingBalance,
      status: 'completed',
    });

    await ledgerEntry.save();

    res.status(201).json({
      success: true,
      message: 'Transaction added successfully',
      data: ledgerEntry,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding transaction',
      error: error.message,
    });
  }
};

// Get Daily Ledger (All transactions for a specific date)
exports.getDailyLedger = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required',
      });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const transactions = await Ledger.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ date: 1 });

    res.status(200).json({
      success: true,
      date,
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching daily ledger',
      error: error.message,
    });
  }
};

// Get Vendor Ledger (All transactions for a vendor)
exports.getVendorLedger = async (req, res) => {
  try {
    const { vendor } = req.params;
    const { startDate, endDate } = req.query;

    let query = { vendor };

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      query.date = { $gte: start, $lte: end };
    }

    const transactions = await Ledger.find(query).sort({ date: 1 });

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No transactions found for this vendor',
      });
    }

    const openingBalance = transactions[0].openingBalance;
    const closingBalance = transactions[transactions.length - 1].closingBalance;

    res.status(200).json({
      success: true,
      vendor,
      openingBalance,
      closingBalance,
      totalTransactions: transactions.length,
      data: transactions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching vendor ledger',
      error: error.message,
    });
  }
};

// Get Day End Summary (Opening and Closing Balance for all vendors)
exports.getDayEndSummary = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required',
      });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const transactions = await Ledger.find({
      date: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ vendor: 1, date: 1 });

    const summary = {};

    for (const txn of transactions) {
      if (!summary[txn.vendor]) {
        summary[txn.vendor] = {
          vendor: txn.vendor,
          openingBalance: txn.openingBalance,
          closingBalance: txn.closingBalance,
          totalReceivable: 0,
          totalPayable: 0,
          transactionCount: 0,
        };
      }

      summary[txn.vendor].closingBalance = txn.closingBalance;
      summary[txn.vendor].transactionCount += 1;

      if (txn.transactionType === 'receivable') {
        summary[txn.vendor].totalReceivable += txn.amount;
      } else {
        summary[txn.vendor].totalPayable += txn.amount;
      }
    }

    const summaryArray = Object.values(summary);

    res.status(200).json({
      success: true,
      date,
      vendorCount: summaryArray.length,
      data: summaryArray,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching day end summary',
      error: error.message,
    });
  }
};

// Update Transaction
exports.updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    const updatedTransaction = await Ledger.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updatedTransaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Transaction updated successfully',
      data: updatedTransaction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating transaction',
      error: error.message,
    });
  }
};

// Delete Transaction
exports.deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedTransaction = await Ledger.findByIdAndDelete(id);

    if (!deletedTransaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Transaction deleted successfully',
      data: deletedTransaction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting transaction',
      error: error.message,
    });
  }
};

// Get all vendors
exports.getAllVendors = async (req, res) => {
  try {
    const vendors = await Ledger.distinct('vendor');

    res.status(200).json({
      success: true,
      count: vendors.length,
      data: vendors,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching vendors',
      error: error.message,
    });
  }
};