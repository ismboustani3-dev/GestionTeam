import { NextRequest, NextResponse } from 'next/server';
import { loadTeamsFromFirebase, loadWarmupFromFirebase, saveWarmupToFirebase } from '@/lib/firebaseTeams';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Telegram sends message or channel_post in update payload
    const msg = body.message || body.channel_post;
    const text = msg?.text;

    if (!text) {
      return NextResponse.json({ success: true, warning: 'No message text found in payload' });
    }

    console.log('[Telegram Webhook] Received warmup update text:', text);

    // 1. SMART TEXT PARSING
    const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
    
    let inbox = 0;
    let sent = 0;
    let serverName = '';
    let ip = '';
    
    // Parse IP address using standard regex
    const ipRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;
    const ipMatch = text.match(ipRegex);
    if (ipMatch) {
      ip = ipMatch[1];
    }
    
    // Parse inbox count "(IN)" and sent count "(OUT)"
    const inMatch = text.match(/(\d+)\s*\(IN\)/i);
    if (inMatch) {
      inbox = parseInt(inMatch[1], 10);
    }
    const outMatch = text.match(/(\d+)\s*\(OUT\)/i);
    if (outMatch) {
      sent = parseInt(outMatch[1], 10);
    }
    
    // Parse server name
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 1) {
        const candidate = parts[0];
        // Server names typically contain hyphens, underscores, or specific formats
        if (candidate.includes('_') || candidate.includes('-') || /^[a-zA-Z]{1,3}\d+/.test(candidate)) {
          // Avoid matching utility labels/keys
          if (!/return|path|posted|by|ip/i.test(candidate)) {
            serverName = candidate;
            break;
          }
        }
      }
    }

    if (!serverName) {
      console.warn('[Telegram Webhook] Could not identify serverName from message:', text);
      return NextResponse.json({ success: true, error: 'Could not identify serverName' });
    }

    const spam = Math.max(0, sent - inbox);
    const todayStr = new Date().toLocaleDateString('fr-FR');

    // 2. TEAM RESOLUTION
    const fbTeams = await loadTeamsFromFirebase() || [];
    let targetTeam = '';

    // Search active server inventory to find which team owns this serverName
    for (const t of fbTeams) {
      const hasServer = t.servers?.some(
        (s: any) => s.serverName.toLowerCase() === serverName.toLowerCase() && s.status !== 'deleted'
      );
      if (hasServer) {
        targetTeam = t.name;
        break;
      }
    }

    // Keyword fallback if server isn't found in inventory yet
    if (!targetTeam) {
      const lowerText = text.toLowerCase();
      if (lowerText.includes('amine')) {
        targetTeam = 'AMINE';
      } else if (lowerText.includes('reda')) {
        targetTeam = 'REDA';
      } else if (lowerText.includes('khalid')) {
        targetTeam = 'KHALID';
      } else if (lowerText.includes('yassine')) {
        targetTeam = 'YASSINE';
      } else {
        targetTeam = 'REDA'; // Final fallback
      }
    }

    // 3. DATABASE SAVE & MERGE
    const warmupData = (await loadWarmupFromFirebase()) || {};
    if (!warmupData[targetTeam]) {
      warmupData[targetTeam] = [];
    }

    let serverIndex = warmupData[targetTeam].findIndex(
      (s: any) => s.serverName.toLowerCase() === serverName.toLowerCase()
    );

    let dayNum = 1;
    let historyList: any[] = [];
    let existingRecord: any = null;

    if (serverIndex > -1) {
      existingRecord = warmupData[targetTeam][serverIndex];
      historyList = existingRecord.history || [];
    }

    // Auto-calculate the Day / Step
    if (historyList.length > 0) {
      // Find the last day logged in history
      const sortedHist = [...historyList].sort((a: any, b: any) => a.day - b.day);
      const lastEntry = sortedHist[sortedHist.length - 1];

      if (lastEntry.date === todayStr) {
        // Same day: update the existing day's logs
        dayNum = lastEntry.day;
      } else {
        // New day: increment to next warmup step!
        dayNum = lastEntry.day + 1;
      }
    }

    const historyEntry = {
      day: dayNum,
      sent: sent,
      inbox: inbox,
      spam: spam,
      status: 'Warmup', // Default status during active webhook posts
      date: todayStr,
    };

    if (serverIndex > -1) {
      // Update
      existingRecord.ip = ip || existingRecord.ip || '';
      existingRecord.currentDay = dayNum;
      existingRecord.sent = sent;
      existingRecord.inbox = inbox;
      existingRecord.spam = spam;

      const histIndex = historyList.findIndex((h: any) => h.day === dayNum);
      if (histIndex > -1) {
        historyList[histIndex] = historyEntry;
      } else {
        historyList.push(historyEntry);
      }
      historyList.sort((a: any, b: any) => a.day - b.day);
      existingRecord.history = historyList;
      
      warmupData[targetTeam][serverIndex] = existingRecord;
    } else {
      // Create new warmup logs list
      const newServer = {
        id: `warmup_db_${Date.now()}`,
        serverName: serverName,
        ip: ip || '',
        currentDay: dayNum,
        status: 'Warmup',
        sent: sent,
        inbox: inbox,
        spam: spam,
        history: [historyEntry],
      };
      warmupData[targetTeam].push(newServer);
    }

    // Save back to Firestore
    await saveWarmupToFirebase(warmupData);

    console.log(`[Telegram Webhook] Successfully recorded log for Server "${serverName}" (Day ${dayNum}) under Team "${targetTeam}"`);

    return NextResponse.json({ 
      success: true, 
      parsed: { serverName, ip, sent, inbox, spam, day: dayNum, team: targetTeam } 
    });
  } catch (error) {
    console.error('[Telegram Webhook] Internal server error:', error);
    // Always return success 200/201 to Telegram so it doesn't retry failed messages repeatedly
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 200 });
  }
}
