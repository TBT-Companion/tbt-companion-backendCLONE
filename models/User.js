const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Firebase UID
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  displayName: {
    type: String,
    default: '',
  },
  role: {
    type: String,
    enum: ['patient', 'doctor', 'admin'],
    default: 'patient',
  },
  // Doctor assignment for patients
  assignedDoctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // For doctors: list of assigned patients
  patients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  // Patient-specific fields
  patientInfo: {
    dateOfBirth: Date,
    phoneNumber: String,
    medicalRecordNumber: String,
    treatmentStartDate: Date,
  },
  // Account status
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Index for faster queries
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ assignedDoctor: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;

