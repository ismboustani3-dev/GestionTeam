import { NextRequest, NextResponse } from 'next/server';
import { loadWarmupFromFirebase, saveWarmupToFirebase } from '@/lib/firebaseTeams';

export async function GET() {
  try {
    const data = await loadWarmupFromFirebase();
    return NextResponse.json(data || {});
  } catch (error) {
    console.error('Failed to get warmup data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      teamName, 
      serverName, 
      ip, 
      day, 
      sent, 
      inbox, 
      spam, 
      status 
    } = body;

    if (!serverName) {
      return NextResponse.json({ error: 'serverName is required' }, { status: 400 });
    }

    // Load existing warmup data
    const warmupData = (await loadWarmupFromFirebase()) || {};

    // Determine target team name (default to 'REDA' if not specified)
    let targetTeam = teamName;
    if (!targetTeam) {
      // Look up existing server in any team
      const teams = Object.keys(warmupData);
      for (const t of teams) {
        const found = warmupData[t]?.find(
          (s: any) => s.serverName.toLowerCase() === serverName.toLowerCase()
        );
        if (found) {
          targetTeam = t;
          break;
        }
      }
      if (!targetTeam) {
        targetTeam = 'REDA'; // Fallback
      }
    }

    if (!warmupData[targetTeam]) {
      warmupData[targetTeam] = [];
    }

    const dayNum = typeof day === 'string' ? parseInt(day, 10) : (day || 1);
    const sentNum = typeof sent === 'string' ? parseInt(sent, 10) : (sent || 0);
    const inboxNum = typeof inbox === 'string' ? parseInt(inbox, 10) : (inbox || 0);
    const spamNum = typeof spam === 'string' ? parseInt(spam, 10) : (spam || 0);
    const serverStatus = status || 'Warmup';

    // Find the server row
    let serverIndex = warmupData[targetTeam].findIndex(
      (s: any) => s.serverName.toLowerCase() === serverName.toLowerCase()
    );

    const todayDate = new Date().toLocaleDateString('fr-FR');

    const historyEntry = {
      day: dayNum,
      sent: sentNum,
      inbox: inboxNum,
      spam: spamNum,
      status: serverStatus,
      date: todayDate,
    };

    if (serverIndex > -1) {
      // Update existing server details
      const existing = warmupData[targetTeam][serverIndex];
      existing.ip = ip || existing.ip || '';
      existing.currentDay = dayNum;
      existing.status = serverStatus;
      existing.sent = sentNum;
      existing.inbox = inboxNum;
      existing.spam = spamNum;

      if (!existing.history) {
        existing.history = [];
      }

      // Check if day entry already exists in history
      const histIndex = existing.history.findIndex((h: any) => h.day === dayNum);
      if (histIndex > -1) {
        existing.history[histIndex] = historyEntry;
      } else {
        existing.history.push(historyEntry);
      }

      // Sort history by day
      existing.history.sort((a: any, b: any) => a.day - b.day);
      warmupData[targetTeam][serverIndex] = existing;
    } else {
      // Create new server row
      const newServer = {
        id: `warmup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        serverName,
        ip: ip || '',
        currentDay: dayNum,
        status: serverStatus,
        sent: sentNum,
        inbox: inboxNum,
        spam: spamNum,
        history: [historyEntry],
      };
      warmupData[targetTeam].push(newServer);
    }

    // Save back to Firebase
    await saveWarmupToFirebase(warmupData);

    return NextResponse.json({ success: true, data: warmupData });
  } catch (error) {
    console.error('Failed to process warmup update:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
