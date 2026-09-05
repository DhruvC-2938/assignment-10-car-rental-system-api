const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const errorHandler = require('./middleware/errorHandler');

// Load environment variables
dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health / Root Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🚗 Car Rental & Vehicle Fleet Management API (Supabase) is running',
    version: '1.0.0',
    documentation: {
      auth: '/api/auth',
      vehicles: '/api/vehicles',
      rentals: '/api/rentals'
    }
  });
});

// Mount Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/vehicles', require('./routes/vehicleRoutes'));
app.use('/api/rentals', require('./routes/rentalRoutes'));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route Not Found: ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Car Rental API Server running on port ${PORT}`);
});

module.exports = app;
