//ENDPOINT TESTING, DO NOT USE.


//full sample account creation: 
app.post('/createPatientAccount', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone_number } = req.body;
    const Patient = await getPatientModel();

    // basic validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // keep the same request shortcuts as in createPatient
    const b = req.body;
    const pb = b.Patient || {};

    // normalize email and build displayName safely
    const normalizedEmail = (email ?? b.email ?? pb.email ?? '').toString().trim().toLowerCase();
    const safeFirst = (first_name ?? b.first_name ?? pb.first_name ?? '').toString().trim();
    const safeLast = (last_name ?? b.last_name ?? pb.last_name ?? '').toString().trim();
    const displayName = `${safeFirst} ${safeLast}`.trim() || undefined;

    // 1️⃣ Create the user in Firebase Authentication
    let fbUser;
    try {
      fbUser = await admin.auth().createUser({
        email: normalizedEmail,
        password,
        displayName,
      });
      console.log('Firebase user created:', fbUser.uid);
    } catch (fbErr) {
      console.error('Firebase createUser error:', fbErr);
      if (fbErr.code === 'auth/email-already-exists' || fbErr.code === 'auth/invalid-email') {
        return res.status(409).json({ error: 'Firebase user could not be created', details: fbErr.message });
      }
      throw fbErr; // bubble up other Firebase errors
    }

    const doc = new Patient({
      Patient: {
        // identity
        first_name: safeFirst,
        last_name: safeLast,
        email: normalizedEmail,
        phone_number: phone_number ?? b.phone_number ?? pb.phone_number ?? '',

        // nested sections (all inside Patient)
        Treatment_cycle: {
          start_date: (pb.Treatment_cycle?.start_date ?? b.Treatment_cycle?.start_date) || null,
          end_date: (pb.Treatment_cycle?.end_date ?? b.Treatment_cycle?.end_date) || null,
          num_rotations: Number(
            (pb.Treatment_cycle?.num_rotations ?? b.Treatment_cycle?.num_rotations ?? 0)
          ),
          start_time: (pb.Treatment_cycle?.start_time ?? b.Treatment_cycle?.start_time) || null,
        },

        Measurement_history: {
          1: {
            date: (pb.Measurement_history?.['1']?.date ?? b.Measurement_history?.['1']?.date) || null,
            image_ref: (pb.Measurement_history?.['1']?.image_ref ?? b.Measurement_history?.['1']?.image_ref) || ''
          }
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
        FirebaseUid: fbUser.uid,
        conversationID: b.conversationID ?? pb.conversationID ?? ''
      }
    });

    // 2️⃣ Create the corresponding MongoDB document
    const saved = await doc.save();

    const toDate = (v) => (v ? new Date(v) : undefined);

    // b = req.body; pb = req.body.Patient || {}  (you already have these)
    const user = new User({
      firebaseUid: fbUser.uid,
      email: normalizedEmail,
      displayName: `${safeFirst} ${safeLast}`.trim(),
      role: 'patient',

      // optional doctor linkage fields (omit if not known)
      assignedDoctor: b.assignedDoctor ?? undefined,
      patients: Array.isArray(b.patients) ? b.patients : undefined,

      // patientInfo (all optional except whatever you choose to require)
      patientInfo: {
        dateOfBirth: toDate(b.dateOfBirth ?? b.patientInfo?.dateOfBirth),
        phoneNumber: phone_number ?? b.phone_number ?? b.patientInfo?.phoneNumber,
        medicalRecordNumber: b.medicalRecordNumber ?? b.patientInfo?.medicalRecordNumber,
        // prefer treatmentStartDate from the Patient doc you just built
        treatmentStartDate: toDate(
          doc?.Patient?.Treatment_cycle?.start_date ??
          b.treatmentStartDate ?? b.patientInfo?.treatmentStartDate
        ),
      },

      // account status (optional overrides)
      isActive: b.isActive ?? true,
      lastLogin: toDate(b.lastLogin) ?? new Date(),
    });

    // If you truly want to set timestamps yourself (optional):
    if (b.createdAt) user.set('createdAt', toDate(b.createdAt));
    if (b.updatedAt) user.set('updatedAt', toDate(b.updatedAt));

    await user.save();

    // 3️⃣ Return both UIDs to confirm creation
    res.status(201).json({
      message: 'Patient account created successfully',
      firebaseUid: fbUser.uid,
      mongoId: saved._id,
      mongoUserId: user._id,
    });
  } catch (error) {
    console.error('Error creating patient account:', error);
    // provide safer error info to client
    const message = error?.message || 'Failed to create patient account';
    res.status(500).json({ error: message });
  }
});