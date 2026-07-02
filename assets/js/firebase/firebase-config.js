/* ============================================
   FIREBASE CONFIG — firebase-config.js
   Firebase App Initialization (CDN compat v9)
   ============================================ */

/**
 * Firebase Configuration
 * ────────────────────────
 * IMPORTANT: Replace these placeholder values with your actual
 * Firebase project configuration from the Firebase Console:
 * Project Settings → General → Your apps → Firebase SDK snippet
 */
const firebaseConfig = {
  apiKey: "AIzaSyAM9w3HGtmdbSXcoOhcDMApUc2CHD4xlko",
  authDomain: "expense-tracker-d880f.firebaseapp.com",
  projectId: "expense-tracker-d880f",
  storageBucket: "expense-tracker-d880f.firebasestorage.app",
  messagingSenderId: "1041391456996",
  appId: "1:1041391456996:web:4f2f218b2c6cb7b1a192f1",
  measurementId: "G-RM8F0KG192"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Auth persistence — keep user logged in across sessions
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

console.log('🔥 Firebase initialized successfully');
