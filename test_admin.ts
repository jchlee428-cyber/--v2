import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

try {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  console.log("Config loaded:", config.projectId);
  
  const adminApp = admin.initializeApp({
    projectId: config.projectId
  });
  
  const db = getFirestore(adminApp, config.firestoreDatabaseId);
  db.collection('test').doc('admin-test').set({ timestamp: admin.firestore.FieldValue.serverTimestamp() })
    .then(() => {
      console.log("Admin write success");
      process.exit(0);
    })
    .catch(e => {
      console.error("Admin write failed:", e);
      process.exit(1);
    });
} catch (e) {
  console.error("Setup failed:", e);
  process.exit(1);
}
