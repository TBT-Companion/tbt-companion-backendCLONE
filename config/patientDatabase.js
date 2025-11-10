// config/patientDatabase.js
const mongoose = require('mongoose');
require('dotenv').config();

let patientConnection = null;

async function connectPatientDB() {
  // ✅ If already connected, reuse the same connection
  if (patientConnection && patientConnection.readyState === 1) {
    return patientConnection;
  }

  try {
    patientConnection = await mongoose.createConnection(process.env.PATIENT_DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`Connected to patient_database via Mongoose`);
    return patientConnection;
  } catch (err) {
    console.error('Error connecting to patient_database:', err);
    throw err;
  }
}

module.exports = connectPatientDB;
