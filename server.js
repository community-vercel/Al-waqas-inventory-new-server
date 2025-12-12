const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');

const authRoutes = require('./routes/auth.routes');
const colorRoutes = require('./routes/color.routes');
const productRoutes = require('./routes/product.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const expenseRoutes = require('./routes/expense.routes');
const purchaseRoutes = require('./routes/purchase.routes');
const saleRoutes = require('./routes/sale.routes');
const contactRoutes = require('./routes/contact.routes');
const ledgerRoutes = require('./routes/ledger.routes');


connectDB();

const app = express();
mongoose.set('strictPopulate', false);


app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://al-waqas-inventory-new-client.vercel.app',
    'https://inventory.alwaqaspaint.com'
  ],
  methods: 'GET,POST,PUT,PATCH,DELETE',
  credentials: true
}));


app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/colors', colorRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/contacts', contactRoutes)
app.use('/api/ledgers', ledgerRoutes);



// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Al Waqas Paint Shop Inventory API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
// app.use('(.*)',  (req, res) => {
//   res.status(404).json({
//     success: false,
//     message: 'Route not found'
//   });
// });

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});