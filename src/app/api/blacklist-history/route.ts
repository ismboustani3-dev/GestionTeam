import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const DOC_REF = doc(db, 'appData', 'blacklist_history');

async function loadHistory() {
  try {
    const snap = await getDoc(DOC_REF);
    if (snap.exists()) {
      return snap.data().history || {};
    }
  } catch (e) {
    console.error('Failed to load history from firebase', e);
  }
  return {};
}

import fs from 'fs';
import path from 'path';

async function saveHistory(history: any) {
  try {
    await setDoc(DOC_REF, { history });
  } catch (e) {
    console.error('Failed to save history to firebase', e);
  }
  try {
    fs.writeFileSync(path.join(process.cwd(), 'blacklist-history.json'), JSON.stringify(history, null, 2));
  } catch (e) {}
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

    const data = await loadHistory();
    // Merge new results with existing ones for that date, if any
    data[date] = {
      ...data[date],
      ...results
    };

    await saveHistory(data);
    return NextResponse.json({ success: true, count: Object.keys(data[date]).length });
  } catch (e: any) {
    console.error('[BLACKLIST-HISTORY] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
