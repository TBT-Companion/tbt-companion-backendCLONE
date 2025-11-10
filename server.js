require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/database');
const { initializeFirebase, admin } = require('./config/firebase');
const Message = require('./models/Message');
const User = require('./models/User');
const { authenticateToken, requireRole } = require('./middleware/auth.js');
const {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  HeadObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');


// Import routes
const chatRoutes = require('./routes/chat');
const userRoutes = require('./routes/users');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

//  S3 Client Setup
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files for doctor webapp
app.use(express.static('public'));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});


async function getFolderItemCount(folder) {
  const bucketName = process.env.S3_BUCKET_NAME;
  const listCommand = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: `${folder}/`,
  });

  const listedObjects = await s3.send(listCommand);
  return listedObjects.Contents ? listedObjects.Contents.length : 0;
}



//AWS s3 endpoints

/**
 * GET /images/:folder
 * 
 * Retrieve signed URLs and metadata for all images in the specified S3 folder.
 * 
 * Returns a JSON array of objects containing:
 *  - key: S3 object key
 *  - url: pre-signed URL for accessing the image
 *  - description: custom metadata field from S3 object
 * 
 * Example request:
 *  GET /images/user123
 * 
 * Responses:
 *  - 200: { images: [ { key, url, description }, ... ] }
 *  - 500: Server error
 * 
 */
