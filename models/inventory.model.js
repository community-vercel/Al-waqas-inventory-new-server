// models/inventory.model.js - FINAL FIXED VERSION
const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
   color: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Color',
        default: null  // null = no color (accessories, etc.)
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    minStockLevel: {
        type: Number,
        min: 0,
        default: 5
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// CRITICAL: One inventory record per product + color combination
inventorySchema.index({ product: 1, color: 1 }, { unique: true });

// Optional: helpful for queries
inventorySchema.index({ quantity: 1 });

module.exports = mongoose.model('Inventory', inventorySchema);