const mongoose = require('mongoose');
const Sale = require('../models/sale.model');
const Inventory = require('../models/inventory.model');
const Product = require('../models/product.model');
const Color = require('../models/color.model');

// @desc    Create new sale (without customer)
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res) => {
  try {
    const { product, quantity, unitPrice, discount = 0, color, date } = req.body;

    console.log('Creating sale:', { product, quantity, unitPrice, discount });

    // REQUIRED FIELDS (no customer name needed)
    if (!product || !quantity || !unitPrice) {
      return res.status(400).json({
        success: false,
        message: 'Please provide: product, quantity, unitPrice'
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

    // Check stock availability
    const stockFilter = { product };
    if (color) stockFilter.color = color;
    
    const inventoryItem = await Inventory.findOne(stockFilter);
    if (!inventoryItem || inventoryItem.quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${inventoryItem ? inventoryItem.quantity : 0}`
      });
    }

    // Calculate total
    const subtotal = quantity * unitPrice;
    const discountAmount = subtotal * (discount / 100);
    const totalAmount = parseFloat((subtotal - discountAmount).toFixed(2));

    const saleData = {
      product,
      color: color || null,
      quantity: parseInt(quantity),
      unitPrice: parseFloat(unitPrice),
      discount: parseFloat(discount),
      totalAmount,
      createdBy: req.user.id,
      date: date ? new Date(date) : new Date()
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
      message: 'Sale recorded successfully!',
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

// @desc    Create multiple sales at once
// @route   POST /api/sales/bulk
// @access  Private
const createBulkSales = async (req, res) => {
  try {
    const salesData = req.body; // Array of sale objects
    const createdSales = [];
    const errors = [];

    for (const saleItem of salesData) {
      try {
        const { product, quantity, unitPrice, discount = 0, color } = saleItem;

        if (!product || !quantity || !unitPrice) {
          errors.push({ item: saleItem, error: 'Missing required fields' });
          continue;
        }

        // Check stock
        const stockFilter = { product };
        if (color) stockFilter.color = color;
        
        const inventoryItem = await Inventory.findOne(stockFilter);
        if (!inventoryItem || inventoryItem.quantity < quantity) {
          errors.push({ 
            item: saleItem, 
            error: `Insufficient stock for product ${product}` 
          });
          continue;
        }

        // Calculate total
        const subtotal = quantity * unitPrice;
        const discountAmount = subtotal * (discount / 100);
        const totalAmount = parseFloat((subtotal - discountAmount).toFixed(2));

        const sale = await Sale.create({
          product,
          color: color || null,
          quantity: parseInt(quantity),
          unitPrice: parseFloat(unitPrice),
          discount: parseFloat(discount),
          totalAmount,
          createdBy: req.user.id,
          date: new Date()
        });

        const populatedSale = await Sale.findById(sale._id)
          .populate('product', 'name type code salePrice')
          .populate('color', 'name codeName hexCode');

        createdSales.push(populatedSale);
      } catch (error) {
        errors.push({ item: saleItem, error: error.message });
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdSales.length} sales, ${errors.length} failed`,
      data: createdSales,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Bulk create error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating bulk sales',
      error: error.message
    });
  }
};

// @desc    Get all sales (with date filtering)
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res) => {
  try {
    const { startDate, endDate, product, page = 1, limit = 20 } = req.query;
    
    let filter = {};
    
    // Date filter (for daily sales view)
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    } else {
      // Default to today if no date specified
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      filter.date = { $gte: today, $lt: tomorrow };
    }

    if (product) {
      filter.product = product;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [sales, total] = await Promise.all([
      Sale.find(filter)
        .populate('product', 'name type code salePrice')
        .populate('color', 'name codeName hexCode')
        .populate('createdBy', 'name email')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limitNum),
      Sale.countDocuments(filter)
    ]);

    const totalAmount = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const totalQuantity = sales.reduce((sum, sale) => sum + sale.quantity, 0);

    res.json({
      success: true,
      count: sales.length,
      total,
      totalAmount,
      totalQuantity,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
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

// @desc    Get sales for specific date
// @route   GET /api/sales/daily/:date
// @access  Private
const getDailySales = async (req, res) => {
  try {
    const { date } = req.params;
    const targetDate = new Date(date);
    
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

    const sales = await Sale.find({
      date: { $gte: startDate, $lte: endDate }
    })
    .populate('product', 'name type code salePrice')
    .populate('color', 'name codeName hexCode')
    .populate('createdBy', 'name email')
    .sort({ date: 1 }); // Sort by time ascending

    const summary = await Sale.getDailySummary(date);

    res.json({
      success: true,
      date: targetDate.toISOString().split('T')[0],
      count: sales.length,
      summary: {
        ...summary,
        date: targetDate.toISOString().split('T')[0]
      },
      data: sales
    });
  } catch (error) {
    console.error('Get daily sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching daily sales',
      error: error.message
    });
  }
};

// @desc    Get daily summary
// @route   GET /api/sales/summary/:date
// @access  Private
const getDailySummary = async (req, res) => {
  try {
    const { date } = req.params;
    const summary = await Sale.getDailySummary(date);

    res.json({
      success: true,
      date,
      data: summary
    });
  } catch (error) {
    console.error('Get daily summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching daily summary',
      error: error.message
    });
  }
};

// @desc    Get sales by date range
// @route   GET /api/sales/date-range
// @access  Private
const getSalesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide startDate and endDate (YYYY-MM-DD)'
      });
    }

    const sales = await Sale.getSalesByDateRange(startDate, endDate);
    const summary = sales.reduce((acc, sale) => ({
      totalSales: acc.totalSales + 1,
      totalQuantity: acc.totalQuantity + sale.quantity,
      totalAmount: acc.totalAmount + sale.totalAmount
    }), { totalSales: 0, totalQuantity: 0, totalAmount: 0 });

    res.json({
      success: true,
      summary,
      count: sales.length,
      data: sales
    });
  } catch (error) {
    console.error('Get sales by date range error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sales by date range',
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
};

// @desc    Get sales statistics
// @route   GET /api/sales/stats
// @access  Private
const getSalesStats = async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    
    let startDate = new Date();
    let periodName = 'Today';
    
    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        periodName = 'Today';
        break;
      case 'yesterday':
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        periodName = 'Yesterday';
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        periodName = 'Last 7 Days';
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        periodName = 'Last 30 Days';
        break;
      default:
        startDate.setHours(0, 0, 0, 0);
    }

    const endDate = new Date();

    const sales = await Sale.find({ 
      date: { $gte: startDate, $lte: endDate } 
    });

    const totalSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalItems = sales.reduce((sum, s) => sum + s.quantity, 0);

    // Get top products
    const productSales = {};
    sales.forEach(sale => {
      const productId = sale.product.toString();
      if (!productSales[productId]) {
        productSales[productId] = {
          quantity: 0,
          amount: 0
        };
      }
      productSales[productId].quantity += sale.quantity;
      productSales[productId].amount += sale.totalAmount;
    });

    // Convert to array and sort
    const topProducts = Object.entries(productSales)
      .map(([productId, stats]) => ({ productId, ...stats }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Populate product names
    for (const product of topProducts) {
      const productDoc = await Product.findById(product.productId);
      product.productName = productDoc ? productDoc.name : 'Unknown';
      product.productCode = productDoc ? productDoc.code : '';
    }

    res.json({
      success: true,
      period: periodName,
      data: {
        totalSales,
        totalItems,
        totalTransactions: sales.length,
        averageSale: sales.length > 0 ? totalSales / sales.length : 0,
        topProducts
      }
    });
  } catch (error) {
    console.error('Get sales stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};
// @desc    Get ALL sales for a specific date (NO PAGINATION - for daily view)
// @route   GET /api/sales/daily-all?date=2025-04-05
// @access  Private
const getAllSalesForDate = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const sales = await Sale.find({
      date: { $gte: startDate, $lte: endDate }
    })
      .populate('product', 'name type code salePrice discount')
      .populate('color', 'name codeName hexCode')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 }); // Newest first

    res.json({
      success: true,
      count: sales.length,
      data: sales
    });
  } catch (error) {
    console.error('Error fetching all sales for date:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getSales,
  createSale,
  createBulkSales,
  deleteSale,
  getSalesStats,
  getDailySales,
  getDailySummary,
  getSalesByDateRange,
  getAllSalesForDate
};