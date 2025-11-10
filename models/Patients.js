// models/Patients.js
const mongoose = require('mongoose');
const connectPatientDB = require('../config/patientDatabase');

const patientSchema = new mongoose.Schema({
  Patient: {
    first_name: String,
    last_name: String,
    email: String,
    phone_number: String
  },
  Treatment_cycle: Object,
  Measurement_history: Object,
  Pain_log: Object,
  FirebaseUid: String,
  conversationID: String
}, { strict: false });

let Patient; // Cache model once created

async function getPatientModel() {
  if (Patient) return Patient;

  const connection = await connectPatientDB();
  Patient = connection.model('Patient', patientSchema, 'patients');
  return Patient;
}

module.exports = getPatientModel;
