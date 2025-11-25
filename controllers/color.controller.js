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

        // Check if color with same name, codeName, or hexCode already exists
        const existingColor = await Color.findOne({
            $or: [
                { name: new RegExp(`^${name}$`, 'i'), isActive: true },
                { codeName: codeName.toUpperCase(), isActive: true },
                { hexCode: hexCode.toUpperCase(), isActive: true }
            ]
        });

        if (existingColor) {
            let duplicateField = '';
            if (existingColor.name.toLowerCase() === name.toLowerCase()) {
                duplicateField = 'name';
            } else if (existingColor.codeName === codeName.toUpperCase()) {
                duplicateField = 'code name';
            } else if (existingColor.hexCode === hexCode.toUpperCase()) {
                duplicateField = 'hex code';
            }

            return res.status(400).json({
                success: false,
                message: `Color with this ${duplicateField} already exists`
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

        // if (results.length === 0) {
        //     return res.status(400).json({
        //         success: false,
        //         message: 'No valid color data found in CSV file'
        //     });
        // }

        // REMOVED: Duplicate checking within CSV - ALLOW ALL DUPLICATES IN CSV
        // We only check against the database

        // Check for existing colors in database (check ALL fields)
        const existingColors = await Color.find({
            $or: [
                { name: { $in: results.map(r => new RegExp(`^${r.name}$`, 'i')) }, isActive: true },
                { codeName: { $in: results.map(r => r.codeName) }, isActive: true },
                { hexCode: { $in: results.map(r => r.hexCode) }, isActive: true }
            ]
        });

        // Create sets of existing values for quick lookup
        const existingNames = new Set(existingColors.map(c => c.name.toLowerCase()));
        const existingCodeNames = new Set(existingColors.map(c => c.codeName));
        const existingHexCodes = new Set(existingColors.map(c => c.hexCode));

        // Filter out colors that already exist (based on any field)
        const newColors = [];
        const skippedColors = [];

        results.forEach(item => {
            const duplicateName = existingNames.has(item.name.toLowerCase());
            const duplicateCodeName = existingCodeNames.has(item.codeName);
            const duplicateHexCode = existingHexCodes.has(item.hexCode);

            if (duplicateName || duplicateCodeName || duplicateHexCode) {
                let reason = '';
                if (duplicateName) reason = `Color name "${item.name}" already exists`;
                else if (duplicateCodeName) reason = `Code name "${item.codeName}" already exists`;
                else if (duplicateHexCode) reason = `Hex code "${item.hexCode}" already exists`;

                skippedColors.push({
                    name: item.name,
                    codeName: item.codeName,
                    hexCode: item.hexCode,
                    reason: reason
                });
            } else {
                newColors.push(item);
            }
        });

        if (newColors.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'All colors in the CSV already exist in the database',
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
            message: `Successfully imported ${createdColors.length} colors, skipped ${skippedColors.length} existing colors`,
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
        const { name, codeName, hexCode } = req.body;

        // Check for duplicates when updating
        if (name || codeName || hexCode) {
            const existingColor = await Color.findOne({
                $or: [
                    { name: name ? new RegExp(`^${name}$`, 'i') : undefined, isActive: true, _id: { $ne: req.params.id } },
                    { codeName: codeName ? codeName.toUpperCase() : undefined, isActive: true, _id: { $ne: req.params.id } },
                    { hexCode: hexCode ? hexCode.toUpperCase() : undefined, isActive: true, _id: { $ne: req.params.id } }
                ].filter(condition => Object.values(condition).some(val => val !== undefined))
            });

            if (existingColor) {
                let duplicateField = '';
                if (name && existingColor.name.toLowerCase() === name.toLowerCase()) {
                    duplicateField = 'name';
                } else if (codeName && existingColor.codeName === codeName.toUpperCase()) {
                    duplicateField = 'code name';
                } else if (hexCode && existingColor.hexCode === hexCode.toUpperCase()) {
                    duplicateField = 'hex code';
                }

                return res.status(400).json({
                    success: false,
                    message: `Another color with this ${duplicateField} already exists`
                });
            }
        }

        const color = await Color.findByIdAndUpdate(
            req.params.id,
            {
                ...req.body,
                name: req.body.name,
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