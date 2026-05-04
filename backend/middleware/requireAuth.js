const jwt = require('jsonwebtoken');

const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authorized — please log in' });
  }

  const token = authHeader.split(' ')[1];

  try {

    const decoded = jwt.verify(token, process.env.SECRET);

    req.user = await User.findById(decoded.id).select('-password');

    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token — please log in again' });
  }
};


module.exports = requireAuth;
