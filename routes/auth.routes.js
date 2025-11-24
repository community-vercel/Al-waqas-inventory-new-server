// routes/auth.routes.js
const express = require('express');
const { setupSuperadmin, login, getMe } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/setup-superadmin', setupSuperadmin);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;