require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, getDocs } = require('firebase/firestore');
const db = require('./db');

async function syncLocalToFirestore() {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };

  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.warn("⚠️ Firebase API keys not found in environment. Unable to sync to Cloud Firestore directly.");
    return false;
  }

  try {
    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);
    console.log("🔥 [Sync] Connected to Cloud Firestore. Starting sync...");

    // 1. Sync Quests (Master Quest List)
    const quests = db.loadLocalQuests();
    console.log(`📡 [Sync] Uploading ${quests.length} master quests to Firestore 'quests' collection...`);
    for (const q of quests) {
      await setDoc(doc(firestore, "quests", q.id), q, { merge: true });
    }
    console.log(`✅ [Sync] Successfully synced ${quests.length} quests.`);

    // 2. Sync User Decks
    const decks = db.loadLocalDecks();
    const deckUids = Object.keys(decks);
    if (deckUids.length > 0) {
      console.log(`📡 [Sync] Uploading ${deckUids.length} user decks to Firestore 'user_decks' collection...`);
      for (const uid of deckUids) {
        await setDoc(doc(firestore, "user_decks", uid), decks[uid], { merge: true });
      }
      console.log(`✅ [Sync] Successfully synced user decks.`);
    }

    // 3. Sync Users Points / CV
    const users = db.loadLocalUsers();
    const userUids = Object.keys(users);
    if (userUids.length > 0) {
      console.log(`📡 [Sync] Uploading ${userUids.length} user profiles to Firestore 'users' collection...`);
      for (const uid of userUids) {
        await setDoc(doc(firestore, "users", uid), users[uid], { merge: true });
      }
      console.log(`✅ [Sync] Successfully synced users.`);
    }

    // 4. Sync Submissions
    const subs = db.loadLocalSubmissions();
    if (subs.length > 0) {
      console.log(`📡 [Sync] Uploading ${subs.length} submissions to Firestore 'submissions' collection...`);
      for (const s of subs) {
        if (s.id) {
          await setDoc(doc(firestore, "submissions", s.id), s, { merge: true });
        }
      }
      console.log(`✅ [Sync] Successfully synced submissions.`);
    }

    console.log("🎉 [Sync] Complete! All local JSON databases synced to Cloud Firestore.");
    return true;
  } catch (err) {
    console.error("❌ [Sync] Firestore sync failed:", err.message);
    return false;
  }
}

if (require.main === module) {
  syncLocalToFirestore();
}

module.exports = {
  syncLocalToFirestore
};
