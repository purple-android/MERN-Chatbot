const User = require('../models/User');

const jwt = require('jsonwebtoken');

function createToken(userId) {
  return jwt.sign({ id: userId }, process.env.SECRET, { expiresIn: '7d' });
}

const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const emailTaken = await User.findOne({ email });
    if (emailTaken) return res.status(400).json({ error: 'Email already in use' });

    const usernameTaken = await User.findOne({ username });
    if (usernameTaken) return res.status(400).json({ error: 'Username already taken' });

    const user = await User.create({ username, email, password });

    const token = createToken(user._id);

    res.status(201).json({
      token,
      user: { _id: user._id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const passwordMatches = await user.comparePassword(password);

    if (!passwordMatches) return res.status(400).json({ error: 'Invalid email or password' });

    const token = createToken(user._id);

    res.json({
      token,
      user: { _id: user._id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
};

const getMe = async (req, res) => {
  res.json({
    user: { _id: req.user._id, username: req.user.username, email: req.user.email }
  });
};


module.exports = { register, login, getMe };
