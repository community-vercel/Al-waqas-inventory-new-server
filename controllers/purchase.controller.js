// controllers/purchase.controller.js - FIXED WITH INVENTORY UPDATE
const mongoose = require('mongoose');
const Purchase = require('../models/purchase.model');
const Product = require('../models/product.model');
const Color = require('../models/color.model');
const Inventory = require('../models/inventory.model'); // Add this import

// @desc    Get all purchases
// @route   GET /api/purchases
// @access  Private
// controllers/purchase.controller.js - FIXED WITH PRODUCT CODE
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
            .populate({
                path: 'product',
                select: 'name type code purchasePrice salePrice description' // ADDED 'code' HERE
            })
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
// @desc    Create new purchase
// @route   POST /api/purchases
// @access  Private
const createPurchase = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

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

        // CREATE PURCHASE
        const purchase = await Purchase.create([purchaseData], { session });

        // UPDATE OR CREATE INVENTORY
        const inventoryFilter = {
            product: product,
            color: color && color !== '' ? color : null
        };

        await Inventory.findOneAndUpdate(
            inventoryFilter,
            { 
                $inc: { quantity: parseInt(quantity) },
                $set: { 
                    lastUpdated: new Date(),
                    updatedBy: req.user.id,
                    minStockLevel: productExists.minStockLevel || 5
                }
            },
            { upsert: true, session, new: true }
        );

        // UPDATE PRODUCT'S LATEST PURCHASE PRICE
        await Product.findByIdAndUpdate(
            product,
            { purchasePrice: parseFloat(unitPrice) },
            { session }
        );

        await session.commitTransaction();

        // Populate response
        const populatedPurchase = await Purchase.findById(purchase[0]._id)
            .populate({
                path: 'product',
                select: 'name type code purchasePrice salePrice'
            })
            .populate('color', 'name hexCode codeName')
            .populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            message: 'Purchase created successfully',
            data: populatedPurchase
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Create purchase error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating purchase',
            error: error.message
        });
    } finally {
        session.endSession();
    }
};

// @desc    Update purchase + Update Product purchasePrice
// @route   PUT /api/purchases/:id
// @access  Private
const updatePurchase = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { quantity, unitPrice, supplier, color, product: newProductId } = req.body;

        const purchase = await Purchase.findById(req.params.id).session(session);
        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: 'Purchase not found'
            });
        }

        const oldQuantity = purchase.quantity;
        const oldProductId = purchase.product;
        const oldColor = purchase.color;
        const totalAmount = quantity * unitPrice;

        const updateData = {
            quantity: parseInt(quantity),
            unitPrice: parseFloat(unitPrice),
            totalAmount,
            supplier: supplier?.trim() || purchase.supplier,
            color: color !== undefined ? (color || null) : purchase.color,
            product: newProductId || purchase.product
        };

        const updatedPurchase = await Purchase.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true, session }
        );

        // Update product's latest purchase price
        if (unitPrice && parseFloat(unitPrice) !== purchase.unitPrice) {
            const productToUpdate = newProductId || purchase.product;
            await Product.findByIdAndUpdate(
                productToUpdate,
                { purchasePrice: parseFloat(unitPrice) },
                { session }
            );
        }

        // INVENTORY ADJUSTMENT LOGIC
        if (newProductId && newProductId !== oldProductId) {
            // PRODUCT CHANGED: Decrease old product inventory, increase new product inventory
            if (oldProductId) {
                await Inventory.findOneAndUpdate(
                    { product: oldProductId, color: oldColor },
                    { $inc: { quantity: -oldQuantity } },
                    { session }
                );
            }
            
            if (newProductId) {
                await Inventory.findOneAndUpdate(
                    { product: newProductId, color: color || null },
                    { $inc: { quantity: parseInt(quantity) } },
                    { upsert: true, session }
                );
            }
        } else if (quantity !== oldQuantity) {
            // SAME PRODUCT, QUANTITY CHANGED: Adjust inventory
            const qtyDiff = quantity - oldQuantity;
            await Inventory.findOneAndUpdate(
                { product: purchase.product, color: color || purchase.color || null },
                { $inc: { quantity: qtyDiff } },
                { session }
            );
        } else if (color !== undefined && color !== oldColor) {
            // COLOR CHANGED: Move inventory between colors
            if (oldColor) {
                await Inventory.findOneAndUpdate(
                    { product: purchase.product, color: oldColor },
                    { $inc: { quantity: -oldQuantity } },
                    { session }
                );
            }
            
            await Inventory.findOneAndUpdate(
                { product: purchase.product, color: color || null },
                { $inc: { quantity: oldQuantity } },
                { upsert: true, session }
            );
        }

        await session.commitTransaction();

        // Populate response
        const populatedPurchase = await Purchase.findById(req.params.id)
            .populate({
                path: 'product',
                select: 'name type code purchasePrice salePrice'
            })
            .populate('color', 'name hexCode codeName')
            .populate('createdBy', 'name email');

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
// @desc    Delete purchase
// @route   DELETE /api/purchases/:id
// @access  Private
const deletePurchase = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const purchase = await Purchase.findById(req.params.id).session(session);

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: 'Purchase not found'
            });
        }

        // DECREASE INVENTORY BEFORE DELETING PURCHASE
        const inventoryFilter = {
            product: purchase.product,
            color: purchase.color || null
        };

        await Inventory.findOneAndUpdate(
            inventoryFilter,
            { 
                $inc: { quantity: -purchase.quantity }, // SUBTRACT quantity
                $set: { 
                    lastUpdated: new Date(),
                    updatedBy: req.user.id
                }
            },
            { session }
        );

        // DELETE THE PURCHASE
        await Purchase.findByIdAndDelete(req.params.id, { session });

        await session.commitTransaction();

        res.json({
            success: true,
            message: 'Purchase deleted successfully and inventory updated'
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Delete purchase error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting purchase',
            error: error.message
        });
    } finally {
        session.endSession();
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