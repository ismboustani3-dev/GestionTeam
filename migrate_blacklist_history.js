const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyCPoDZ0pSYIyUgeciVDbKkILhkUXZ8AJ4g",
  authDomain: "gestionteamnew.firebaseapp.com",
  projectId: "gestionteamnew",
  storageBucket: "gestionteamnew.firebasestorage.app",
  messagingSenderId: "682522030466",
  appId: "1:682522030466:web:c1c41cd3c024653332df9b",
  measurementId: "G-DDNN7CD4HT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runMigration() {
  const jsonPath = path.join(__dirname, 'blacklist-history.json');
  console.log(`Reading blacklist history from: ${jsonPath}`);
  
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: blacklist-history.json file not found!');
    process.exit(1);
  }

  let historyData;
  try {
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    historyData = JSON.parse(rawData);
  } catch (err) {
    console.error('Error reading/parsing blacklist-history.json:', err);
    process.exit(1);
  }

  const dateKeys = Object.keys(historyData).sort();
  console.log(`Found ${dateKeys.length} dates to migrate.`);

  for (let i = 0; i < dateKeys.length; i++) {
    const dateKey = dateKeys[i];
    const results = historyData[dateKey];
    const totalRecords = Object.keys(results).length;
    
    console.log(`[${i + 1}/${dateKeys.length}] Migrating date ${dateKey} with ${totalRecords} records...`);
    
    try {
      const docRef = doc(db, 'blacklist_history', dateKey);
      await setDoc(docRef, { results });
      console.log(` Successfully migrated ${dateKey}`);
    } catch (err) {
      console.error(`❌ Failed to migrate date ${dateKey}:`, err);
    }
  }

  console.log('Migration finished!');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed with critical error:', err);
  process.exit(1);
});
