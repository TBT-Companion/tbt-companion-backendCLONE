# 🩺 TBT-Companion Backend

Backend server for the **TBT (Transverse Bone Transport) Companion App**, supporting both **iOS patients** and a **Doctor Web Portal** for real-time monitoring, messaging, and treatment tracking.

---

## 🚀 Features

- 🔐 **Firebase Authentication** integration (patients, doctors, admins)
- 🧠 **MongoDB** with Mongoose for persistent data storage
- 🗣️ **Real-time chat** via Socket.IO
- 📸 **AWS S3 uploads** for patient wound measurement history
- 🩻 **Doctor Web Portal** for patient management and messaging
- 🧩 **Role-based access control** (Patient / Doctor / Admin)
- 🧰 Modular REST API for user, patient, and chat management

---

## 🧱 Tech Stack

| Component | Technology |
|------------|-------------|
| Server | Node.js (Express) |
| Database | MongoDB (Mongoose) |
| Authentication | Firebase Admin SDK |
| Real-Time | Socket.IO |
| File Storage | AWS S3 (public-read uploads) |

---

## ⚙️ Prerequisites

- Node.js v16+
- MongoDB or MongoDB Atlas cluster
- Firebase project + service account credentials
- AWS S3 bucket with IAM access keys

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory:

```env
PORT=3000
NODE_ENV=development


MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/tbt-companion
PATIENT_DB_URI=mongodb+srv://tbt-user:PRWNdXTK3FtWJ1YS@cluster0.kskb9mz.mongodb.net/patient_database?retryWrites=true&w=majority&appName=Cluster0


FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=your-s3-bucket-name

CORS_ORIGIN=*
```

> ✅ The `.env` included in Git should already work. If not, configure manually.

---

## 🧑‍💻 Installation & Usage

### Development
```bash
npm install
npm run dev
```

Server will run at:
```
http://localhost:3000
```

### Production
```bash
npm start
```

---

## 🩻 Doctor Web Portal

Once the server is running, doctors can access:
```
http://localhost:3000
```

**Portal Features**
- Firebase Authentication (email/password or Google Sign-in)
- Real-time messaging with patients
- Patient management dashboard
- Typing indicators and read receipts
- Responsive web design for desktop and mobile

---

## ⚙️ AWS S3 Upload Configuration

Patient wound measurement images are uploaded to AWS S3 using `ACL: public-read`.

### Workflow
1. Patient uploads image → Node.js backend
2. Backend uploads to S3 bucket under `uploads/`
3. Public S3 URL (non-expiring) is stored in MongoDB
4. Doctors view images directly via permanent S3 link

