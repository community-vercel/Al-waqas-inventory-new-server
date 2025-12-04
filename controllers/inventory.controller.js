const Inventory = require('../models/inventory.model');
const Product = require('../models/product.model');

// GET ALL INVENTORY — INCLUDING ZERO STOCK
const getInventory = async (req, res) => {
  try {
    // First get ALL products (active only)
    const products = await Product.find({ isActive: true }).select('_id name type code purchasePrice');

    // Then get existing inventory entries
    const inventoryEntries = await Inventory.find()
      .populate({
        path: 'product',
        select: 'name type code purchasePrice'
      })
      .populate({
        path: 'color',
        select: 'name codeName hexCode'
      })
      .populate('updatedBy', 'name email');

    // Create a map of productId → inventory entry
    const inventoryMap = new Map();
    inventoryEntries.forEach(item => {
      inventoryMap.set(item.product._id.toString(), item);
    });

    // Build final list: every product appears, even if no inventory entry
    const fullInventory = products.map(product => {
      const existing = inventoryMap.get(product._id.toString());
      
      if (existing) {
        return existing; 
      }

      // No inventory record → create virtual one with qty = 0
      return {
        _id: `virtual-${product._id}`,
        product: product,
        color: null,
        quantity: 0,
        minStockLevel: 5,
        lastUpdated: null,
        updatedBy: null,
        isVirtual: true 
      };
    });

    // Sort by product name
    fullInventory.sort((a, b) => {
      const nameA = a.product?.name || '';
      const nameB = b.product?.name || '';
      return nameA.localeCompare(nameB);
    });

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