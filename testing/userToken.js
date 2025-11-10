// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// 🔥 Your Firebase config (replace this with your actual config)
const firebaseConfig = {
    apiKey: "AIzaSyAKabZLaAaWBfOTfihLtixmIOqVo0yz5d8",
    authDomain: "osucomprop4.firebaseapp.com",
    projectId: "osucomprop4",
    storageBucket: "osucomprop4.firebasestorage.app",
    messagingSenderId: "677045339633",
    appId: "1:677045339633:ios:fe0b50b043dca92a643050" // Replace with your web app ID from Firebase Console
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Get DOM elements
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");

// Handle sign-up
signupBtn.addEventListener("click", async () => {
  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const token = await user.getIdToken();
    message.textContent = `✅ User created successfully`;
    console.log("ID token:", token);
    
  } catch (error) {
    message.textContent = `❌ Error: ${error.message}`;
  }
});

// Handle login
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    message.textContent = `✅ Logged in as ${email}`;
    const token = await user.getIdToken();
    console.log("ID token:", token);
    
  } catch (error) {
    message.textContent = `❌ Error: ${error.message}`;
  }
});
