//**Add to Measurement History Endpoint**
// const fs = require('fs');
// const multer = require('multer');
// const AWS = require('aws-sdk');
// const upload = multer({ dest: 'uploads/' });
// const s3 = new AWS.S3({
//   region: process.env.AWS_REGION,
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
// });
// app.post('/addMeasurement', authenticatePatient, upload.single('image'), async (req, res) => {
//   try {
//     const { patientMongoId, description } = req.body;
//     const Patient = await getPatientModel();

//     if (!req.file) {
//       return res.status(400).json({ error: 'No image file uploaded' });
//     }

//     // Prepare upload parameters for S3
//     const fileContent = fs.createReadStream(req.file.path);
//     const s3Key = `uploads/${Date.now()}_${req.file.originalname}`;

//     const params = {
//       Bucket: process.env.S3_BUCKET,
//       Key: s3Key,
//       Body: fileContent,
//       ACL: 'public-read', // 👈 makes image accessible via permanent link
//       ContentType: req.file.mimetype,
//     };

//     // Upload to S3
//     const data = await s3.upload(params).promise();

//     // Clean up local temp file
//     fs.unlinkSync(req.file.path);

//     // Store public link in MongoDB
//     const measurementId = Date.now().toString();
//     const updated = await Patient.findByIdAndUpdate(
//       patientMongoId,
//       {
//         $set: {
//           [`Measurement_history.${measurementId}`]: {
//             date: new Date().toISOString(),
//             image_ref: data.Location, // Permanent public S3 URL
//             description: description || '',
//           },
//         },
//       },
//       { new: true }
//     );

//     res.json({
//       message: 'Measurement added successfully',
//       image_url: data.Location,
//       Measurement_history: updated.Measurement_history,
//     });
//   } catch (err) {
//     console.error('Error adding measurement:', err);
//     res.status(500).json({ error: 'Failed to add measurement' });
//   }
// });