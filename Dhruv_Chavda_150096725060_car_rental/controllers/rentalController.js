const { supabase } = require('../config/supabase');

// Helper: Calculate day difference between two dates (minimum 1 day)
const calculateRentalDays = (startDateStr, endDateStr) => {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 0 ? 1 : diffDays;
};

// @desc    Book a vehicle with date collision validation & dynamic cost computation
// @route   POST /api/rentals
// @access  Private (Authenticated)
exports.createRental = async (req, res, next) => {
  try {
    const { vehicle_id, start_date, end_date, customer_name, customer_email } = req.body;
    const userId = req.user.id;

    if (!vehicle_id || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide vehicle_id, start_date, and end_date'
      });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid start_date or end_date format. Use YYYY-MM-DD'
      });
    }

    if (endDate < startDate) {
      return res.status(400).json({
        success: false,
        message: 'end_date must be on or after start_date'
      });
    }

    // 1. Fetch vehicle details & verify existence
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', vehicle_id)
      .single();

    if (vehicleError || !vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle not found with ID ${vehicle_id}`
      });
    }

    if (vehicle.status === 'maintenance') {
      return res.status(400).json({
        success: false,
        message: `Vehicle '${vehicle.brand} ${vehicle.model}' is currently undergoing maintenance and cannot be booked`
      });
    }

    // 2. Date Collision Detection Algorithm:
    // Any existing active/booked reservation that overlaps:
    // (existing.start_date <= requested.end_date) AND (existing.end_date >= requested.start_date)
    const { data: overlappingBookings, error: collisionError } = await supabase
      .from('rentals')
      .select('*')
      .eq('vehicle_id', vehicle_id)
      .in('status', ['booked', 'active'])
      .lte('start_date', end_date)
      .gte('end_date', start_date);

    if (collisionError) {
      return res.status(400).json({ success: false, message: collisionError.message });
    }

    if (overlappingBookings && overlappingBookings.length > 0) {
      const conflict = overlappingBookings[0];
      return res.status(400).json({
        success: false,
        message: `Vehicle already reserved during this timeframe (${conflict.start_date} to ${conflict.end_date})`
      });
    }

    // 3. Automated Billing Computation
    const rentalDays = calculateRentalDays(start_date, end_date);
    const totalCost = Math.round(rentalDays * parseFloat(vehicle.daily_rate) * 100) / 100;

    // 4. Create Rental Booking in Database
    const { data: rental, error: bookingError } = await supabase
      .from('rentals')
      .insert([
        {
          user_id: userId,
          vehicle_id: parseInt(vehicle_id, 10),
          customer_name: customer_name || req.user.name || 'Customer',
          customer_email: customer_email || req.user.email,
          start_date,
          end_date,
          total_cost: totalCost,
          status: 'booked'
        }
      ])
      .select('*, vehicles(*)')
      .single();

    if (bookingError) {
      return res.status(400).json({ success: false, message: bookingError.message });
    }

    res.status(201).json({
      success: true,
      message: 'Vehicle booked successfully',
      billingSummary: {
        dailyRate: vehicle.daily_rate,
        rentalDays,
        totalCost
      },
      data: rental
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all bookings made by authenticated user
// @route   GET /api/rentals/my-bookings
// @access  Private (Authenticated)
exports.getMyBookings = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data: rentals, error } = await supabase
      .from('rentals')
      .select('*, vehicles(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(200).json({
      success: true,
      count: rentals.length,
      data: rentals
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Cancel an upcoming rental booking
// @route   PATCH /api/rentals/:id/cancel
// @access  Private (Authenticated)
exports.cancelRental = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Fetch booking
    const { data: rental, error: fetchError } = await supabase
      .from('rentals')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !rental) {
      return res.status(404).json({
        success: false,
        message: `Rental booking with ID ${id} not found`
      });
    }

    if (rental.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only cancel your own bookings'
      });
    }

    if (rental.status !== 'booked') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel rental with status '${rental.status}'`
      });
    }

    const { data: updatedRental, error: updateError } = await supabase
      .from('rentals')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select('*, vehicles(*)')
      .single();

    if (updateError) {
      return res.status(400).json({ success: false, message: updateError.message });
    }

    res.status(200).json({
      success: true,
      message: 'Rental booking successfully cancelled',
      data: updatedRental
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Complete rental (Vehicle returned, marks status back to available)
// @route   PATCH /api/rentals/:id/complete
// @access  Private (Authenticated)
exports.completeRental = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: rental, error: fetchError } = await supabase
      .from('rentals')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !rental) {
      return res.status(404).json({
        success: false,
        message: `Rental booking with ID ${id} not found`
      });
    }

    if (rental.status === 'completed' || rental.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Rental is already in '${rental.status}' state`
      });
    }

    // 1. Update rental status to completed
    const { data: updatedRental, error: updateError } = await supabase
      .from('rentals')
      .update({ status: 'completed' })
      .eq('id', id)
      .select('*, vehicles(*)')
      .single();

    if (updateError) {
      return res.status(400).json({ success: false, message: updateError.message });
    }

    // 2. Set vehicle status back to 'available'
    await supabase
      .from('vehicles')
      .update({ status: 'available' })
      .eq('id', rental.vehicle_id);

    res.status(200).json({
      success: true,
      message: 'Rental marked as completed and vehicle restored to available status',
      data: updatedRental
    });
  } catch (err) {
    next(err);
  }
};
