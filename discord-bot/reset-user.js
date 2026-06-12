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
  query, 
  where, 
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

const DISCORD_ID = "1051027211160928276";

async function main() {
  console.log(`🤖 Starting Firebase User Reset Script...`);
  console.log(`🔑 Project ID: ${firebaseConfig.projectId}`);
  console.log(`🎯 Target Discord ID: ${DISCORD_ID}`);

  if (!firebaseConfig.projectId) {
    console.error("❌ Firebase config is missing. Please check .env.local in the root folder.");
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  try {
    // 1. Delete from users collection where discordId == target
    console.log(`\n🔍 Searching 'users' collection...`);
    const usersRef = collection(db, "users");
    const userQuery = query(usersRef, where("discordId", "==", DISCORD_ID));
    const userSnapshot = await getDocs(userQuery);

    console.log(`Found ${userSnapshot.size} user document(s).`);
    for (const userDoc of userSnapshot.docs) {
      const userData = userDoc.data();
      const uid = userDoc.id;
      console.log(`   Deleting User: Name=${userData.name}, Email=${userData.email}, UID=${uid}`);
      
      // Delete user doc
      await deleteDoc(doc(db, "users", uid));
      console.log(`   ✅ Deleted users/${uid}`);

      // Delete corresponding deck from user_decks if exists
      try {
        await deleteDoc(doc(db, "user_decks", uid));
        console.log(`   ✅ Checked/Deleted user_decks/${uid}`);
      } catch (err) {
        console.warn(`   ⚠️ Failed to delete user_decks/${uid}:`, err.message);
      }

      // Delete from submissions where userId matches
      try {
        const subRef = collection(db, "submissions");
        const subQuery = query(subRef, where("userId", "==", uid));
        const subSnapshot = await getDocs(subQuery);
        for (const subDoc of subSnapshot.docs) {
          await deleteDoc(doc(db, "submissions", subDoc.id));
          console.log(`   ✅ Deleted submissions/${subDoc.id}`);
        }
      } catch (err) {
        console.warn(`   ⚠️ Failed to search/delete submissions for UID ${uid}:`, err.message);
      }
    }

    // 2. Try deleting simulated account document (sim-discord-DISCORD_ID)
    const simUid = `sim-discord-${DISCORD_ID}`;
    console.log(`\n🔍 Checking simulated user document: ${simUid}...`);
    try {
      await deleteDoc(doc(db, "users", simUid));
      console.log(`   ✅ Checked/Deleted users/${simUid}`);
      await deleteDoc(doc(db, "user_decks", simUid));
      console.log(`   ✅ Checked/Deleted user_decks/${simUid}`);
    } catch (err) {
      console.warn(`   ⚠️ Failed to delete simulated docs:`, err.message);
    }

    // 3. Delete from volunteerables where discordId == target
    console.log(`\n🔍 Checking volunteerables collection...`);
    try {
      await deleteDoc(doc(db, "volunteerables", DISCORD_ID));
      console.log(`   ✅ Checked/Deleted volunteerables/${DISCORD_ID}`);
    } catch (err) {
      console.warn(`   ⚠️ Failed to delete from volunteerables:`, err.message);
    }

    // 4. Delete submissions where discordId == target directly
    console.log(`\n🔍 Searching submissions by Discord ID...`);
    try {
      const subRef = collection(db, "submissions");
      const subQuery = query(subRef, where("discordId", "==", DISCORD_ID));
      const subSnapshot = await getDocs(subQuery);
      console.log(`Found ${subSnapshot.size} submission(s) matching Discord ID.`);
      for (const subDoc of subSnapshot.docs) {
        await deleteDoc(doc(db, "submissions", subDoc.id));
        console.log(`   ✅ Deleted submissions/${subDoc.id}`);
      }
    } catch (err) {
      console.warn(`   ⚠️ Failed to search/delete submissions by Discord ID:`, err.message);
    }

    console.log(`\n🎉 Reset completed successfully for Discord ID ${DISCORD_ID}!`);
  } catch (err) {
    console.error(`\n❌ Error during reset operation:`, err.message);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
