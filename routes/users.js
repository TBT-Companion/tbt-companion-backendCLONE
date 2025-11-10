const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');

// All user routes require authentication
router.use(authenticateToken);

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get('/me', async (req, res) => {
  try {
    const user = req.user.dbUser;
    
    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

/**
 * GET /api/users/assigned-doctor
 * Get the assigned doctor for the current patient
 */
router.get('/assigned-doctor', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId)
      .populate('assignedDoctor', 'displayName email _id')
      .select('assignedDoctor role');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'patient') {
      return res.status(400).json({ error: 'Only patients can have assigned doctors' });
    }

    if (!user.assignedDoctor) {
      return res.status(404).json({ error: 'No doctor assigned yet' });
    }

    res.json({
      id: user.assignedDoctor._id,
      name: user.assignedDoctor.displayName,
      email: user.assignedDoctor.email
    });
  } catch (error) {
    console.error('Error fetching assigned doctor:', error);
    res.status(500).json({ error: 'Failed to fetch assigned doctor' });
  }
});

/**
 * POST /api/users/register
 * Register a new user (create user profile after Firebase auth)
 */
router.post('/register', async (req, res) => {
  try {
    const { displayName, role = 'patient' } = req.body;
    const { uid, email } = req.user;

    // Check if user already exists
    let user = await User.findOne({ firebaseUid: uid });
    
    if (user) {
      return res.json({ message: 'User already registered', user });
    }

    // Create new user
    user = new User({
      firebaseUid: uid,
      email,
      displayName: displayName || email.split('@')[0],
      role,
    });

    await user.save();

    res.status(201).json({ message: 'User registered successfully', user });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

/**
 * PUT /api/users/me
 * Update current user profile
 */
router.put('/me', async (req, res) => {
  try {
    const userId = req.user.userId;
    const updates = req.body;

    // Prevent updating certain fields
    delete updates.firebaseUid;
    delete updates.email;
    delete updates.role;
    delete updates._id;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

/**
 * GET /api/users/doctors
 * Get all doctors (for patient to view/contact)
 */
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await User.find({ 
      role: 'doctor', 
      isActive: true 
    }).select('displayName email patients');

    res.json(doctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

/**
 * GET /api/users/patients
 * Get all patients assigned to the current doctor
 */
router.get('/patients', requireRole('doctor', 'admin'), async (req, res) => {
  try {
    const doctorId = req.user.userId;

    const patients = await User.find({ 
      assignedDoctor: doctorId,
      role: 'patient',
      isActive: true 
    }).select('displayName email patientInfo lastLogin firebaseUid');

    res.json(patients);
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

/**
 * GET /api/users/all
 * Get all users in the system (admin only)
 */
router.get('/all', requireRole('admin'), async (req, res) => {
  try {
    const { role, search } = req.query;
    
    const query = { isActive: true };
    
    // Filter by role if provided
    if (role && ['patient', 'doctor', 'admin'].includes(role)) {
      query.role = role;
    }
    
    // Search by name or email if provided
    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(query)
      .select('displayName email role assignedDoctor patients lastLogin createdAt')
      .populate('assignedDoctor', 'displayName email')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});
// GET /api/users/unassigned-patients (For Doctors)
router.get('/unassigned-patients', requireRole('doctor', 'admin'), async (req, res) => {
  try {
    // Find all active patients with no assigned doctor
    const unassignedPatients = await User.find({
      role: 'patient',
      isActive: true,
      assignedDoctor: null,
    })
      .select('displayName email patientInfo createdAt firebaseUid')
      .sort({ createdAt: -1 });

    res.json(unassignedPatients);
  } catch (error) {
    console.error('Error fetching unassigned patients:', error);
    res.status(500).json({ error: 'Failed to fetch unassigned patients' });
  }
});

/**
 * PATCH /api/users/:userId/role
 * Update a user's role (admin only)
 */
router.patch('/:userId/role', requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['patient', 'doctor', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { role } },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User role updated successfully', user });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * POST /api/users/assign-doctor
 * Assign a doctor to a patient (admin only)
 */
router.post('/assign-doctor', requireRole('admin', 'doctor'), async (req, res) => {
  try {
    const { patientId, doctorId } = req.body;

    if (!patientId || !doctorId) {
      return res.status(400).json({ error: 'patientId and doctorId are required' });
    }

    const patient = await User.findById(patientId);
    const doctor = await User.findById(doctorId);

    if (!patient || patient.role !== 'patient') {
      return res.status(404).json({ error: 'Patient not found' });
    }

    if (!doctor || (doctor.role !== 'doctor' && doctor.role !== 'admin')) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Remove patient from old doctor's list if exists
    if (patient.assignedDoctor) {
      const oldDoctor = await User.findById(patient.assignedDoctor);
      if (oldDoctor) {
        oldDoctor.patients = oldDoctor.patients.filter(
          p => p.toString() !== patientId
        );
        await oldDoctor.save();
      }
    }

    // Update patient
    patient.assignedDoctor = doctorId;
    await patient.save();

    // Update doctor's patient list
    if (!doctor.patients.includes(patientId)) {
      doctor.patients.push(patientId);
      await doctor.save();
    }

    res.json({ message: 'Doctor assigned successfully', patient, doctor });
  } catch (error) {
    console.error('Error assigning doctor:', error);
    res.status(500).json({ error: 'Failed to assign doctor' });
  }
});

/**
 * DELETE /api/users/:userId
 * Soft delete a user (admin only)
 */
router.delete('/:userId', requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { isActive: false } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deactivated successfully', user });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

module.exports = router;

