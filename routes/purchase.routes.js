// routes/purchase.routes.js - UPDATED
const express = require('express');
const { 
  getPurchases, 
  createPurchase, 
  updatePurchase, 
  deletePurchase, 
  getPurchaseStats 
} = require('../controllers/purchase.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();
// const debugColors = async (req, res) => {
//     try {
//         const Color = require('../models/color.model');
//         const colors = await Color.find();
//         const purchases = await Purchase.find().populate('color');
        
//         res.json({
//             allColors: colors.map(c => ({ id: c._id, name: c.name, hexCode: c.hexCode })),
//             purchases: purchases.map(p => ({
//                 id: p._id,
//                 product: p.product?.name,
//                 colorId: p.color?._id,
//                 colorName: p.color?.name,
//                 colorHex: p.color?.hexCode,
//                 hasColor: !!p.color
//             }))
//         });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// };


// Add to routes temporarily (remove after debugging)
// router.get('/debug-colors', debugColors);
router.get('/', protect, getPurchases);
router.get('/stats', protect, getPurchaseStats);
router.post('/', protect, createPurchase);
router.put('/:id', protect, updatePurchase);
router.delete('/:id', protect, deletePurchase);

module.exports = router;