import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Redirect non-fatal network fetch and offline connection errors to console.warn to prevent Next.js dev overlay from popping up
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const msg = args[0]?.toString() || "";
    if (
      msg.includes("Failed to fetch") ||
      msg.includes("Could not reach Cloud Firestore") ||
      msg.includes("FirebaseError") ||
      msg.includes("Gagal menginisialisasi Firebase")
    ) {
      console.warn(...args);
      return;
    }
    originalError(...args);
  };
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ""
};

// Deteksi apakah kredensial Firebase sudah disediakan
export const isFirebaseConfigured = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== "your_firebase_api_key_here";

let app;
let auth: any = null;
let db: any = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("🔥 Firebase SDK berhasil diinisialisasi secara aktif.");
  } catch (err) {
    console.error("⚠️ Gagal menginisialisasi Firebase SDK:", err);
  }
} else {
  console.log("⚙️ Firebase belum dikonfigurasi. Sistem CrunchyVerse berjalan dalam MODE SIMULASI DATABASE LOKAL.");
}

export { auth, db };
export default app;
