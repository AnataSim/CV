const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });
// Load parent Next.js env.local for Firebase Config
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  doc, 
  deleteDoc, 
  collection, 
  getDocs 
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

async function main() {
  console.log(`🤖 Starting Global User Decks Reset Script...`);
  console.log(`🔑 Project ID: ${firebaseConfig.projectId}`);

  // 1. Reset local user_decks.json database file
  const DECKS_FILE = path.join(__dirname, 'database/user_decks.json');
  try {
    fs.writeFileSync(DECKS_FILE, '{}', 'utf8');
    console.log(`✅ [Local] Reset user_decks.json to empty object.`);
  } catch (err) {
    console.error(`❌ [Local] Failed to write user_decks.json:`, err.message);
  }

  // 2. Connect to Firestore and delete all documents in user_decks collection
  if (!firebaseConfig.projectId) {
    console.warn("⚠️ Firebase config is missing. Firestore reset skipped.");
    return;
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  try {
    console.log(`\n🔍 Fetching all documents from Firestore 'user_decks' collection...`);
    const decksRef = collection(db, "user_decks");
    const snapshot = await getDocs(decksRef);

    console.log(`Found ${snapshot.size} deck document(s) in Firestore.`);
    for (const deckDoc of snapshot.docs) {
      const uid = deckDoc.id;
      console.log(`   Deleting deck for UID: ${uid}`);
      await deleteDoc(doc(db, "user_decks", uid));
      console.log(`   ✅ Deleted user_decks/${uid}`);
    }

    console.log(`\n🎉 Reset completed successfully for all user card decks!`);
  } catch (err) {
    console.error(`\n❌ Error during Firestore reset operation:`, err.message);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
