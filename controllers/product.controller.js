// controllers/product.controller.js
const Product = require('../models/product.model');
const Color = require('../models/color.model');

// Enhanced CSV parser with proper quote handling
const parseCSV = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    
    const results = [];
    
    // Parse headers
    const headers = parseCSVLine(lines[0]);
    console.log('Headers:', headers);
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row = {};
        
        // Map values to headers
        headers.forEach((header, index) => {
            if (index < values.length) {
                row[header] = values[index] || '';
            } else {
                row[header] = '';
            }
        });
        
        // Process colors column - FIXED
        const colors = [];
        
        if (row.colors) {
            let colorsString = row.colors.trim();
            
            // Remove ALL surrounding quotes (handles triple quotes too)
            colorsString = colorsString.replace(/^"+|"+$/g, '');
            
            // Split by comma and clean each color
            if (colorsString.includes(',')) {
                const colorList = colorsString.split(',')
                    .map(color => color.trim())
                    .filter(color => color !== '')
                    .map(color => color.replace(/^"+|"+$/g, '')); // Remove quotes from individual colors
                
                colors.push(...colorList);
            } else if (colorsString) {
                // Single color
                colors.push(colorsString.replace(/^"+|"+$/g, ''));
            }
        }
        
        row.allColors = colors.filter(color => color !== '' && !color.includes(',')); // Filter out invalid entries
        
        console.log(`Row ${i + 1}:`, {
            name: row.name,
            type: row.type,
            colorsCount: row.allColors.length,
            colorsSample: row.allColors.slice(0, 5)
        });
        
        results.push(row);
    }
    
    return results;
};

// Helper function to parse CSV line with proper quote handling
const parseCSVLine = (line) => {
    const values = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote inside quotes
                currentValue += '"';
                i++; // Skip next quote
            } else {
                // Start or end of quoted section
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of value
            values.push(currentValue);
            currentValue = '';
        } else {
            // Regular character
            currentValue += char;
        }
    }
    
    // Add the last value
    values.push(currentValue);
    
    return values.map(value => value.trim());
};

// @desc    Get all products
// @route   GET /api/products
// @access  Private
const getProducts = async (req, res) => {
    try {
        const products = await Product.find({ isActive: true })
            .populate('colors', 'name hexCode codeName')
            .populate('createdBy', 'name email')
            .sort({ name: 1, type: 1 });

        res.json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching products',
            error: error.message
        });
    }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Private
const createProduct = async (req, res) => {
    try {
        const { name, type, purchasePrice, salePrice, discount, colors } = req.body;

        // Validate required fields
        if (!name || !type || purchasePrice === undefined || salePrice === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Name, type, purchasePrice, and salePrice are required fields'
            });
        }

        // Validate colors
        if (!colors || (Array.isArray(colors) && colors.length === 0) || colors === '') {
            return res.status(400).json({
                success: false,
                message: 'At least one color is required'
            });
        }

        // Process colors array
        let colorArray = [];
        if (Array.isArray(colors)) {
            colorArray = colors.filter(color => color);
        } else if (colors) {
            colorArray = [colors];
        }

        if (colorArray.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one valid color is required'
            });
        }

        // Check if product with same name and type already exists - FIXED
        const existingProduct = await Product.findOne({
            name: { $regex: `^${name}$`, $options: 'i' }, // Fixed regex issue
            type: type.toLowerCase(),
            isActive: true
        });

        if (existingProduct) {
            return res.status(400).json({
                success: false,
                message: `Product "${name}" of type "${type}" already exists`
            });
        }

        const product = await Product.create({
            name,
            type: type.toLowerCase(),
            purchasePrice,
            salePrice,
            discount: discount || 0,
            colors: colorArray,
            createdBy: req.user.id
        });

        await product.populate('colors', 'name hexCode codeName');
        await product.populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });
    } catch (error) {
        console.error('Create product error:', error);
        
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: errors
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error creating product',
            error: error.message
        });
    }
};

