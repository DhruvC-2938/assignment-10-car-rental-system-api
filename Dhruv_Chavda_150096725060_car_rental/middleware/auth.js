const { supabase } = require('../config/supabase');

/**
 * Middleware to authenticate requests using Supabase JWT Bearer Token
 */
const requireAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: No Bearer token provided in Authorization header'
    });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid or expired Supabase token',
        error: error ? error.message : undefined
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.email.split('@')[0],
      ...user.user_metadata
    };
    req.token = token;

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Authentication failed',
      error: err.message
    });
  }
};

module.exports = { requireAuth };
