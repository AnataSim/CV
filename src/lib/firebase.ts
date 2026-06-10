import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Redirect non-fatal network fetch and offline connection errors to console.warn to prevent Next.js dev overlay from popping up
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    let isFirebaseError = false;
    
    for (const arg of args) {
      if (!arg) continue;
      
      let strVal = "";
      if (typeof arg === "object") {
        try {
          strVal = `${arg.message || ""} ${arg.code || ""} ${arg.name || ""} ${arg.stack || ""} ${JSON.stringify(arg)}`;
        } catch {
          try {
            strVal = `${arg.message || ""} ${arg.toString ? arg.toString() : ""}`;
          } catch {
            strVal = "[Unserializable Object]";
          }
        }
      } else {
        strVal = String(arg);
      }
      
      const lower = strVal.toLowerCase();
      if (
        lower.includes("permission_denied") ||
        lower.includes("permission-denied") ||
        lower.includes("firestore") ||
        lower.includes("firebase") ||
        lower.includes("grpcconnection") ||
        lower.includes("crunchyweb") ||
        lower.includes("grpc") ||
        lower.includes("failed to fetch") ||
        lower.includes("could not reach cloud firestore")
      ) {
        isFirebaseError = true;
        break;
      }
    }

    if (isFirebaseError) {
      console.warn("⚠️ [Intercepted Firestore Error]:", ...args);
      return;
    }
    originalError(...args);
  };

  // Prevent uncaught exceptions/rejections from Firestore from crashing the UI
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason?.message || reason?.toString() || "";
    if (
      msg.includes("PERMISSION_DENIED") ||
      msg.includes("Cloud Firestore API has not been used") ||
      msg.includes("firestore.googleapis.com") ||
      msg.includes("GrpcConnection RPC") ||
      msg.includes("crunchyweb")
    ) {
      console.warn("⚠️ Intercepted uncaught Firestore rejection:", reason);
      event.preventDefault();
    }
  });

  window.addEventListener("error", (event) => {
    const msg = event.message || "";
    const errorMsg = event.error?.message || event.error?.toString() || "";
    if (
      msg.includes("PERMISSION_DENIED") ||
      msg.includes("Cloud Firestore API has not been used") ||
      msg.includes("firestore.googleapis.com") ||
      errorMsg.includes("PERMISSION_DENIED") ||
      errorMsg.includes("Cloud Firestore API has not been used") ||
      errorMsg.includes("firestore.googleapis.com")
    ) {
      console.warn("⚠️ Intercepted uncaught Firestore error:", event.error || msg);
      event.preventDefault();
    }
  });
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
