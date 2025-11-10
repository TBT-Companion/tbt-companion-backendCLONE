# TBT Companion - Doctor Web Portal

A modern, responsive web application for doctors to communicate with patients and monitor their TBT (Transverse Bone Transport) treatment progress.

## Features

- 🔐 **Secure Authentication** - Firebase authentication with email/password and Google sign-in
- 💬 **Real-time Chat** - WebSocket-powered messaging with typing indicators
- 👥 **Patient Management** - View and manage assigned patients
- 📊 **Dashboard** - Quick overview of patients and unread messages
- 📱 **Responsive Design** - Works seamlessly on desktop, tablet, and mobile
- ✓ **Read Receipts** - See when patients read your messages
- 🔔 **Live Updates** - Instant notifications for new messages

## Setup

### 1. Configure Firebase

Edit `firebase-config.js` with your Firebase project credentials:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

You can find these values in:
- Firebase Console → Project Settings → General → Your apps → Web app

### 2. Start the Server

Make sure the backend server is running:

```bash
cd /Users/hower/Documents/tbt-server
npm run dev
```

### 3. Access the Portal

Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### For Doctors

1. **Sign In**
   - Use your registered doctor email and password
   - Or sign in with Google
   - Only accounts with "doctor" or "admin" role can access

2. **View Patients**
   - All assigned patients appear in the left sidebar
   - Unread message counts are shown as badges
   - Use the search box to filter patients

3. **Chat with Patients**
   - Click on a patient to open the chat
   - View patient information at the top
   - Send messages in real-time
   - See when patients are typing
   - Check when your messages are read (✓✓)

4. **Patient Information**
   - Medical Record Number
   - Date of Birth
   - Phone Number
   - Treatment Start Date
   - Last Login Time

### For Administrators

To create a doctor account:

1. Sign up via the portal (will create as patient by default)
2. Update the user's role in MongoDB:
   ```javascript
   db.users.updateOne(
     { email: "doctor@example.com" },
     { $set: { role: "doctor" } }
   )
   ```
3. Assign patients to the doctor using the API endpoint:
   ```bash
   POST /api/users/assign-doctor
   {
     "patientId": "patient-mongo-id",
     "doctorId": "doctor-mongo-id"
   }
   ```

## Technical Details

### Tech Stack
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Authentication**: Firebase Auth
- **Real-time**: Socket.IO
- **Backend**: Node.js + Express
- **Database**: MongoDB

### API Endpoints Used
- `GET /api/users/me` - Get current user profile
- `GET /api/users/patients` - Get assigned patients
- `GET /api/chat/conversations` - Get all conversations
- `GET /api/chat/messages/:patientId` - Get chat history
- `POST /api/chat/messages` - Send message (fallback)

### WebSocket Events
- `send_message` - Send a message
- `new_message` - Receive new messages
- `message_sent` - Confirmation of sent message
- `message_read` - Message read notification
- `typing` - Send/receive typing indicators

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (iOS Safari, Chrome Mobile)

## Security

- All API requests require Firebase authentication token
- Role-based access control (doctors/admins only)
- Tokens are stored in localStorage
- WebSocket connections are authenticated
- Input is sanitized to prevent XSS

## Troubleshooting

### "Access denied" error after Google sign-in
**Problem**: You see "Access denied. This portal is only for doctors."

**Cause**: Your account doesn't have the 'doctor' or 'admin' role in the database.

**Solution**:
1. New users are automatically registered as 'patient' by default
2. An administrator needs to update your role in MongoDB:
   ```javascript
   db.users.updateOne(
     { email: "your.email@example.com" },
     { $set: { role: "doctor" } }
   )
   ```
3. Try signing in again after your role is updated

### Google sign-in keeps redirecting
**Problem**: Page jumps between login and dashboard repeatedly.

**Solution**: 
- This should be fixed in the latest version
- If it still occurs:
  1. Clear your browser cache and localStorage
  2. Sign out completely from Google in your browser
  3. Try signing in again
  4. Check browser console for errors

### "Access denied" error for existing doctor
- Make sure your account has the "doctor" or "admin" role in the database
- Verify your Firebase UID matches the one in the database
- Clear localStorage and try logging in again

### WebSocket not connecting
- Check that the backend server is running
- Verify the Firebase token is valid
- Check browser console for errors

### Messages not sending
- Check your internet connection
- Verify the backend server is accessible
- Check that the patient exists and is assigned to you

### Firebase configuration errors
- Double-check your Firebase credentials in `firebase-config.js`
- Ensure Firebase Authentication is enabled in your Firebase project
- Verify your domain is authorized in Firebase Console
- Make sure you've added a Web app in Firebase Console and copied the correct App ID

## Development

To modify the portal:

1. **Styling**: Edit `styles.css`
2. **Login Logic**: Edit `app.js`
3. **Dashboard Logic**: Edit `dashboard.js`
4. **Firebase Config**: Edit `firebase-config.js`
5. **HTML Structure**: Edit `index.html` and `dashboard.html`

No build step required - just refresh the browser after making changes!

## Support

For issues or questions, contact the development team or check the main project README.

