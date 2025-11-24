// models/color.model.js
const mongoose = require('mongoose');

const colorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Color name is required'],
        trim: true,
        unique: true
    },
    codeName: {
        type: String,
        required: [true, 'Code name is required'],
        trim: true,
        unique: true,
        uppercase: true
    },
    hexCode: {
        type: String,
        required: [true, 'Hex code is required'],
        match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please enter a valid hex color code']
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

module.exports = mongoose.model('Color', colorSchema);