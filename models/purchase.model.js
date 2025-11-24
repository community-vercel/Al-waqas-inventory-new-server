// models/purchase.model.js - FINAL WITH RETRY ON CONFLICT
const mongoose = require('mongoose');

// Helper: retry on WriteConflict (code 112) or TransientTransactionError
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
        // Exponential backoff
        await new Promise((res) => setTimeout(res, 100 * (i + 1)));
        continue;
      }
      throw error; // Re-throw if not retryable or max retries reached
    }
  }
};

const purchaseSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'Purchase date is required'],
      default: Date.now,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    color: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Color',
      required: false,
    },
    supplier: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true,
      maxlength: [100, 'Supplier name cannot exceed 100 characters'],
    },
    quantity: {
      type: Number,
      required: [true, 'Purchase quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative'],
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

// Auto-sync inventory on save (create or update)
purchaseSchema.post('save', async function (doc) {
  try {
    await withRetry(async () => {
      const Inventory = mongoose.model('Inventory');
      const filter = { product: doc.product };
      if (doc.color) filter.color = doc.color;

      await Inventory.findOneAndUpdate(
        filter,
        {
          $inc: { quantity: doc.quantity },
          lastUpdated: new Date(),
          updatedBy: doc.createdBy,
        },
        { upsert: true, new: true }
      );
    });
    console.log('Inventory updated successfully for purchase:', doc._id);
  } catch (error) {
    console.error('Failed to update inventory (purchase save):', error.message);
  }
});

// Auto-revert inventory on delete
purchaseSchema.post('findOneAndDelete', async function (doc) {
  if (!doc) return;
  try {
    await withRetry(async () => {
      const Inventory = mongoose.model('Inventory');
      const filter = { product: doc.product };
      if (doc.color) filter.color = doc.color;

      await Inventory.findOneAndUpdate(
        filter,
        {
          $inc: { quantity: -doc.quantity },
          lastUpdated: new Date(),
        }
      );
    });
    console.log('Inventory reverted after purchase deletion:', doc._id);
  } catch (error) {
    console.error('Failed to revert inventory (purchase delete):', error.message);
  }
});

// Indexes
purchaseSchema.index({ date: -1 });
purchaseSchema.index({ product: 1 });
purchaseSchema.index({ supplier: 1 });
purchaseSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Purchase', purchaseSchema);