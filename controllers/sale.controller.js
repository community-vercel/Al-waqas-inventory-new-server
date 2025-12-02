// controllers/sale.controller.js - FINAL: COLOR OPTIONAL + AUTO FROM PRODUCT CODE
const mongoose = require('mongoose');
const Sale = require('../models/sale.model');
const Inventory = require('../models/inventory.model');
const Product = require('../models/product.model');
const Color = require('../models/color.model');

// @desc    Create new sale
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res) => {
  try {
    const { customerName, product, quantity, unitPrice, discount = 0 } = req.body;

    console.log('Creating sale:', { customerName, product, quantity, unitPrice, discount });

    // REQUIRED FIELDS ONLY
    if (!customerName || !product || !quantity || !unitPrice) {
      return res.status(400).json({
        success: false,
        message: 'Please provide: customerName, product, quantity, unitPrice'
      });
    }

    // Validate product exists
    const productDoc = await Product.findById(product);
    if (!productDoc) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // AUTO FIND COLOR FROM PRODUCT CODE (e.g., NIP-Q → WH)
   // AUTO FIND COLOR FROM PRODUCT CODE (e.g., 90056 → color with codeName "90056")
let colorId = null;
if (productDoc.code) {
  const color = await Color.findOne({ 
    codeName: productDoc.code.trim().toUpperCase()   // ← THIS IS THE FIX
  });
  if (color) colorId = color._id;
}

    // Calculate total
    const subtotal = quantity * unitPrice;
    const discountAmount = subtotal * (discount / 100);
    const totalAmount = parseFloat((subtotal - discountAmount).toFixed(2));

    const saleData = {
      customerName: customerName.trim(),
      product,
      color: colorId,                    // ← AUTO-FILLED OR NULL
      quantity: parseInt(quantity),
      unitPrice: parseFloat(unitPrice),
      discount: parseFloat(discount),
      totalAmount,
      createdBy: req.user.id
    };

    // CREATE SALE — MIDDLEWARE WILL HANDLE INVENTORY
    const sale = await Sale.create(saleData);

    // Populate response
    const populatedSale = await Sale.findById(sale._id)
      .populate('product', 'name type code salePrice')
      .populate('color', 'name codeName hexCode')
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Sale completed successfully!',
      data: populatedSale
    });

  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating sale',
      error: error.message
    });
  }
};

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res) => {
  try {
    const { startDate, endDate, customerName, product } = req.query;
    
    let filter = {};
    
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (customerName) {
      filter.customerName = { $regex: customerName, $options: 'i' };
    }

    if (product) {
      filter.product = product;
    }

    const sales = await Sale.find(filter)
      .populate('product', 'name type code salePrice')
      .populate('color', 'name codeName hexCode')
      .populate('createdBy', 'name email')
      .sort({ date: -1 });

    const totalAmount = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);

    res.json({
      success: true,
      count: sales.length,
      totalAmount,
      data: sales
    });
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ success: false, message: 'Error', error: error.message });
  }
};

// @desc    Delete sale
// @route   DELETE /api/sales/:id
// @access  Private
const deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }

    await Sale.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Delete sale error:', error);
    res.status(500).json({ success: false, message: 'Error deleting sale' });
  }
};

// @desc    Get sales statistics
// @route   GET /api/sales/stats
// @access  Private
const getSalesStats = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate = new Date();
    switch (period) {
      case 'day': startDate.setHours(0, 0, 0, 0); break;
      case 'week': startDate.setDate(startDate.getDate() - 7); break;
      case 'month': startDate.setMonth(startDate.getMonth() - 1); break;
      case 'year': startDate.setFullYear(startDate.getFullYear() - 1); break;
      default: startDate.setMonth(startDate.getMonth() - 1);
    }

    const sales = await Sale.find({ date: { $gte: startDate } });

    const totalSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalItems = sales.reduce((sum, s) => sum + s.quantity, 0);

    res.json({
      success: true,
      data: {
        totalSales,
        totalItems,
        totalTransactions: sales.length,
        averageSale: sales.length > 0 ? totalSales / sales.length : 0
      }
    });
  } catch (error) {
    console.error('Get sales stats error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
};

module.exports = {
  getSales,
  createSale,
  deleteSale,
  getSalesStats
};