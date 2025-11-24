// models/sale.model.js - FINAL WITH RETRY ON CONFLICT
const mongoose = require('mongoose');

// Same retry helper as above
const withRetry = async (operation, maxRetries = 5) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      const isWriteConflict =
        error.code === 112 ||
        error.codeName === 'WriteConflict' ||
        error.errorLabels?.includes('TransientTransactionError');

      if (isWriteConflict && i < maxRetries - 1) {
        await new Promise((res) => setTimeout(res, 100 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
};

const saleSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [100, 'Customer name cannot exceed 100 characters'],
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    color: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Color',
      required: [true, 'Color is required'],
    },
    quantity: {
      type: Number,
      required: [true, 'Sale quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative'],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
      max: [100, 'Discount cannot exceed 100%'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Deduct inventory on sale
saleSchema.post('save', async function (doc) {
  try {
    await withRetry(async () => {
      const Inventory = mongoose.model('Inventory');
      const filter = { product: doc.product, color: doc.color };

      const result = await Inventory.findOneAndUpdate(
        filter,
        {
          $inc: { quantity: -doc.quantity },
          lastUpdated: new Date(),
          updatedBy: doc.createdBy,
        },
        { new: true }
      );

      if (!result) {
        throw new Error('Inventory not found for this product+color');
      }
    });
    console.log('Inventory deducted for sale:', doc._id);
  } catch (error) {
    console.error('Failed to deduct inventory (sale):', error.message);
  }
});

// Restore inventory on sale deletion
saleSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) return;
  try {
    await withRetry(async () => {
      const Inventory = mongoose.model('Inventory');
      const filter = { product: doc.product, color: doc.color };

      await Inventory.findOneAndUpdate(
        filter,
        {
          $inc: { quantity: doc.quantity },
          lastUpdated: new Date(),
        }
      );
    });
    console.log('Inventory restored after sale deletion:', doc._id);
  } catch (error) {
    console.error('Failed to restore inventory (sale delete):', error.message);
  }
});

// Indexes
saleSchema.index({ date: -1 });
saleSchema.index({ product: 1 });
saleSchema.index({ color: 1 });
saleSchema.index({ customerName: 1 });

module.exports = mongoose.model('Sale', saleSchema);