const { supabase } = require('../config/supabase');

// @desc    Get all vehicles with optional filters (category, status, brand)
// @route   GET /api/vehicles
// @access  Public
exports.getVehicles = async (req, res, next) => {
  try {
    const { category, status, brand } = req.query;
    let query = supabase.from('vehicles').select('*').order('created_at', { ascending: false });

    if (category) {
      query = query.ilike('category', category);
    }
    if (status) {
      query = query.eq('status', status.toLowerCase());
    }
    if (brand) {
      query = query.ilike('brand', `%${brand}%`);
    }

    const { data: vehicles, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(200).json({
      success: true,
      count: vehicles.length,
      data: vehicles
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single vehicle details along with rental history
// @route   GET /api/vehicles/:id
// @access  Public
exports.getVehicleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch vehicle
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();

    if (vehicleError || !vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle not found with ID ${id}`
      });
    }

    // Fetch past & active rentals for this vehicle
    const { data: rentals, error: rentalsError } = await supabase
      .from('rentals')
      .select('*')
      .eq('vehicle_id', id)
      .order('start_date', { ascending: false });

    res.status(200).json({
      success: true,
      data: {
        ...vehicle,
        rentals: rentals || []
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Add new vehicle to fleet
// @route   POST /api/vehicles
// @access  Private (Authenticated)
exports.createVehicle = async (req, res, next) => {
  try {
    const {
      brand,
      model,
      year,
      category,
      daily_rate,
      fuel_type,
      seating_capacity,
      status
    } = req.body;

    if (!brand || !model || !year || !category || !daily_rate || !fuel_type) {
      return res.status(400).json({
        success: false,
        message: 'Please provide brand, model, year, category, daily_rate, and fuel_type'
      });
    }

    const validCategories = ['Sedan', 'SUV', 'Luxury', 'Hatchback', 'Electric'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    if (Number(daily_rate) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'daily_rate must be greater than 0'
      });
    }

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .insert([
        {
          brand,
          model,
          year: parseInt(year, 10),
          category,
          daily_rate: parseFloat(daily_rate),
          fuel_type,
          seating_capacity: seating_capacity ? parseInt(seating_capacity, 10) : 5,
          status: status || 'available'
        }
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(201).json({
      success: true,
      message: 'Vehicle added to fleet successfully',
      data: vehicle
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update vehicle daily rate or status
// @route   PUT /api/vehicles/:id
// @access  Private (Authenticated)
exports.updateVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { daily_rate, status, brand, model, year, category, fuel_type, seating_capacity } = req.body;

    const updates = {};
    if (daily_rate !== undefined) updates.daily_rate = parseFloat(daily_rate);
    if (status !== undefined) updates.status = status.toLowerCase();
    if (brand !== undefined) updates.brand = brand;
    if (model !== undefined) updates.model = model;
    if (year !== undefined) updates.year = parseInt(year, 10);
    if (category !== undefined) updates.category = category;
    if (fuel_type !== undefined) updates.fuel_type = fuel_type;
    if (seating_capacity !== undefined) updates.seating_capacity = parseInt(seating_capacity, 10);

    const { data: updatedVehicle, error } = await supabase
      .from('vehicles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedVehicle) {
      return res.status(404).json({
        success: false,
        message: error ? error.message : `Vehicle not found with ID ${id}`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully',
      data: updatedVehicle
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete vehicle from fleet
// @route   DELETE /api/vehicles/:id
// @access  Private (Authenticated)
exports.deleteVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if vehicle has any active or upcoming bookings
    const { data: activeRentals, error: checkError } = await supabase
      .from('rentals')
      .select('id, status')
      .eq('vehicle_id', id)
      .in('status', ['booked', 'active']);

    if (checkError) {
      return res.status(400).json({ success: false, message: checkError.message });
    }

    if (activeRentals && activeRentals.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete vehicle: It has ${activeRentals.length} active/upcoming bookings`
      });
    }

    const { error: deleteError } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return res.status(400).json({ success: false, message: deleteError.message });
    }

    res.status(200).json({
      success: true,
      message: 'Vehicle successfully removed from fleet',
      deletedId: id
    });
  } catch (err) {
    next(err);
  }
};
