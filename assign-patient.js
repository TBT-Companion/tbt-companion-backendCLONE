#!/usr/bin/env node
/**
 * Script to assign a patient to a doctor
 * 
 * Usage:
 *   node assign-patient.js <patientFirebaseUid> <doctorFirebaseUid>
 * 
 * Example:
 *   node assign-patient.js 9oC6egcFneRFozfE9E2eRNavrmB2 APiakJtOslQDlsRTNe1gIy10V9A3
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const patientUid = process.argv[2];
const doctorUid = process.argv[3];

if (!patientUid || !doctorUid) {
  console.error('❌ Error: Both patient and doctor Firebase UIDs are required\n');
  console.log('Usage: node assign-patient.js <patientFirebaseUid> <doctorFirebaseUid>');
  console.log('\nExample:');
  console.log('  node assign-patient.js 9oC6egcFneRFozfE9E2eRNavrmB2 APiakJtOslQDlsRTNe1gIy10V9A3');
  process.exit(1);
}

async function assignPatient() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected successfully\n');

    // Find patient
    console.log(`🔍 Looking for patient with UID: ${patientUid}`);
    const patient = await User.findOne({ firebaseUid: patientUid });
    
    if (!patient) {
      console.error(`\n❌ Patient not found with Firebase UID: ${patientUid}`);
      process.exit(1);
    }

    if (patient.role !== 'patient') {
      console.error(`\n❌ User is not a patient (role: ${patient.role})`);
      process.exit(1);
    }

    console.log(`✅ Found patient:`);
    console.log(`   Email: ${patient.email}`);
    console.log(`   Name: ${patient.displayName || 'Not set'}`);
    console.log(`   Role: ${patient.role}`);

    // Find doctor
    console.log(`\n🔍 Looking for doctor with UID: ${doctorUid}`);
    const doctor = await User.findOne({ firebaseUid: doctorUid });
    
    if (!doctor) {
      console.error(`\n❌ Doctor not found with Firebase UID: ${doctorUid}`);
      process.exit(1);
    }

    if (doctor.role !== 'doctor' && doctor.role !== 'admin') {
      console.error(`\n❌ User is not a doctor or admin (role: ${doctor.role})`);
      process.exit(1);
    }

    console.log(`✅ Found doctor:`);
    console.log(`   Email: ${doctor.email}`);
    console.log(`   Name: ${doctor.displayName || 'Not set'}`);
    console.log(`   Role: ${doctor.role}`);

    // Check if already assigned
    if (patient.assignedDoctor && patient.assignedDoctor.toString() === doctor._id.toString()) {
      console.log(`\n⚠️  Patient is already assigned to this doctor!`);
      console.log('   No changes made.');
      process.exit(0);
    }

    // Assign patient to doctor
    console.log(`\n🔗 Assigning patient to doctor...`);
    
    // Update patient's assignedDoctor
    patient.assignedDoctor = doctor._id;
    await patient.save();

    // Add patient to doctor's patients list if not already there
    if (!doctor.patients.includes(patient._id)) {
      doctor.patients.push(patient._id);
      await doctor.save();
    }

    console.log(`\n✅ Successfully assigned patient to doctor!`);
    console.log(`\n   Patient: ${patient.displayName || patient.email}`);
    console.log(`   Doctor: ${doctor.displayName || doctor.email}`);
    console.log(`\n🎉 The doctor can now see this patient in the web portal!`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Make sure:');
      console.log('   - MongoDB is running');
      console.log('   - MONGODB_URI in .env is correct');
      console.log('   - You have network access to the database');
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB\n');
  }
}

assignPatient();

