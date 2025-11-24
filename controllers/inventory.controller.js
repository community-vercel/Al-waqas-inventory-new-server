// controllers/inventory.controller.js - FINAL 100% WORKING
const Inventory = require('../models/inventory.model');

const getInventory = async (req, res) => {
  try {
    const inventory = await Inventory.find()
      .populate('product', 'name type purchasePrice')
      .populate('color', 'name codeName hexCode')  // Correct
      .populate('updatedBy', 'name email')
      .sort({ 'product.name': 1 });

    res.json({
      success: true,
      count: inventory.length,
      data: inventory
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inventory',
      error: error.message
    });
  }
};

const getLowStock = async (req, res) => {
  try {
    const lowStock = await Inventory.find({
      $expr: { $lte: ['$quantity', '$minStockLevel'] }
    })
      .populate('product', 'name type purchasePrice')
      .populate('color', 'name codeName hexCode')  // Correct
      .populate('updatedBy', 'name email')
      .sort({ quantity: 1 });

    res.json({
      success: true,
      count: lowStock.length,
      data: lowStock
    });
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching low stock items',
      error: error.message
    });
  }
};

// FIXED: Use correct populate chain
const updateInventory = async (req, res) => {
  try {
    const { quantity, minStockLevel } = req.body;

    const inventory = await Inventory.findByIdAndUpdate(
      req.params.id,
      {
        quantity,
        minStockLevel,
        lastUpdated: new Date(),
        updatedBy: req.user.id
      },
      { new: true, runValidators: true }
    )
      .populate('product', 'name type purchasePrice')
      .populate('color', 'name codeName hexCode')  // Fixed: was wrong before
      .populate('updatedBy', 'name email');

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    res.json({
      success: true,
      message: 'Inventory updated successfully',
      data: inventory
    });
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating inventory',
      error: error.message
    });
  }
};

module.exports = {
  getInventory,
  getLowStock,
  updateInventory
};