const express = require('express');
const router = express.Router();
const {
  createRental,
  getMyBookings,
  cancelRental,
  completeRental
} = require('../controllers/rentalController');
const { requireAuth } = require('../middleware/auth');

// Protected booking endpoints
router.post('/', requireAuth, createRental);
router.get('/my-bookings', requireAuth, getMyBookings);
router.patch('/:id/cancel', requireAuth, cancelRental);
router.patch('/:id/complete', requireAuth, completeRental);

module.exports = router;
