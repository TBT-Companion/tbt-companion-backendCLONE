#!/usr/bin/env node
/**
 * Script to update user role in the TBT Companion system
 * 
 * Usage:
 *   node update-user-role.js <firebaseUid> [role]
 * 
 * Examples:
 *   node update-user-role.js APiakJtOslQDlsRTNe1gIy10V9A3 doctor
 *   node update-user-role.js abc123xyz patient
 *   node update-user-role.js def456uvw admin
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const firebaseUid = process.argv[2];
const role = process.argv[3] || 'doctor';

const VALID_ROLES = ['patient', 'doctor', 'admin'];

if (!firebaseUid) {
  console.error('❌ Error: Firebase UID is required\n');
  console.log('Usage: node update-user-role.js <firebaseUid> [role]');
  console.log('\nExamples:');
  console.log('  node update-user-role.js APiakJtOslQDlsRTNe1gIy10V9A3 doctor');
  console.log('  node update-user-role.js abc123xyz patient');
  console.log('  node update-user-role.js def456uvw admin');
  console.log('\nValid roles: patient, doctor, admin');
  process.exit(1);
}

if (!VALID_ROLES.includes(role)) {
  console.error(`❌ Error: Invalid role "${role}"`);
  console.log(`Valid roles: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

async function updateUserRole() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected successfully\n');

    // Find and update user
    console.log(`🔍 Looking for user with Firebase UID: ${firebaseUid}`);
    const user = await User.findOne({ firebaseUid });

    if (!user) {
      console.error(`\n❌ User not found with Firebase UID: ${firebaseUid}`);
      console.log('\n📋 Available users:');
      const allUsers = await User.find({}, 'firebaseUid email displayName role').sort({ createdAt: -1 });
      
      if (allUsers.length === 0) {
        console.log('  No users found in database');
      } else {
        allUsers.forEach(u => {
          console.log(`  • ${u.email}`);
          console.log(`    Name: ${u.displayName || 'Not set'}`);
          console.log(`    Role: ${u.role}`);
          console.log(`    UID: ${u.firebaseUid}\n`);
        });
      }
      process.exit(1);
    }

    console.log(`✅ Found user:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.displayName || 'Not set'}`);
    console.log(`   Current Role: ${user.role}`);
    console.log(`   Firebase UID: ${user.firebaseUid}`);

    if (user.role === role) {
      console.log(`\n⚠️  User already has role: ${role}`);
      console.log('   No changes made.');
      process.exit(0);
    }

    // Update role
    const oldRole = user.role;
    user.role = role;
    await user.save();

    console.log(`\n✅ Successfully updated user role!`);
    console.log(`   ${oldRole} → ${role}`);
    
    if (role === 'doctor' || role === 'admin') {
      console.log('\n🎉 User can now sign in to the doctor portal!');
      console.log('   Portal URL: http://localhost:3000');
    }
    
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

updateUserRole();

