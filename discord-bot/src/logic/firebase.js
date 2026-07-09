const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');
const state = require('../utils/state');

function initializeFirebase() {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };

  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    try {
      const firebaseApp = initializeApp(firebaseConfig);
      state.db = getFirestore(firebaseApp);
      console.log("🔥 [Firebase] Firebase Admin / SDK diinisialisasi.");
    } catch (err) {
      console.error("❌ [Firebase] Gagal inisialisasi SDK Firebase:", err.message);
    }
  } else {
    console.log("ℹ️ [Firebase] Environment Firebase tidak lengkap. Mode simulasi lokal diaktifkan.");
  }
}

module.exports = {
  initializeFirebase
};
