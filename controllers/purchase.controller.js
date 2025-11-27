// controllers/purchase.controller.js - FIXED WITH INVENTORY UPDATE
const mongoose = require('mongoose');
const Purchase = require('../models/purchase.model');
const Product = require('../models/product.model');
const Color = require('../models/color.model');
const Inventory = require('../models/inventory.model'); // Add this import

// @desc    Get all purchases
// @route   GET /api/purchases
// @access  Private
const getPurchases = async (req, res) => {
    try {
        const { startDate, endDate, supplier, product } = req.query;
        
        let filter = {};
        
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        if (supplier) {
            filter.supplier = { $regex: supplier, $options: 'i' };
        }

        if (product) {
            filter.product = product;
        }

        const purchases = await Purchase.find(filter)
            .populate('product', 'name type purchasePrice salePrice')
            .populate('color', 'name hexCode')
            .populate('createdBy', 'name email')
            .sort({ date: -1 });

        const totalAmount = purchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);

        res.json({
            success: true,
            count: purchases.length,
            totalAmount,
            data: purchases
        });
    } catch (error) {
        console.error('Get purchases error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching purchases',
            error: error.message
        });
    }
};

// @desc    Create new purchase
// @route   POST /api/purchases
// @access  Private
// controllers/purchase.controller.js - FINAL CLEAN VERSION
const createPurchase = async (req, res) => {
    try {
        const { product, supplier, quantity, unitPrice, color } = req.body;

        console.log('Creating purchase with data:', { product, supplier, quantity, unitPrice, color });

        // Validate required fields
        if (!product || !supplier || !quantity || !unitPrice) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: product, supplier, quantity, unitPrice'
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

        // Validate color if provided
        if (color && color !== '') {
            const colorExists = await Color.findById(color);
            if (!colorExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Color not found'
                });
            }
        }

        const totalAmount = quantity * unitPrice;

        const purchaseData = {
            product,
            supplier: supplier.trim(),
            quantity: parseInt(quantity),
            unitPrice: parseFloat(unitPrice),
            totalAmount,
            createdBy: req.user.id,
            color: color && color !== '' ? color : null
        };

        // ONLY CREATE PURCHASE — MIDDLEWARE WILL HANDLE INVENTORY
        const purchase = await Purchase.create(purchaseData);

        // Populate response
        const populatedPurchase = await Purchase.findById(purchase._id)
            .populate('product', 'name type purchasePrice salePrice')
            .populate('color', 'name hexCode')
            .populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            message: 'Purchase created successfully',
            data: populatedPurchase
        });

    } catch (error) {
        console.error('Create purchase error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating purchase',
            error: error.message
        });
    }
};

// @desc    Update purchase + Update Product purchasePrice
// @route   PUT /api/purchases/:id
// @access  Private
const updatePurchase = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { quantity, unitPrice, supplier, color, product: productId } = req.body;

        const purchase = await Purchase.findById(req.params.id);
        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: 'Purchase not found'
            });
        }

        // === 1. Update the Purchase record ===
        const oldQuantity = purchase.quantity;
        const totalAmount = quantity * unitPrice;

        const updateData = {
            quantity: parseInt(quantity),
            unitPrice: parseFloat(unitPrice),
            totalAmount,
            supplier: supplier?.trim() || purchase.supplier,
        };

        if (color !== undefined) {
            updateData.color = color || null;
        }

        const updatedPurchase = await Purchase.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).populate('product', 'name type purchasePrice salePrice');

        // === 2. CRITICAL: Update Product's purchasePrice if unitPrice changed ===
        if (unitPrice && parseFloat(unitPrice) !== purchase.unitPrice) {
            await Product.findByIdAndUpdate(
                purchase.product,
                { purchasePrice: parseFloat(unitPrice) },
                { session }
            );
        }

        // === 3. Adjust Inventory Quantity (if quantity changed) ===
        if (quantity !== oldQuantity) {
            const qtyDiff = quantity - oldQuantity;

            // Find or create inventory entry
            const inventoryFilter = {
                product: purchase.product,
                color: color || null
            };

            await Inventory.findOneAndUpdate(
                inventoryFilter,
                { $inc: { quantity: qtyDiff }, lastUpdated: new Date(), updatedBy: req.user.id },
                { upsert: true, new: true, session }
            );
        }

        await session.commitTransaction();

        // Populate final purchase
        const populatedPurchase = await Purchase.findById(req.params.id)
            .populate('product', 'name type purchasePrice salePrice')
            .populate('color', 'name hexCode codeName')
            .populate('createdBy', 'name email');

        // === 4. Trigger real-time update in frontend ===
        // This will make Inventory.jsx refresh immediately
        setTimeout(() => {
            window.dispatchEvent(new Event('inventoryShouldUpdate'));
            localStorage.setItem('inventoryLastUpdate', Date.now().toString());
        }, 100);

        res.json({
            success: true,
            message: 'Purchase updated successfully and inventory synced',
            data: populatedPurchase
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Update purchase error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating purchase',
            error: error.message
        });
    } finally {
        session.endSession();
    }
};
// @desc    Delete purchase
// @route   DELETE /api/purchases/:id
// @access  Private
const deletePurchase = async (req, res) => {
    try {
        const purchase = await Purchase.findById(req.params.id);

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: 'Purchase not found'
            });
        }

        await Purchase.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Purchase deleted successfully'
        });
    } catch (error) {
        console.error('Delete purchase error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting purchase',
            error: error.message
        });
    }
};

// @desc    Get purchase statistics
// @route   GET /api/purchases/stats
// @access  Private
const getPurchaseStats = async (req, res) => {
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

        const purchases = await Purchase.find({
            date: { $gte: startDate }
        });

        const totalPurchases = purchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0);
        const totalItems = purchases.reduce((sum, purchase) => sum + purchase.quantity, 0);

        res.json({
            success: true,
            data: {
                totalPurchases,
                totalItems,
                totalOrders: purchases.length,
                averagePurchase: purchases.length > 0 ? totalPurchases / purchases.length : 0
            }
        });
    } catch (error) {
        console.error('Get purchase stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching purchase statistics',
            error: error.message
        });
    }
};

module.exports = {
    getPurchases,
    createPurchase,
    updatePurchase,
    deletePurchase,
    getPurchaseStats
};