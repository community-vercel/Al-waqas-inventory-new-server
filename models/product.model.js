// models/product.model.js - UPGRADED WITH INITIAL STOCK + CODE
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    type: {
        type: String,
        enum: ['gallon', 'dibbi', 'quarter', 'p', 'other', 'drum'],
        required: [true, 'Product type is required']
    },
    purchasePrice: {
        type: Number,
        required: [true, 'Purchase price is required'],
        min: 0
    },
    salePrice: {
        type: Number,
        required: [true, 'Sale price is required'],
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    code: {
        type: String,
        trim: true,
        uppercase: true,
        default: null,
        sparse: true  // Allows multiple nulls + unique if needed later
        // unique: true → you can enable later if needed
    },
  
    initialStock: {
        type: Map,
        of: {
            qty: { type: Number, min: 0, default: 0 },
            addedAt: { type: Date, default: Date.now }
        },
        default: () => new Map()
        // This will store: colorId → { qty: 50, addedAt: Date }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Indexes
productSchema.index({ name: 1, type: 1, isActive: 1 });
productSchema.index({ code: 1 }, { sparse: true });

module.exports = mongoose.model('Product', productSchema);