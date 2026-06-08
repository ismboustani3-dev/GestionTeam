import { NextResponse } from 'next/server';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import path from 'path';
import fs from 'fs';

export async function GET() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cron-data.json'), 'utf-8'));
    const DOC_REF = doc(db, 'appData', 'teams');
    await setDoc(DOC_REF, { teams: data.teams });
    return NextResponse.json({ success: true, count: data.teams?.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