// @desc    Upload products from CSV
// @route   POST /api/products/upload-csv
// @access  Private
const uploadProductsFromCSV = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No CSV file uploaded'
            });
        }

        // Convert buffer to string
        const csvText = req.file.buffer.toString('utf8');
        console.log('Raw CSV text (first 500 chars):', csvText.substring(0, 500));
        
        const data = parseCSV(csvText);
        
        console.log('Total rows to process:', data.length);
        
        const results = [];
        const errors = [];

        // Get all colors for lookup
        const allColors = await Color.find({ isActive: true });
        const colorMap = new Map();
        
        // Create comprehensive color mapping
        allColors.forEach(color => {
            // Map by name variations
            colorMap.set(color.name.toLowerCase(), color._id);
            colorMap.set(color.codeName.toLowerCase(), color._id);
            
            // Normalized versions
            const normalizedName = color.name.toLowerCase().replace(/\s+/g, ' ').trim();
            const normalizedCodeName = color.codeName.toLowerCase().replace(/\s+/g, ' ').trim();
            
            colorMap.set(normalizedName, color._id);
            colorMap.set(normalizedCodeName, color._id);
            
            // Without spaces
            colorMap.set(color.name.toLowerCase().replace(/\s+/g, ''), color._id);
            colorMap.set(color.codeName.toLowerCase().replace(/\s+/g, ''), color._id);
            
            // Common variations
            colorMap.set(color.name.toLowerCase().replace('new ', ''), color._id);
            colorMap.set(color.name.toLowerCase().replace('light ', ''), color._id);
            colorMap.set(color.name.toLowerCase().replace('dark ', ''), color._id);
        });

        console.log('Total colors available in system:', allColors.length);
        console.log('First 10 colors:', allColors.slice(0, 10).map(c => c.name));

        // Process each row
        for (let index = 0; index < data.length; index++) {
            const row = data[index];
            
            console.log(`\n=== Processing Row ${index + 2} ===`);
            
            // Validate required fields
            const missingFields = [];
            if (!row.name || row.name.trim() === '') missingFields.push('name');
            if (!row.type || row.type.trim() === '') missingFields.push('type');
            if (!row.purchasePrice || row.purchasePrice.trim() === '') missingFields.push('purchasePrice');
            if (!row.salePrice || row.salePrice.trim() === '') missingFields.push('salePrice');

            if (missingFields.length > 0) {
                errors.push({
                    row: index + 2,
                    error: `Missing required fields: ${missingFields.join(', ')}`,
                    data: { name: row.name, type: row.type }
                });
                continue;
            }

            // Process colors - FIXED
            const colorIds = [];
            const colorErrors = [];
            const foundColors = [];

            if (row.allColors && row.allColors.length > 0) {
                console.log(`Processing ${row.allColors.length} colors`);
                
                for (const colorName of row.allColors) {
                    // Skip if it's the entire concatenated string
                    if (colorName.includes(',') && colorName.length > 50) {
                        console.log(`Skipping concatenated color string: ${colorName.substring(0, 50)}...`);
                        continue;
                    }
                    
                    const cleanColorName = colorName.trim();
                    
                    if (cleanColorName && cleanColorName !== '') {
                        // Try multiple lookup strategies
                        const lookupNames = [
                            cleanColorName.toLowerCase(),
                            cleanColorName.toLowerCase().replace(/\s+/g, ' '),
                            cleanColorName.toLowerCase().replace(/\s+/g, ''),
                            cleanColorName.toLowerCase().replace('new ', ''),
                            cleanColorName.toLowerCase().replace('light ', ''),
                            cleanColorName.toLowerCase().replace('dark ', ''),
                        ];
                        
                        let colorId = null;
                        for (const lookupName of lookupNames) {
                            colorId = colorMap.get(lookupName);
                            if (colorId) break;
                        }
                        
                        if (!colorId) {
                            colorErrors.push(cleanColorName);
                            console.log(`❌ Color not found: "${cleanColorName}"`);
                        } else {
                            if (!colorIds.includes(colorId)) {
                                colorIds.push(colorId);
                                foundColors.push(cleanColorName);
                                console.log(`✅ Color found: "${cleanColorName}"`);
                            }
                        }
                    }
                }
            }

            // Only fail if NO colors were found at all
            if (colorIds.length === 0) {
                errors.push({
                    row: index + 2,
                    error: `No valid colors found. ${colorErrors.length} colors not found including: ${colorErrors.slice(0, 5).join(', ')}`,
                    data: {
                        name: row.name,
                        type: row.type,
                        totalColorsProvided: row.allColors ? row.allColors.length : 0,
                        colorsFound: 0
                    }
                });
                continue;
            }

            // Show warning but continue if some colors are missing
            if (colorErrors.length > 0) {
                console.log(`⚠️ ${colorErrors.length} colors not found, but ${colorIds.length} colors were found. Continuing...`);
            }

            // Validate numeric fields
            const purchasePrice = parseFloat(row.purchasePrice);
            const salePrice = parseFloat(row.salePrice);
            const discount = row.discount ? parseFloat(row.discount) : 0;

            if (isNaN(purchasePrice) || purchasePrice < 0) {
                errors.push({
                    row: index + 2,
                    error: `Invalid purchase price: ${row.purchasePrice}`,
                    data: { name: row.name, type: row.type }
                });
                continue;
            }

            if (isNaN(salePrice) || salePrice < 0) {
                errors.push({
                    row: index + 2,
                    error: `Invalid sale price: ${row.salePrice}`,
                    data: { name: row.name, type: row.type }
                });
                continue;
            }

            if (isNaN(discount) || discount < 0 || discount > 100) {
                errors.push({
                    row: index + 2,
                    error: `Invalid discount: ${row.discount}`,
                    data: { name: row.name, type: row.type }
                });
                continue;
            }

            results.push({
                name: row.name.trim(),
                type: row.type.trim().toLowerCase(),
                purchasePrice: purchasePrice,
                salePrice: salePrice,
                discount: discount,
                colors: colorIds,
                createdBy: req.user.id
            });

            console.log(`✅ Row ${index + 2} processed successfully with ${colorIds.length} colors`);
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: `CSV validation failed - ${errors.length} error(s) found`,
                errors: errors.slice(0, 5),
                totalErrors: errors.length
            });
        }

        if (results.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid product data found in CSV file'
            });
        }

        // Check for duplicates
        const existingProducts = await Product.find({
            $or: results.map(r => ({
                name: new RegExp(`^${r.name}$`, 'i'),
                type: r.type,
                isActive: true
            }))
        });

        if (existingProducts.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Some products already exist in database',
                existingProducts: existingProducts.map(p => ({
                    name: p.name,
                    type: p.type
                }))
            });
        }

        // Insert all products
        const createdProducts = await Product.insertMany(results);
        
        // Populate fields
        await Product.populate(createdProducts, [
            { path: 'colors', select: 'name hexCode codeName' },
            { path: 'createdBy', select: 'name email' }
        ]);

        console.log(`🎉 Successfully imported ${createdProducts.length} products`);
        
        res.status(201).json({
            success: true,
            message: `Successfully imported ${createdProducts.length} products`,
            data: createdProducts,
            summary: {
                totalRows: data.length,
                validRows: results.length,
                imported: createdProducts.length,
                failed: data.length - results.length
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

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private
const updateProduct = async (req, res) => {
    try {
        const { colors, ...otherFields } = req.body;

        if (colors !== undefined) {
            let colorArray = [];
            if (Array.isArray(colors)) {
                colorArray = colors.filter(color => color);
            } else if (colors) {
                colorArray = [colors];
            }

            if (colorArray.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'At least one valid color is required'
                });
            }
            otherFields.colors = colorArray;
        }

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            otherFields,
            { new: true, runValidators: true }
        )
        .populate('colors', 'name hexCode codeName')
        .populate('createdBy', 'name email');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product updated successfully',
            data: product
        });
    } catch (error) {
        console.error('Update product error:', error);
        
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: errors
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error updating product',
            error: error.message
        });
    }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private
const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting product',
            error: error.message
        });
    }
};

module.exports = {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    uploadProductsFromCSV
};