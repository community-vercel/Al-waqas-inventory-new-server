// routes/product.routes.js
const express = require('express');
const multer = require('multer');
const { 
    getProducts, 
    createProduct, 
    updateProduct, 
    deleteProduct,
    uploadProductsFromCSV 
} = require('../controllers/product.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Configure multer for file upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
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
router.post('/upload-csv', protect, upload.single('csvFile'), uploadProductsFromCSV);
router.put('/:id', protect, updateProduct);
router.delete('/:id', protect, deleteProduct);

module.exports = router;