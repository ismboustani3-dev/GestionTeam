const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const fs = require('fs');

const firebaseConfig = {
  apiKey: "AIzaSyCPoDZ0pSYIyUgeciVDbKkILhkUXZ8AJ4g",
  authDomain: "gestionteamnew.firebaseapp.com",
  projectId: "gestionteamnew",
  storageBucket: "gestionteamnew.firebasestorage.app",
  messagingSenderId: "682522030466",
  appId: "1:682522030466:web:c1c41cd3c024653332df9b",
  measurementId: "G-DDNN7CD4HT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function recoverAll() {
  try {
    if (fs.existsSync('schedules.json')) {
      const data = JSON.parse(fs.readFileSync('schedules.json', 'utf-8'));
      await setDoc(doc(db, 'appData', 'schedules'), { schedules: data });
      console.log('Recovered schedules:', data.length);
    }
    if (fs.existsSync('cron-data.json')) {
      const data = JSON.parse(fs.readFileSync('cron-data.json', 'utf-8'));
      await setDoc(doc(db, 'appData', 'cron_data'), data);
      console.log('Recovered cron_data');
    }
    if (fs.existsSync('blacklist-history.json')) {
      const data = JSON.parse(fs.readFileSync('blacklist-history.json', 'utf-8'));
      await setDoc(doc(db, 'appData', 'blacklist_history'), { history: data });
      console.log('Recovered blacklist history:', data.length);
    }
    console.log('All files recovered!');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

recoverAll();
