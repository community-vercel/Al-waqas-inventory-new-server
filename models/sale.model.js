// models/sale.model.js - FINAL FIXED VERSION (Deduct from BOTH Inventory & Purchase)
const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
    date: { 
      type: Date, 
      required: true, 
      default: Date.now,
      index: true 
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    color: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Color',
      default: null
    },
    quantity: {
      type: Number,
      required: [true, 'Sale quantity is required'],
      min: [0.5, 'Quantity must be at least 0.5'],
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
    invoiceReference: {
      type: String,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    saleType: {
      type: String,
      enum: ['daily', 'bulk', 'return'],
      default: 'daily'
    }
  },
  { timestamps: true }
);

// Pre-save: Calculate total + generate invoice reference
saleSchema.pre('save', function() {
  this.totalAmount = parseFloat((this.quantity * this.unitPrice * (1 - this.discount / 100)).toFixed(2));
  
  if (!this.invoiceReference) {
    const date = new Date(this.date);
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000);
    this.invoiceReference = `SALE-${dateStr}-${random}`;
  }
});

// POST-SAVE: Deduct from BOTH Inventory AND Purchase (FIFO logic)
saleSchema.post('save', async function(doc) {
  try {
    const Inventory = mongoose.model('Inventory');
    const Purchase = mongoose.model('Purchase');

    const filter = { product: doc.product };
    if (doc.color) filter.color = doc.color;

    let remainingQty = doc.quantity;

    // 1. Deduct from Inventory (current stock)
    await Inventory.findOneAndUpdate(
      filter,
      { 
        $inc: { quantity: -doc.quantity },
        lastUpdated: new Date(),
        updatedBy: doc.createdBy
      },
      { upsert: true }
    );

    // 2. Deduct from Purchase records (FIFO - oldest first)
    const purchases = await Purchase.find(filter)
      .sort({ date: 1 }) // Oldest first
      .select('_id quantity');

    for (const purchase of purchases) {
      if (remainingQty <= 0) break;

      const deduct = Math.min(remainingQty, purchase.quantity);
      await Purchase.findByIdAndUpdate(purchase._id, {
        $inc: { quantity: -deduct }
      });

      remainingQty -= deduct;
    }

    if (remainingQty > 0) {
      console.warn(`Warning: Could not deduct ${remainingQty} units from purchase history (Product ID: ${doc.product})`);
    }

    console.log(`Sale deducted: ${doc.quantity} units from stock & purchase records`);

  } catch (error) {
    console.error('Failed to deduct from inventory/purchase on sale:', error);
  }
});

// POST-DELETE: Restore BOTH Inventory AND Purchase
saleSchema.post('findOneAndDelete', async function(doc) {
  if (!doc) return;

  try {
    const Inventory = mongoose.model('Inventory');
    const Purchase = mongoose.model('Purchase');

    const filter = { product: doc.product };
    if (doc.color) filter.color = doc.color;

    // Restore Inventory
    await Inventory.findOneAndUpdate(
      filter,
      { $inc: { quantity: doc.quantity }, lastUpdated: new Date() }
    );

    // Restore Purchase (FIFO - add back to oldest purchase)
    const oldestPurchase = await Purchase.findOne(filter).sort({ date: 1 });
    if (oldestPurchase) {
      await Purchase.findByIdAndUpdate(oldestPurchase._id, {
        $inc: { quantity: doc.quantity }
      });
    }

    console.log(`Sale deletion restored: ${doc.quantity} units to inventory & purchase`);
  } catch (error) {
    console.error('Failed to restore inventory/purchase on sale delete:', error);
  }
});

// Keep your existing statics and indexes
saleSchema.statics.getDailySummary = async function(date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);

  const result = await this.aggregate([
    { $match: { date: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: null,
        totalSales: { $sum: 1 },
        totalQuantity: { $sum: "$quantity" },
        totalAmount: { $sum: "$totalAmount" },
        averageSaleValue: { $avg: "$totalAmount" }
      }
    }
  ]);

  return result[0] || { totalSales: 0, totalQuantity: 0, totalAmount: 0, averageSaleValue: 0 };
};

saleSchema.index({ date: -1, product: 1 });
saleSchema.index({ product: 1, date: -1 });

module.exports = mongoose.model('Sale', saleSchema);