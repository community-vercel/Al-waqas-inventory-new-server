// controllers/color.controller.js
const Color = require('../models/color.model');
const csv = require('csv-parser');
const stream = require('stream');

// @desc    Get all colors
// @route   GET /api/colors
// @access  Private
const getColors = async (req, res) => {
    try {
        const colors = await Color.find({ isActive: true })
            .populate('createdBy', 'name email')
            .sort({ name: 1 });

        res.json({
            success: true,
            count: colors.length,
            data: colors
        });
    } catch (error) {
        console.error('Get colors error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching colors',
            error: error.message
        });
    }
};

// @desc    Create new color
// @route   POST /api/colors
// @access  Private
const createColor = async (req, res) => {
    try {
        const { name, codeName, hexCode } = req.body;

        // Check if color with same hex code already exists
        const existingColor = await Color.findOne({ 
            hexCode: hexCode.toUpperCase(),
            isActive: true
        });

        if (existingColor) {
            return res.status(400).json({
                success: false,
                message: 'Color with this hex code already exists'
            });
        }

        const color = await Color.create({
            name,
            codeName: codeName.toUpperCase(),
            hexCode: hexCode.toUpperCase(),
            createdBy: req.user.id
        });

        await color.populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            message: 'Color created successfully',
            data: color
        });
    } catch (error) {
        console.error('Create color error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating color',
            error: error.message
        });
    }
};

// @desc    Upload colors from CSV
// @route   POST /api/colors/upload-csv
// @access  Private
const uploadColorsFromCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No CSV file uploaded'
            });
        }

        const results = [];
        const errors = [];
        let rowCount = 0;
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        // Parse CSV
        await new Promise((resolve, reject) => {
            bufferStream
                .pipe(csv())
                .on('data', (data) => {
                    rowCount++;
                    
                    // Skip empty rows
                    if (!data.name && !data.codeName && !data.hexCode) {
                        return;
                    }

                    // Validate CSV structure - check for all required fields
                    const missingFields = [];
                    if (!data.name || data.name.trim() === '') missingFields.push('name');
                    if (!data.codeName || data.codeName.trim() === '') missingFields.push('codeName');
                    if (!data.hexCode || data.hexCode.trim() === '') missingFields.push('hexCode');

                    if (missingFields.length > 0) {
                        errors.push({
                            row: rowCount,
                            error: `Missing required fields: ${missingFields.join(', ')}`,
                            data
                        });
                        return;
                    }

                    // Validate hex code format
                    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                    if (!hexRegex.test(data.hexCode.trim())) {
                        errors.push({
                            row: rowCount,
                            error: `Invalid hex code format: ${data.hexCode}`,
                            data
                        });
                        return;
                    }

                    // Validate that fields are not just whitespace
                    if (data.name.trim() === '' || data.codeName.trim() === '' || data.hexCode.trim() === '') {
                        errors.push({
                            row: rowCount,
                            error: 'Fields cannot be empty or just whitespace',
                            data
                        });
                        return;
                    }

                    results.push({
                        name: data.name.trim(),
                        codeName: data.codeName.trim().toUpperCase(),
                        hexCode: data.hexCode.toUpperCase(),
                        createdBy: req.user.id
                    });
                })
                .on('end', resolve)
                .on('error', reject);
        });

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: `CSV validation failed - ${errors.length} error(s) found`,
                errors: errors.slice(0, 10),
                totalErrors: errors.length
            });
        }

        if (results.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid color data found in CSV file'
            });
        }

        // Check for duplicate HEX CODES in the CSV itself (only check hex codes)
        const seenHexCodes = new Set();
        const hexCodeDuplicates = [];

        results.forEach((item, index) => {
            if (seenHexCodes.has(item.hexCode)) {
                hexCodeDuplicates.push({
                    row: index + 2,
                    error: `Duplicate hex code in CSV: ${item.hexCode}`,
                    data: item
                });
            }
            seenHexCodes.add(item.hexCode);
        });

        if (hexCodeDuplicates.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Duplicate hex codes found in CSV',
                duplicates: hexCodeDuplicates.slice(0, 10),
                totalDuplicates: hexCodeDuplicates.length
            });
        }

        // Check for existing colors in database (ONLY check hex codes)
        const existingColors = await Color.find({
            hexCode: { $in: results.map(r => r.hexCode) },
            isActive: true
        });

        // Create set of existing hex codes for quick lookup
        const existingHexCodes = new Set(existingColors.map(c => c.hexCode));

        // Filter out colors that already exist (based on hex code only)
        const newColors = [];
        const skippedColors = [];

        results.forEach(item => {
            const exists = existingHexCodes.has(item.hexCode);

            if (exists) {
                skippedColors.push({
                    name: item.name,
                    codeName: item.codeName,
                    hexCode: item.hexCode,
                    reason: 'Color with this hex code already exists in database'
                });
            } else {
                newColors.push(item);
            }
        });

        if (newColors.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'All colors in the CSV already exist in the database (duplicate hex codes)',
                skipped: skippedColors,
                summary: {
                    totalRows: rowCount,
                    validRows: results.length,
                    skipped: skippedColors.length,
                    imported: 0
                }
            });
        }

        // Insert only new colors
        const createdColors = await Color.insertMany(newColors);
        
        // Populate createdBy field
        await Color.populate(createdColors, { path: 'createdBy', select: 'name email' });

        res.status(201).json({
            success: true,
            message: `Successfully imported ${createdColors.length} colors, skipped ${skippedColors.length} existing colors (duplicate hex codes)`,
            data: createdColors,
            skipped: skippedColors,
            summary: {
                totalRows: rowCount,
                validRows: results.length,
                imported: createdColors.length,
                skipped: skippedColors.length,
                failed: rowCount - results.length
            }
        });

    } catch (error) {
        console.error('Upload CSV error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing CSV file',
            error: error.message
        });
    }
};

// @desc    Update color
// @route   PUT /api/colors/:id
// @access  Private
const updateColor = async (req, res) => {
    try {
        const { hexCode } = req.body;

        // If updating hex code, check for duplicates
        if (hexCode) {
            const existingColor = await Color.findOne({
                hexCode: hexCode.toUpperCase(),
                isActive: true,
                _id: { $ne: req.params.id } // Exclude current color
            });

            if (existingColor) {
                return res.status(400).json({
                    success: false,
                    message: 'Another color with this hex code already exists'
                });
            }
        }

        const color = await Color.findByIdAndUpdate(
            req.params.id,
            {
                ...req.body,
                codeName: req.body.codeName ? req.body.codeName.toUpperCase() : undefined,
                hexCode: req.body.hexCode ? req.body.hexCode.toUpperCase() : undefined
            },
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email');

        if (!color) {
            return res.status(404).json({
                success: false,
                message: 'Color not found'
            });
        }

        res.json({
            success: true,
            message: 'Color updated successfully',
            data: color
        });
    } catch (error) {
        console.error('Update color error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating color',
            error: error.message
        });
    }
};

// @desc    Delete color
// @route   DELETE /api/colors/:id
// @access  Private
const deleteColor = async (req, res) => {
    try {
        const color = await Color.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!color) {
            return res.status(404).json({
                success: false,
                message: 'Color not found'
            });
        }

        res.json({
            success: true,
            message: 'Color deleted successfully'
        });
    } catch (error) {
        console.error('Delete color error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting color',
            error: error.message
        });
    }
};

module.exports = {
    getColors,
    createColor,
    updateColor,
    deleteColor,
    uploadColorsFromCSV
};