### Example Bucket Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicRead",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::YOUR_BUCKET/uploads/*"
  }]
}
```

---

## 🔐 Authentication

All endpoints (except `/health` and `/createAuthAccount`) require a valid Firebase ID token in the header:

```
Authorization: Bearer <firebase-id-token>
```

---

## 🩸 API Endpoints

### 🧠 General

| Method | Route | Auth | Description |
|--------|--------|------|-------------|
| **GET** | `/health` | None | Health check (server status, uptime) |

---

### 🧑‍⚕️ Doctor/Admin Routes

| Method | Route | Description |
|--------|--------|-------------|
| **GET** | `/patientsList` | Get list of all patients (first name, last name, email) |
| **GET** | `/patient/:id` | Get full patient record by ID |
| **PUT** | `/updatePatient/:id` | Update nested patient fields (using `Patient.field_name` keys) |
| **POST** | `/createPatient` | Create a complete new patient record |
| **GET** | `/patient/:id/measurements` *(planned)* | View a patient’s measurement history |

**Access:** Doctor / Admin only.

---

### 🧍 Patient Routes

| Method | Route | Description |
|--------|--------|-------------|
| **POST** | `/createAuthAccount` | Link a Firebase Auth account to a MongoDB patient record (no auth required) |
| **POST** | `/addPainLog` | Add a new pain log entry (date, location, intensity, pain_type) |
| **POST** | `/addMeasurement` | Add wound measurement image (uploads to S3 and stores URL in MongoDB) |

**Access:** Patient authentication required for `/addPainLog` and `/addMeasurement`.

---

### 💬 Chat API (`/api/chat/*`)

| Method | Route | Description |
|--------|--------|-------------|
| **GET** | `/api/chat/conversations` | Get all user conversations |
| **GET** | `/api/chat/messages/:partnerId` | Get message history with a specific user |
| **POST** | `/api/chat/messages` | Send a new message |
| **PATCH** | `/api/chat/messages/:messageId/read` | Mark message as read |

**Access:** Any authenticated user.

---

### 👤 User API (`/api/users/*`)

| Method | Route | Description |
|--------|--------|-------------|
| **POST** | `/api/users/register` | Register a new user after Firebase authentication |
| **GET** | `/api/users/me` | Get current user profile |
| **PUT** | `/api/users/me` | Update current user profile |
| **GET** | `/api/users/doctors` | List all doctors |
| **GET** | `/api/users/patients` | Get patients assigned to the doctor |
| **POST** | `/api/users/assign-doctor` | Assign a doctor to a patient (admin only) |

---

## 🔌 WebSocket Events

| Direction | Event | Description |
|------------|--------|-------------|
| **Client → Server** | `send_message` | Send a new message |
| **Client → Server** | `mark_read` | Mark message as read |
| **Client → Server** | `typing` | Send typing indicator |
| **Server → Client** | `new_message` | Receive message in real-time |
| **Server → Client** | `message_sent` | Confirmation of message delivery |
| **Server → Client** | `message_read` | Notify when message has been read |
| **Server → Client** | `user_typing` | Show typing indicator |

---

## 🧰 Quick Utilities

### Update User Role
Grant doctor access:
```bash
node update-user-role.js <firebase-uid> doctor
```

### Assign Patient to Doctor
```bash
node assign-patient.js <patient-firebase-uid> <doctor-firebase-uid>
```

---
## 🧠 Example cURL Commands

Below are working examples for testing endpoints from the command line.
## 🧠 Example cURL Commands
---

### 🧑‍⚕️ Doctor/Admin Routes

#### **1️⃣ Get list of all patients**
```bash
curl -X GET http://localhost:3000/patientsList   -H "Authorization: Bearer DOCTOR_TOKEN"
```

#### **2️⃣ Get full patient record by ID**
```bash
curl -X GET http://localhost:3000/patient/PATIENT_ID   -H "Authorization: Bearer DOCTOR_TOKEN"
```

#### **3️⃣ Update patient fields**
```bash
curl -X PUT http://localhost:3000/updatePatient/PATIENT_ID   -H "Authorization: Bearer DOCTOR_TOKEN"   -H "Content-Type: application/json"   -d '{
    "first_name": "Updated",
    "last_name": "Name",
    "email": "updated_email@example.com"
  }'
```
> 🧩 The backend automatically prefixes fields as `Patient.first_name`, etc.

#### **4️⃣ Create a new patient**
```bash
curl -X POST http://localhost:3000/createPatient   -H "Authorization: Bearer DOCTOR_TOKEN"   -H "Content-Type: application/json"   -d '{
    "first_name": "Maria",
    "last_name": "Rodriguez",
    "email": "maria@example.com",
    "phone_number": "614-555-9283",
    "Treatment_cycle": {
      "start_date": "2025-10-15",
      "end_date": "2026-01-15",
      "num_rotations": 4,
      "start_time": "08:30 AM",
      "recorded_turns": 0
    },
    "Measurement_history": {
      "1": {
        "date": "2025-10-27",
        "image_ref": "https://example.org/uploads/maria_measurement1.png"
      }
    },
    "Pain_log": {
      "1": {
        "date": "2025-10-26",
        "location": "Left leg",
        "intensity": "7",
        "pain_type": "Sharp pain"
      }
    },
    "conversationID": "conv_maria9283"
  }'
```

#### **5️⃣ View a patient’s measurement history**
*(if implemented)*
```bash
curl -X GET http://localhost:3000/patient/PATIENT_ID/measurements   -H "Authorization: Bearer DOCTOR_TOKEN"
```

---

### 🧍 Patient Routes

#### **1️⃣ Link Firebase Auth to patient record**
```bash
curl -X POST http://localhost:3000/createAuthAccount   -H "Content-Type: application/json"   -d '{
    "firebaseUid": "ABC123FirebaseUID",
    "email": "patient@example.com",
    "patientMongoId": "PATIENT_ID"
  }'
```

#### **2️⃣ Add a pain log entry**
```bash
curl -X POST http://localhost:3000/addPainLog   -H "Authorization: Bearer PATIENT_TOKEN"   -H "Content-Type: application/json"   -d '{
    "date": "2025-10-28",
    "location": "Left leg",
    "intensity": "6",
    "pain_type": "Dull ache"
  }'
```

### 🧍 Patient Self Routes

#### **1️⃣ Get the authenticated patient’s full record**
```bash
curl -X GET http://localhost:3000/patientSelf \
  -H "Authorization: Bearer PATIENT_TOKEN"
```

  # FOR PAIN LOGS ONLY: 
  curl -X GET http://localhost:3000/painLogSelf \
  -H "Authorization: Bearer PATIENT_TOKEN"


#### **3️⃣ Add a wound measurement (with image upload)**
> Uploads image → S3 → stores permanent URL in MongoDB.

```bash
curl -X POST http://localhost:3000/addMeasurement   -H "Authorization: Bearer PATIENT_TOKEN"   -F "patientMongoId=PATIENT_ID"   -F "description=Wound checkup photo"   -F "image=@/path/to/wound_photo.png"
```

---

### 🧩 Notes
- Replace `DOCTOR_TOKEN` or `PATIENT_TOKEN` with a real Firebase ID token.
- Replace `PATIENT_ID` with the patient’s `_id` from MongoDB.
- JSON routes (`-d '{...}'`) require `-H "Content-Type: application/json"`.
- File uploads (`addMeasurement`) require `-F` form fields.

## 📜 License

ISC