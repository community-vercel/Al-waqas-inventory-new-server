// routes/product.routes.js
const express = require('express');
const multer = require('multer');
const { 
    getProducts, 
    createProduct, 
    updateProduct, 
    deleteProduct,
    uploadProductsFromCSV,
    bulkDeleteAllProducts,
    fixInventoryQuantities
} = require('../controllers/product.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    }
});

router.get('/', protect, getProducts);
router.post('/', protect, createProduct);
router.delete('/bulk-delete-all', protect, bulkDeleteAllProducts);
router.post('/upload-csv', protect, upload.single('csvFile'), uploadProductsFromCSV);
router.put('/:id', protect, updateProduct);
router.delete('/:id', protect, deleteProduct);
fixInventoryQuantities

module.exports = router;