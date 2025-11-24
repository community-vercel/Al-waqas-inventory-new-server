// controllers/sale.controller.js - FIXED WITH INVENTORY UPDATE
const mongoose = require('mongoose'); // Add this line
const Sale = require('../models/sale.model');
const Inventory = require('../models/inventory.model');
const Product = require('../models/product.model');
const Color = require('../models/color.model');

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res) => {
    try {
        const { startDate, endDate, customerName, product } = req.query;
        
        let filter = {};
        
        // Date filter
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        // Customer name filter
        if (customerName) {
            filter.customerName = { $regex: customerName, $options: 'i' };
        }

        // Product filter
        if (product) {
            filter.product = product;
        }

        const sales = await Sale.find(filter)
            .populate('product', 'name type purchasePrice salePrice')
            .populate('color', 'name hexCode')
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
        res.status(500).json({
            success: false,
            message: 'Error fetching sales',
            error: error.message
        });
    }
};

// @desc    Create new sale
// @route   POST /api/sales
// @access  Private
// @desc    Create new sale
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res) => {
  try {
    const { customerName, product, color, quantity, unitPrice, discount = 0 } = req.body;

    console.log('Creating sale with data:', { customerName, product, color, quantity, unitPrice, discount });

    // Validate required fields
    if (!customerName || !product || !color || !quantity || !unitPrice) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: customerName, product, color, quantity, unitPrice'
      });
    }

    // Validate product exists
    const productExists = await Product.findById(product);
    if (!productExists) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Validate color exists
    const colorExists = await Color.findById(color);
    if (!colorExists) {
      return res.status(400).json({
        success: false,
        message: 'Color not found'
      });
    }

    // Calculate total amount
    const subtotal = quantity * unitPrice;
    const discountAmount = subtotal * (discount / 100);
    const totalAmount = parseFloat((subtotal - discountAmount).toFixed(2));

    const saleData = {
      customerName: customerName.trim(),
      product,
      color,
      quantity: parseInt(quantity),
      unitPrice: parseFloat(unitPrice),
      discount: parseFloat(discount),
      totalAmount,
      createdBy: req.user.id
    };

    // ONLY CREATE SALE — MIDDLEWARE WILL HANDLE INVENTORY AUTOMATICALLY
    const sale = await Sale.create(saleData);

    // Populate response
    const populatedSale = await Sale.findById(sale._id)
      .populate('product', 'name type salePrice')
      .populate('color', 'name hexCode')
      .populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Sale created successfully',
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

// @desc    Delete sale
// @route   DELETE /api/sales/:id
// @access  Private
const deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    await Sale.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Sale deleted successfully'
    });
  } catch (error) {
    console.error('Delete sale error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting sale',
      error: error.message
    });
  }
};;

// @desc    Get sales statistics
// @route   GET /api/sales/stats
// @access  Private
const getSalesStats = async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        
        let startDate = new Date();
        switch (period) {
            case 'day':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(startDate.getMonth() - 1);
        }

        const sales = await Sale.find({
            date: { $gte: startDate }
        });

        const totalSales = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
        const totalItems = sales.reduce((sum, sale) => sum + sale.quantity, 0);

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
        res.status(500).json({
            success: false,
            message: 'Error fetching sales statistics',
            error: error.message
        });
    }
};

module.exports = {
    getSales,
    createSale,
    deleteSale,
    getSalesStats
};