app.get('/images/:folder', async (req, res) => {
  try {
    console.log("Access Endpoint was called");
    const folder = req.params.folder;
    const bucketName = process.env.S3_BUCKET_NAME;
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${folder}/`,
    });
    const listedObjects = await s3.send(listCommand);
    console.log("Objects: ", listedObjects)
    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      return res.json({ message: 'No images found in this folder.' });
    }

    const images = await Promise.all(
      listedObjects.Contents.map(async (obj) => {
        const getCommand = new GetObjectCommand({ Bucket: bucketName, Key: obj.Key });
        const headCommand = new HeadObjectCommand({ Bucket: bucketName, Key: obj.Key });
        const headResponse = await s3.send(headCommand);
        const url = await getSignedUrl(s3, getCommand, { expiresIn: 3600 });

        const date = headResponse.Metadata?.date || '';
        let decoded = null

        if (headResponse.Metadata.description != null) {
          decoded = Buffer.from(headResponse.Metadata.description, "base64").toString("utf8");
        }

        return {
          key: obj.Key,
          url,
          Date: date,
          Description: decoded || null,
        };
      })
    );

    images.sort((a, b) => new Date(a.Date) - new Date(b.Date));

    console.log("Images: ", images)
    res.json({ images, count: images.length });
  } catch (error) {
    console.error('Error generating signed URLs:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to generate image URLs' });
  }

});

/**
 * GET /generate-upload-url
 * 
 * Generate a pre-signed URL for uploading an image to S3.
 * 
 * Expected query parameters:
 *  - filename: Name of the file to be uploaded
 *  - contentType: type of the file
 *  - folder: Firebase UID
 *  - description: (optional) description metadata for the file
 * 
 * Responses:
 *  - 200: { uploadUrl, key }
 *  - 400: Missing required parameters
 *  - 500: Server error
 * 
 * 
 */
app.get('/generate-upload-url', async (req, res) => {
  try {
    console.log("Endpoint was called")
    const { filename, contentType, folder, description } = req.query;
    if (!filename || !contentType || !folder) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }
    const count = await getFolderItemCount(folder) + 1;
    console.log("Count: ", count)
    const date = new Date(); // Or any other Date object
    const formatter = new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
    const formattedDate = `${formatter.format(date)}`;
    const sanitizedFolder = folder.replace(/[^a-zA-Z0-9-_\/]/g, '');
    const newfilename = `${filename}-${count}.jpg`;
    console.log("New Filename: ", newfilename);
    const key = `${sanitizedFolder}/${newfilename}`;
    console.log("Key: ", key)
    console.log("Date: ", formattedDate)
    const command = new PutObjectCommand({
      Bucket: "tbt-companion",
      Key: key,
      ContentType: "image/jpeg",
      Metadata: {
        date: formattedDate,
        description: description || '',
      },
    });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    res.json({ uploadUrl: signedUrl, key, count: count});
  } catch (err) {
    console.error("Error generating signed URL:", err.message);
    res.status(500).json({ error: 'Failed to generate upload URL', details: err.message });
  }
});




// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
const getPatientModel = require('./models/Patients');

/**
 * GET /patientsList
 *
 * Retrieve a list of all patients (doctor or admin only).
 *
 * Returns a lightweight list of patient records containing only the
 * `_id`, `first_name`, `last_name`, and `email` fields for quick display
 * in dashboards or selection menus. Uses a MongoDB projection to exclude
 * unnecessary data for efficiency.
 *
 * Example request:
 *  GET /patientsList
 *
 * Auth:
 *  - authenticateToken middleware required
 *  - requireRole('doctor', 'admin')
 *
 * Responses:
 *  - 200: Array of patient objects [{ _id, Patient: { first_name, last_name, email } }]
 *  - 500: Server error
 */
app.get('/patientsList', authenticateToken, requireRole('doctor', 'admin'), async (_req, res) => {
  try {

    const Patient = await getPatientModel();

    // Query with projection
    const patients = await Patient.find({}, {
      _id: 1,
      'Patient.first_name': 1,
      'Patient.last_name': 1,
      'Patient.email': 1,
      'Patient.FirebaseUid': 1
    });

    // Return the results
    res.json(patients);
  } catch (err) {
    console.error('Error fetching patients:', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});








/**
 * GET /patient/:id
 *
 * Retrieve a full patient record by MongoDB ID (doctor or admin only).
 *
 * Looks up the patient document in MongoDB using the provided `:id` parameter
 * and returns the complete record, excluding the internal `__v` field.
 *
 * Example request:
 *  GET /patient/64f1a2b7c1d2e3f4a5b6c7d8
 *
 * Auth:
 *  - authenticateToken middleware required
 *  - requireRole('doctor', 'admin')
 *
 * Responses:
 *  - 200: Full patient object
 *  - 404: Patient not found
 *  - 500: Server error
 */
app.get('/patient/:id', authenticateToken, requireRole('doctor', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const Patient = await getPatientModel();

    // Attempt to find patient by ID
    const patient = await Patient.findById(id, { __v: 0 }); // exclude version field

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Return the full patient record
    res.json(patient);

  } catch (err) {
    console.error('Error fetching patient record:', err);
    res.status(500).json({ error: 'Failed to fetch patient record' });
  }
});

app.get('/patient/firebase/:uid', authenticateToken, requireRole('doctor', 'admin'), async (req, res) => {
  try {
    const { uid } = req.params;
    const Patient = await getPatientModel();

    const patient = await Patient.findOne({ 'Patient.FirebaseUid': uid });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json(patient);
  } catch (err) {
    console.error('Error fetching patient record by UID:', err);
    res.status(500).json({ error: 'Failed to fetch patient record' });
  }
});


/**
 * GET /patientSelf
 *
 * Retrieve the authenticated patient's own record.
 *
 * Finds the patient document in MongoDB that matches the Firebase UID
 * from the verified authentication token. Returns only that patient's
 * data (no other records are accessible).
 *
 * Example request:
 *  GET /patientSelf
 *
 * Auth:
 *  - authenticateToken middleware required
 *  - requireRole('patient')
 *
 * Responses:
 *  - 200: Full patient object for the authenticated user
 *  - 404: Patient record not found
 *  - 500: Server error
 */
app.get('/patientSelf', authenticateToken, requireRole('patient'), async (req, res) => {
  try {
    const Patient = await getPatientModel();

    // 1️⃣ Find patient record by Firebase UID
    const patient = await Patient.findOne({ 'Patient.FirebaseUid': req.user.uid });

    if (!patient) {
      return res.status(404).json({ error: 'Patient record not found' });
    }

    // 2️⃣ Return the patient's record
    res.status(200).json({
      message: 'Patient record retrieved successfully',
      patient
    });

  } catch (err) {
    console.error('Error fetching patient self record:', err);
    res.status(500).json({ error: 'Failed to retrieve patient record', details: err.message });
  }
});

/**
 * PUT /updatePatient/:id
 *
 * Update an existing patient record (doctor or admin only).
 *
 * Accepts a JSON body containing patient fields to update. Each field is automatically
 * prefixed with `Patient.` to match the schema structure (e.g. `{ "first_name": "John" }`
 * becomes `{ "Patient.first_name": "John" }`).
 *
 * Example request:
 *  PUT /updatePatient/64f1a2b7c1d2e3f4a5b6c7d8
 *  Body:
 *  {
 *    "first_name": "John",
 *    "last_name": "Doe",
 *    "email": "john.doe@example.com"
 *  }
 *
 * Auth:
 *  - authenticateToken middleware required
 *  - requireRole('doctor', 'admin')
 *
 * Responses:
 *  - 200: { message: 'Patient updated successfully', result }
 *  - 404: Patient not found or no changes made
 *  - 500: Server error
 */
app.put('/updatePatient/:id', authenticateToken, requireRole('doctor', 'admin'), async (req, res) => {
  try {
    const Patient = await getPatientModel(); // Get Mongoose model from your config/model setup
    const { id } = req.params;
    const updates = req.body; // Expect JSON body with fields to update

    // Convert fields into nested Mongo update keys (Patient.first_name, etc.)
    const updateFields = {};
    for (const [key, value] of Object.entries(updates)) {
      updateFields[`Patient.${key}`] = value;
    }

    const result = await Patient.updateOne(
      { _id: id },
      { $set: updateFields }
    );

    if (result.matchedCount === 0 && result.modifiedCount === 0) {
      return res.status(404).json({ error: 'Patient not found or no changes made' });
    }

    res.json({ message: 'Patient updated successfully', result });
  } catch (err) {
    console.error('Error updating patient:', err);
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

/**
 * POST /createPatient
 *
 * Create a new patient record (doctor or admin only).
 *
 * Accepts either flat or nested JSON. Builds a structured Patient document that
 * includes identity fields, Treatment_cycle, Measurement_history, Pain_log,
 * FirebaseUid (optional) and conversationID.
 *
 * Request body (examples):
 *  - flat:
 *    {
 *      "first_name": "...",
 *      "last_name": "...",
 *      "email": "...",
 *      "phone_number": "...",
 *      "Treatment_cycle": { ... },
 *      "Pain_log": { ... },
 *      "FirebaseUid": "...",
 *      "conversationID": "..."
 *    }
 *
 *  - nested:
 *    {
 *      "Patient": {
 *        "first_name": "...",
 *        "last_name": "...",
 *        ...
 *      }
 *    }
 *
 * Auth:
 *  - authenticateToken middleware required
 *  - requireRole('doctor', 'admin')
 *
 * Responses:
 *  - 201: { message: 'Patient created successfully', patient }
 *  - 400: invalid input (handled upstream)
 *  - 500: server error
 */
const { ObjectId } = require('mongodb');
app.post('/createPatient', authenticateToken, requireRole('doctor', 'admin'), async (req, res) => {
  try {
    const Patient = await getPatientModel();

    // Allow either a fully nested req.body.Patient or flat fields

    let userId = req.headers['x-user-id'];
    if (!userId) {
      userId = new ObjectId();
      console.log('⚠️ No user ObjectId in headers — generated new one:', userId.toString());
    }

    const b = req.body;
    const pb = b.Patient || {};
    const existing = await Patient.findById(userId);
    if (existing) {
      return res.status(409).json({ error: 'Patient already exists for this user' });
    }


    const doc = new Patient({
      _id: userId,
      Patient: {
        // identity
        first_name: b.first_name ?? pb.first_name ?? '',
        last_name: b.last_name ?? pb.last_name ?? '',
        email: b.email ?? pb.email ?? '',
        phone_number: b.phone_number ?? pb.phone_number ?? '',

        // nested sections (all inside Patient)
        Treatment_cycle: {
          start_date: (pb.Treatment_cycle?.start_date ?? b.Treatment_cycle?.start_date) || null,
          end_date: (pb.Treatment_cycle?.end_date ?? b.Treatment_cycle?.end_date) || null,
          num_rotations: Number(
            (pb.Treatment_cycle?.num_rotations ?? b.Treatment_cycle?.num_rotations ?? 0)
          ),
          start_time: (pb.Treatment_cycle?.start_time ?? b.Treatment_cycle?.start_time) || null,
          recorded_turns: Number(
            (pb.Treatment_cycle?.recorded_turns ?? b.Treatment_cycle?.recorded_turns ?? 0)
          )
        },

        Measurement_history: {
          // 1: {
          //   date: (pb.Measurement_history?.['1']?.date ?? b.Measurement_history?.['1']?.date) || null,
          //   image_ref: (pb.Measurement_history?.['1']?.image_ref ?? b.Measurement_history?.['1']?.image_ref) || ''
          // }
        },

        Pain_log: {
          1: {
            date: (pb.Pain_log?.['1']?.date ?? b.Pain_log?.['1']?.date) || null,
            location: (pb.Pain_log?.['1']?.location ?? b.Pain_log?.['1']?.location) || '',
            intensity: (pb.Pain_log?.['1']?.intensity ?? b.Pain_log?.['1']?.intensity) || '',
            pain_type: (pb.Pain_log?.['1']?.pain_type ?? b.Pain_log?.['1']?.pain_type) || ''
          }
        },

        // these also live under Patient
        FirebaseUid: b.FirebaseUid ?? pb.FirebaseUid ?? '',
        conversationID: b.conversationID ?? pb.conversationID ?? ''
      }
    });

    const saved = await doc.save();
    res.status(201).json({ message: 'Patient created successfully', patient: saved });
  } catch (err) {
    console.error('Error creating patient:', err);
    res.status(500).json({ error: 'Failed to create patient' });
  }
});


// app.post('/createPatientAccount', async (req, res) => {} goes here *FOR TESTING ONLY*

/**
 * Link Firebase-authenticated user to an existing patient record.
 *
 * Purpose:
 *   - Update the patient document with the user's Firebase UID and email.
 *   - Remove any outdated/legacy fields.
 *   - Create a corresponding User document with role "patient" and associate it
 *     with the patient record.
 *
 * Expected request body (JSON):
 *   {
 *     "firebaseUid": "<firebase-uid>",
 *     "email": "<user-email>",
 *     "patientMongoId": "<patient-mongo-id>"
 *   }
 *
 * Success response:
 *   200 { message, patient, user }
 *
 * Error responses:
 *   400 - Missing required fields or user already exists
 *   404 - Patient not found
 *   500 - Internal server error
 *
 * Notes:
 *   - Ensures a one-to-one mapping between Firebase auth users and patient records.
 *   - Overwrites nested Patient.FirebaseUid and Patient.email while unsetting
 *     legacy top-level FirebaseUID if present.
 */
app.post('/createAuthAccount', async (req, res) => {
  try {
    const { firebaseUid, email, patientMongoId } = req.body;

    if (!firebaseUid || !email || !patientMongoId) {
      return res.status(400).json({
        error: 'Missing required fields: firebaseUid, email, or patientMongoId'
      });
    }

    const Patient = await getPatientModel();

    // 🧹 Clean update — overwrite correct field, remove nested old one
    const patient = await Patient.findByIdAndUpdate(
      patientMongoId,
      {
        $set: {
          "Patient.FirebaseUid": firebaseUid,   // ✅ now nested
          "Patient.email": email                // still nested
        },
        $unset: {
          "FirebaseUID": ""
        }
      },
      { new: true }
    );


    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // 2️⃣ Check if a user with this Firebase UID already exists
    const existingUser = await User.findOne({ firebaseUid });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this Firebase UID' });
    }

    // 3️⃣ Create a new user record in tbt-companion.users
    const newUser = new User({
      firebaseUid,
      email,
      displayName: `${patient.Patient.first_name} ${patient.Patient.last_name}`.trim(),
      role: 'patient',
      patients: [patientMongoId],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newUser.save();

    res.json({
      message: '✅ Patient account linked successfully',
      patient,
      user: newUser
    });

  } catch (err) {
    console.error('❌ Error linking auth account:', err);
    res.status(500).json({ error: 'Failed to link auth account' });
  }
});








/**
 * This endpoint allows an authenticated patient to record a new pain log entry.
 * It verifies the user's Firebase UID, locates their patient document in MongoDB,
 * and appends a new object (date, location, intensity, and pain_type) to the
 * Patient.Pain_log field. Each submission creates a new sequential entry,
 * helping doctors track pain trends over time.
 *
 * Expected request body (JSON):
 * {
 *   "date": "2025-10-29T12:00:00Z", // optional, defaults to now
 *   "location": "left knee",
 *   "intensity": "5",
 *   "pain_type": "sharp"
 * }
 *
 * Responses:
 * 201 - { message, entry, patientId }
 * 404 - { error: 'Patient record not found' }
 * 500 - { error: 'Failed to add pain log', details }
 */
app.post('/addPainLog', authenticateToken, requireRole('patient'), async (req, res) => {
  try {
    const Patient = await getPatientModel();
    const { date, location, intensity, pain_type } = req.body;
    const firebaseUid = req.user.uid;

    // 1️⃣ Fetch patient directly
    const patient = await Patient.findOne({ 'Patient.FirebaseUid': firebaseUid });

    if (!patient) {
      return res.status(404).json({ error: 'Patient record not found' });
    }

    // 2️⃣ Read the current Pain_log directly from the raw MongoDB document
    const rawPatient = await Patient.collection.findOne({ 'Patient.FirebaseUid': firebaseUid });
    const painLog = rawPatient?.Patient?.Pain_log || {};
    const nextIndex = String(Object.keys(painLog).length + 1);

    // 3️⃣ New entry
    const newEntry = {
      date: date || new Date(),
      location: location || '',
      intensity: intensity || '',
      pain_type: pain_type || ''
    };

    // 4️⃣ Atomic update: append without overwriting
    await Patient.updateOne(
      { 'Patient.FirebaseUid': firebaseUid },
      { $set: { [`Patient.Pain_log.${nextIndex}`]: newEntry } }
    );

    // 5️⃣ Return confirmation
    res.status(201).json({
      message: 'Pain log entry added successfully',
      entry: newEntry,
      index: nextIndex
    });

  } catch (err) {
    console.error('Error adding pain log:', err);
    res.status(500).json({ error: 'Failed to add pain log', details: err.message });
  }
});





/**
 * GET /painLogSelf
 *
 * Retrieve all pain log entries for the authenticated patient.
 *
 * Finds the patient document in MongoDB using the Firebase UID from
 * the verified authentication token, then returns only the `Pain_log`
 * field from that record. This allows patients to load their pain
 * history without fetching unrelated data.
 *
 * Example request:
 *  GET /painLogSelf
 *
 * Auth:
 *  - authenticateToken middleware required
 *  - requireRole('patient')
 *
 * Responses:
 *  - 200: { message, painLog }
 *  - 404: Patient record not found or no pain logs available
 *  - 500: Server error
 */
app.get('/painLogSelf', authenticateToken, requireRole('patient'), async (req, res) => {
  try {
    const Patient = await getPatientModel();

    // 1️⃣ Find patient record by Firebase UID
    const patient = await Patient.findOne({ 'Patient.FirebaseUid': req.user.uid });

    if (!patient) {
      return res.status(404).json({ error: 'Patient record not found' });
    }

    // 2️⃣ Extract and return pain log data
    const painLog = patient.Patient?.Pain_log || {};

    if (Object.keys(painLog).length === 0) {
      return res.status(404).json({ error: 'No pain log entries found' });
    }

    // 3️⃣ Return all pain log entries
    res.status(200).json({
      message: 'Pain log retrieved successfully',
      painLog
    });

  } catch (err) {
    console.error('Error fetching pain log:', err);
    res.status(500).json({ error: 'Failed to retrieve pain log', details: err.message });
  }
});


//TOADD: MEASUREMENT LOG ENDPOINT, S3 INTEGRATION REQUIRED @RAGHAV CHECK testing/




// API Routes
app.use('/api/chat', chatRoutes);
app.use('/api/users', userRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});






// Socket.IO Authentication Middleware
io.use(async (socket, next) => {
  try {
    // Try to get token from multiple locations
    const token = socket.handshake.auth.token ||
      socket.handshake.query.token ||
      socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Get user from database
    const user = await User.findOne({ firebaseUid: decodedToken.uid });

    if (!user) {
      return next(new Error('User not found'));
    }

    // Attach user info to socket
    socket.userId = user._id.toString();
    socket.userFirebaseUid = decodedToken.uid;
    socket.userRole = user.role;
    socket.userName = user.displayName || user.email;

    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    next(new Error('Authentication failed'));
  }
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userName} (${socket.userId})`);

  // Join user's personal room
  socket.join(socket.userId);

  // Handle sending messages
  socket.on('send_message', async (data) => {
    try {
      const { recipientId, content, messageType = 'text' } = data;

      if (!content || !recipientId) {
        socket.emit('error', { message: 'Content and recipientId are required' });
        return;
      }

      // Get sender and recipient info
      const sender = await User.findById(socket.userId);
      const recipient = await User.findById(recipientId);

      if (!recipient) {
        socket.emit('error', { message: 'Recipient not found' });
        return;
      }

      // Create and save message
      const message = new Message({
        senderId: sender._id,
        senderFirebaseUid: sender.firebaseUid,
        senderName: sender.displayName || sender.email,
        senderRole: sender.role,
        recipientId: recipient._id,
        recipientFirebaseUid: recipient.firebaseUid,
        content,
        messageType,
      });

      await message.save();
      await message.populate('senderId', 'displayName email role');
      await message.populate('recipientId', 'displayName email role');

      // Send to recipient if online
      io.to(recipientId).emit('new_message', message);

      // Confirm to sender
      socket.emit('message_sent', message);

      console.log(`Message from ${sender.displayName} to ${recipient.displayName}`);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle marking messages as read
  socket.on('mark_read', async (data) => {
    try {
      const { messageId } = data;

      const message = await Message.findOneAndUpdate(
        { _id: messageId, recipientId: socket.userId },
        { $set: { isRead: true, readAt: new Date() } },
        { new: true }
      );

      if (message) {
        // Notify sender that message was read
        io.to(message.senderId.toString()).emit('message_read', {
          messageId: message._id,
          readAt: message.readAt
        });
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    const { recipientId, isTyping } = data;
    io.to(recipientId).emit('user_typing', {
      userId: socket.userId,
      userName: socket.userName,
      isTyping
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userName} (${socket.userId})`);
  });
});

// Initialize server
const startServer = async () => {
  try {
    // Initialize Firebase Admin
    initializeFirebase();

    // Connect to MongoDB
    await connectDB();

    // Start server
    const PORT = process.env.PORT || 8080;
    const HOST = '0.0.0.0';
    server.listen(PORT, HOST, () => {
      console.log(`\n✅ Server running at http://${HOST}:${PORT}`);
      console.log(`WebSocket server ready`);
      console.log(`Firebase Admin initialized`);
      console.log(`MongoDB connected`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

console.log("EB CI/CD working perfectly at", new Date());

// Start the server
startServer();




module.exports = { app, server, io };


