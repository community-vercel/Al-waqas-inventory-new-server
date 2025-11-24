// models/product.model.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    type: {
        type: String,
        enum: ['gallon', 'dibbi', 'quarter', 'p'],
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
    colors: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Color',
            required: true
        }],
        validate: {
            validator: function(colorsArray) {
                return colorsArray && colorsArray.length > 0;
            },
            message: 'At least one color is required'
        },
        required: [true, 'Colors array is required']
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

// Index for better query performance
productSchema.index({ name: 1, type: 1, isActive: 1 });

module.exports = mongoose.model('Product', productSchema);