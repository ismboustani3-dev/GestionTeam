import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import fs from 'fs';
import path from 'path';

async function loadHistory() {
  const history: any = {};
  try {
    const colRef = collection(db, 'blacklist_history');
    const querySnapshot = await getDocs(colRef);
    querySnapshot.forEach((doc) => {
      history[doc.id] = doc.data().results || {};
    });
  } catch (e) {
    console.error('Failed to load history from firebase', e);
  }

  // Fallback to local backup file if firebase load returned no history
  if (Object.keys(history).length === 0) {
    try {
      const localPath = path.join(process.cwd(), 'blacklist-history.json');
      if (fs.existsSync(localPath)) {
        return JSON.parse(fs.readFileSync(localPath, 'utf8'));
      }
    } catch (e) {
      console.error('Failed to load fallback history from file', e);
    }
  }

  return history;
}

async function saveHistoryForDate(date: string, results: any) {
  try {
    const docRef = doc(db, 'blacklist_history', date);
    const docSnap = await getDoc(docRef);
    let existingResults = docSnap.exists() ? (docSnap.data().results || {}) : {};
    const updatedResults = {
      ...existingResults,
      ...results
    };
    await setDoc(docRef, { results: updatedResults }, { merge: true });
  } catch (e) {
    console.error(`Failed to save history for date ${date} to firebase`, e);
  }

  // Update local file backup
  try {
    const localPath = path.join(process.cwd(), 'blacklist-history.json');
    let localData: any = {};
    if (fs.existsSync(localPath)) {
      try {
        localData = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      } catch (err) {}
    }
    localData[date] = {
      ...localData[date],
      ...results
    };
    fs.writeFileSync(localPath, JSON.stringify(localData, null, 2));
  } catch (e) {
    console.error('Failed to update local backup file', e);
  }
}

export async function GET(request: NextRequest) {
  const data = await loadHistory();
  return NextResponse.json({ history: data });
}

export async function POST(request: NextRequest) {
  try {
    const { date, results } = await request.json();
    if (!date || !results) {
      return NextResponse.json({ error: 'Missing date or results' }, { status: 400 });
    }

    await saveHistoryForDate(date, results);
    
    const docRef = doc(db, 'blacklist_history', date);
    const docSnap = await getDoc(docRef);
    const count = docSnap.exists() ? Object.keys(docSnap.data().results || {}).length : Object.keys(results).length;

    return NextResponse.json({ success: true, count });
  } catch (e: any) {
    console.error('[BLACKLIST-HISTORY] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
