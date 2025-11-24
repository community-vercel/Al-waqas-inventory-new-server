// models/expense.model.js
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: [true, 'Expense date is required'],
        default: Date.now
    },
    description: {
        type: String,
        required: [true, 'Expense description is required'],
        trim: true
    },
    amount: {
        type: Number,
        required: [true, 'Expense amount is required'],
        min: 0
    },
    category: {
        type: String,
        enum: ['rent', 'utilities', 'salary', 'maintenance', 'other'],
        default: 'other'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Index for date-based queries
expenseSchema.index({ date: -1 });

module.exports = mongoose.model('Expense', expenseSchema);