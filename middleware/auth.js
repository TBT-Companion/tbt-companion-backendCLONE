const { admin } = require('../config/firebase');
const User = require('../models/User');

/**
 * Middleware to verify Firebase ID token
 */
const authenticateToken = async (req, res, next) => {
  try {

    console.log('Authenticating token...');
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'No token provided' 
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Add user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
    };

    
    // Try to find user in database
    const dbUser = await User.findOne({ firebaseUid: decodedToken.uid });
    
    if (dbUser) {
      req.user.dbUser = dbUser;
      req.user.role = dbUser.role;
      req.user.userId = dbUser._id;
      
      // Update last login
      dbUser.lastLogin = new Date();
      await dbUser.save();
    }

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Token expired' 
      });
    }
    
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid token' 
    });
  }
};

/**
 * Middleware to check if user has required role
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    console.log('--- ROLE CHECK DEBUG ---');
    console.log('Allowed roles:', allowedRoles);
    console.log('User role:', req.user ? req.user.role : 'No user info');
    console.log('------------------------');
    if (!req.user || !req.user.role) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'User role not found' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Insufficient permissions' 
      });
    }

    next();
  };
};

module.exports = { authenticateToken, requireRole };

