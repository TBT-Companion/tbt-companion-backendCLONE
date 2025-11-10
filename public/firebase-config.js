// Firebase configuration
// This file should be configured with your Firebase project credentials
// You can find these in your Firebase Console > Project Settings

const firebaseConfig = {
    apiKey: "AIzaSyAKabZLaAaWBfOTfihLtixmIOqVo0yz5d8",
    authDomain: "osucomprop4.firebaseapp.com",
    projectId: "osucomprop4",
    storageBucket: "osucomprop4.firebasestorage.app",
    messagingSenderId: "677045339633",
    appId: "1:677045339633:ios:fe0b50b043dca92a643050" // Replace with your web app ID from Firebase Console
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export auth instance
const auth = firebase.auth();

