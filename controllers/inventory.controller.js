const Inventory = require('../models/inventory.model');
const Product = require('../models/product.model');
const Color = require('../models/color.model'); // MUST BE HERE
// GET ALL INVENTORY — INCLUDING ZERO STOCK
// GET ALL INVENTORY — INCLUDING ZERO STOCK + AUTO COLOR MATCHING BY CODE
const getInventory = async (req, res) => {
  try {
    // 1. Get all active products
    const products = await Product.find({ isActive: true }).select('_id name type code purchasePrice');

    // 2. Get all colors and build codeName → color map
    const colors = await Color.find({ isActive: true });
    const colorMap = new Map();
    colors.forEach(color => {
      if (color.codeName) {
        colorMap.set(color.codeName.trim().toUpperCase(), color);
      }
    });

    // 3. Get real inventory entries
    const inventoryEntries = await Inventory.find()
      .populate('product', 'name type code purchasePrice')
      .populate('color', 'name codeName hexCode')
      .populate('updatedBy', 'name email');

    // 4. Build final list with auto color matching
    const fullInventory = products.map(product => {
      const productCode = product.code?.trim().toUpperCase();

      // Find if there's a real inventory entry for this product
      const realEntry = inventoryEntries.find(entry => 
        entry.product._id.toString() === product._id.toString()
      );

      if (realEntry) {
        return realEntry; // Real entry wins — use its color (even if null)
      }

      // No real entry → create virtual one
      const matchedColor = productCode ? colorMap.get(productCode) : null;

      return {
        _id: `virtual-${product._id}`,
        product: product,
        color: matchedColor || null,  // AUTO-MATCHED COLOR HERE
        quantity: 0,
        minStockLevel: 5,
        lastUpdated: null,
        updatedBy: null,
        isVirtual: true
      };
    });

    // Sort by name
    fullInventory.sort((a, b) => (a.product?.name || '').localeCompare(b.product?.name || ''));

    res.json({
      success: true,
      count: fullInventory.length,
      data: fullInventory
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

// GET LOW STOCK — ONLY REAL ENTRIES
const getLowStock = async (req, res) => {
  try {
    const lowStock = await Inventory.find({
      $expr: { $lte: ['$quantity', '$minStockLevel'] },
      quantity: { $gt: 0 } 
    })
      .populate('product', 'name type code purchasePrice')
      .populate('color', 'name codeName hexCode')
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

// UPDATE INVENTORY
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
      .populate('product', 'name type code purchasePrice')
      .populate('color', 'name codeName hexCode')
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