// routes/color.routes.js
const express = require('express');
const multer = require('multer');
const { 
    getColors, 
    createColor, 
    updateColor, 
    deleteColor,
    uploadColorsFromCSV 
} = require('../controllers/color.controller');
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

router.get('/', protect, getColors);
router.post('/', protect, createColor);
router.post('/upload-csv', protect, upload.single('csvFile'), uploadColorsFromCSV);
router.put('/:id', protect, updateColor);
router.delete('/:id', protect, deleteColor);

module.exports = router;