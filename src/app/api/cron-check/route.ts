import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import imap from 'imap-simple';
import dns from 'dns';
const { resolveTxt, resolve4, reverse } = dns.promises;

const TELEGRAM_BOT_TOKEN = '8547636296:AAHmj28T3mh10XWLa9epa5sX5vuMYLLpyY8';
const TELEGRAM_CHAT_ID = '629979553';

// Group Topics — Nouvelle config
const TELEGRAM_GROUP_ID = '-1003727951074';
const TOPIC_RDNS_THREAD_ID = 5;
const TOPIC_SPF_THREAD_ID = 7;
const TOPIC_VMTA_THREAD_ID = 9;
const TOPIC_BLACKLIST_THREAD_ID = 11;
const TOPIC_DATABASE_THREAD_ID = 43;
const TOPIC_IP_STATUS_THREAD_ID = 41;
const CRON_DATA_REF = doc(db, 'appData', 'cron_data');

interface CronData {
  lastVmta: Record<string, string>;  // IP -> domain mapping from last check
  teams: any[];
}

async function loadCronData(): Promise<CronData> {
  try {
    const snap = await getDoc(CRON_DATA_REF);
    if (snap.exists()) {
      return snap.data() as CronData;
    }
  } catch (e) { /* ignore */ }
  return { lastVmta: {}, teams: [] };
}

import fs from 'fs';
import path from 'path';

async function saveCronData(data: CronData) {
  try {
    await setDoc(CRON_DATA_REF, data);
  } catch (e) { console.error('Failed to save cron data', e); }
  try {
    fs.writeFileSync(path.join(process.cwd(), 'cron-data.json'), JSON.stringify(data, null, 2));
  } catch (e) {}
}

async function sendTelegram(message: string) {
  try {
    let finalMessage = message;
    
    // Safety fallback just in case, but we shouldn't hit it anymore
    if (finalMessage.length > 4000) {
      finalMessage = finalMessage.slice(0, 3900) + '\n\n... [TRUNCATED]';
      // simple hack to close tags if sliced in middle
      finalMessage = finalMessage.replace(/<[^>]*$/g, '');
    }

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: finalMessage,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[CRON] Telegram API error:', res.status, errText);
    } else {
      console.log('[CRON] Telegram sent successfully!');
    }
  } catch (e) {
    console.error('[CRON] Telegram fetch error:', e);
  }
}

// Envoyer dans un topic spécifique d'un groupe Telegram (forum group)
async function sendTelegramTopic(message: string, chatId: string, threadId: number) {
  try {
    const lines = message.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
      if (line.length > 3800) {
        if (currentChunk) { chunks.push(currentChunk); currentChunk = ''; }
        let remaining = line;
        while (remaining.length > 3800) {
          chunks.push(remaining.slice(0, 3800));
          remaining = remaining.slice(3800);
        }
        currentChunk = remaining;
      } else if (currentChunk.length + line.length + 1 > 3800) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n' + line : line;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    for (let i = 0; i < chunks.length; i++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: threadId,
          text: chunks[i],
          parse_mode: 'HTML',
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[CRON] Topic Telegram error (chunk ${i+1}/${chunks.length}):`, res.status, errText);
      } else {
        console.log(`[CRON] Topic Telegram sent (chunk ${i+1}/${chunks.length})`);
      }
    }
  } catch (e) {
    console.error('[CRON] sendTelegramTopic fetch error:', e);
  }
}

async function fetchVmtaMapping(): Promise<Record<string, string>> {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const mapping: Record<string, string> = {};

  const connection = await imap.connect({
    imap: {
      user: process.env.GMAIL_USER,
      password: process.env.GMAIL_PASS,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 3000
    }
  });

  const searchCriteria = [['SINCE', new Date(oneHourAgo)]];
  const fetchOptions = { bodies: ['HEADER', 'TEXT'], struct: true };

  await connection.openBox('INBOX');
  const messagesInbox = await connection.search(searchCriteria, fetchOptions);

  let messagesSpam: any[] = [];
  try {
    await connection.openBox('[Gmail]/Spam');
    messagesSpam = await connection.search(searchCriteria, fetchOptions);
  } catch (e) {
    try {
      await connection.openBox('Spam');
      messagesSpam = await connection.search(searchCriteria, fetchOptions);
    } catch (e2) { /* ignore */ }
  }

  const messages = [...messagesInbox, ...messagesSpam];

  for (const item of messages) {
    const headerPart = item.parts.find((p: any) => p.which === 'HEADER');
    if (!headerPart || !headerPart.body || !headerPart.body.received) continue;

    const received = headerPart.body.received;
    const lines = Array.isArray(received) ? received : [received];
    for (const line of lines) {
      const ipMatch = /\[([0-9]{1,3}(?:\.[0-9]{1,3}){3})\]/.exec(line);
      if (ipMatch) {
        const ip = ipMatch[1];
        const before = line.slice(0, ipMatch.index);
        const fromMatch = /from\s+([a-zA-Z0-9.-]+)/i.exec(before);
        if (fromMatch) {
          mapping[ip] = fromMatch[1];
        }
      }
    }
  }

  await connection.end();
  return mapping;
}

async function runVmtaCheck(teamName: string) {
  console.log(`[CRON] Running VMTA check for team: ${teamName}`);
  const cronData = await loadCronData();
  const teams = cronData.teams;
  
  if (!teams || teams.length === 0) {
    console.log('[CRON] No teams data available for VMTA check');
    return;
  }

  const newMapping = await fetchVmtaMapping();
  const oldMapping = cronData.lastVmta || {};

  const targetTeams = teamName === 'all' ? teams : teams.filter((t: any) => t.name === teamName);
  
  const changedAlerts: string[] = [];
  const emptyAlerts: string[] = [];

  for (const team of targetTeams) {
    const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
    
    for (const server of activeServers) {
      const allIps: string[] = [];
      if (server.mainIp) allIps.push(server.mainIp);
      const uniqueDomains = getUniqueIpDomains(server.ipDomains);
      uniqueDomains.forEach((d: any) => allIps.push(d.ip));

      for (const ip of allIps) {
        const oldVmta = oldMapping[ip];
        const newVmta = newMapping[ip];

        if (newVmta) {
          if (oldVmta && oldVmta !== newVmta) {
            changedAlerts.push(`⚠️ <b>${server.serverName}</b> - <code>${ip}</code>\n   <i>${oldVmta}</i> ➡️ <i>${newVmta}</i>`);
          }
        } else {
          emptyAlerts.push(`🔴 <b>${server.serverName}</b> - <code>${ip}</code> (No VMTA found)`);
        }
      }
    }
  }

  // Save new mapping as last check
  cronData.lastVmta = newMapping;
  await saveCronData(cronData);

  // Send Telegram if there are alerts
  if (changedAlerts.length > 0 || emptyAlerts.length > 0) {
    const now = new Date().toLocaleString('en-US');
    let msg = `🤖 <b>AUTO VMTA CHECK</b>\n📅 ${now}\n\n`;

    if (changedAlerts.length > 0) {
      msg += `<b>🔄 CHANGED VMTAs:</b>\n${changedAlerts.join('\n')}\n\n`;
    }
    if (emptyAlerts.length > 0) {
      msg += `<b>❌ MISSING VMTAs:</b>\n${emptyAlerts.join('\n')}\n`;
    }

    await sendTelegramTopic(msg, TELEGRAM_GROUP_ID, TOPIC_VMTA_THREAD_ID);
  } else {
    const now = new Date().toLocaleString('en-US');
    await sendTelegramTopic(`✅ <b>AUTO VMTA CHECK</b>\n📅 ${now}\n\nAll VMTAs unchanged. Everything OK! 🎉`, TELEGRAM_GROUP_ID, TOPIC_VMTA_THREAD_ID);
  }
}

async function runRdnsCheck(teamName: string) {
  console.log(`[CRON] Running RDNS check for team: ${teamName}`);
  const cronData = await loadCronData();
  const teams = cronData.teams;
  
  if (!teams || teams.length === 0) {
    console.log('[CRON] No teams data available for RDNS check');
    return;
  }

  // Load IP Status history to update it daily
  const IP_STATUS_REF = doc(db, 'appData', 'ip_status');
  let ipStatus: any = {};
  try {
    const snap = await getDoc(IP_STATUS_REF);
    if (snap.exists() && snap.data().history) ipStatus = snap.data().history;
  } catch (e) {
    console.error('[CRON] Failed to load ipStatus from Firebase in runRdnsCheck:', e);
  }
  const todayKey = new Date().toISOString().split('T')[0];
  let ipStatusChanged = false;

  const targetTeams = teamName === 'all' ? teams : teams.filter((t: any) => t.name === teamName);
  const allTeamReports: string[] = [];

  for (const team of targetTeams) {
    const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
    if (activeServers.length === 0) continue;

    const failedByServer: { serverName: string; failedIps: { ip: string; ptr: string }[] }[] = [];

    for (const server of activeServers) {
      const failedIps: { ip: string; ptr: string }[] = [];

      const uniqueDomains = getUniqueIpDomains(server.ipDomains);
      if (uniqueDomains.length > 0) {
        for (const mapping of uniqueDomains) {
          let isOk = false;
          try {
            const ptrs = await reverse(mapping.ip);
            isOk = ptrs.some((ptr: string) =>
              ptr.toLowerCase() === mapping.domain.toLowerCase() ||
              ptr.toLowerCase() === mapping.domain.toLowerCase() + '.'
            );
            if (!isOk) {
              failedIps.push({ ip: mapping.ip, ptr: ptrs.join(', ') || 'No Record' });
            }
          } catch (e: any) {
            failedIps.push({ ip: mapping.ip, ptr: e.code || 'FAIL' });
          }

          // Update ipStatus
          if (!ipStatus[mapping.ip]) ipStatus[mapping.ip] = {};
          const current = ipStatus[mapping.ip][todayKey];
          const protectStatuses = ['Change DOM', 'DOWN', 'BOUNCE', 'TO', 'PAUSED'];
          if (isOk) {
            if (!current || current === 'RDNS Not Active') {
              ipStatus[mapping.ip][todayKey] = 'RDNS';
              ipStatusChanged = true;
            }
          } else {
            if (!current || (!protectStatuses.includes(current) && current !== 'RDNS Not Active')) {
              const hasBeenChangeDom = Object.values(ipStatus[mapping.ip]).includes('Change DOM');
              ipStatus[mapping.ip][todayKey] = hasBeenChangeDom ? 'Change DOM' : 'RDNS Not Active';
              ipStatusChanged = true;
            }
          }
        }
      } else if (server.mainIp) {
        let isOk = false;
        try {
          const ptrs = await reverse(server.mainIp);
          isOk = ptrs.length > 0;
          if (!isOk) {
            failedIps.push({ ip: server.mainIp, ptr: 'No Record' });
          }
        } catch (e: any) {
          failedIps.push({ ip: server.mainIp, ptr: e.code || 'FAIL' });
        }

        // Update ipStatus
        if (!ipStatus[server.mainIp]) ipStatus[server.mainIp] = {};
        const current = ipStatus[server.mainIp][todayKey];
        const protectStatuses = ['Change DOM', 'DOWN', 'BOUNCE', 'TO', 'PAUSED'];
        if (isOk) {
          if (!current || current === 'RDNS Not Active') {
            ipStatus[server.mainIp][todayKey] = 'RDNS';
            ipStatusChanged = true;
          }
        } else {
          if (!current || (!protectStatuses.includes(current) && current !== 'RDNS Not Active')) {
            const hasBeenChangeDom = Object.values(ipStatus[server.mainIp]).includes('Change DOM');
            ipStatus[server.mainIp][todayKey] = hasBeenChangeDom ? 'Change DOM' : 'RDNS Not Active';
            ipStatusChanged = true;
          }
        }
      }

      if (failedIps.length > 0) {
        failedByServer.push({ serverName: server.serverName, failedIps });
      }
    }

    if (failedByServer.length > 0) {
      let teamMsg = `🔴 <b>Team ${team.name}</b>\n`;
      failedByServer.forEach(entry => {
        teamMsg += `  🖥️ <b>${entry.serverName}</b>\n`;
        entry.failedIps.forEach(ip => {
          teamMsg += `     ❌ ${ip.ip} → ${ip.ptr}\n`;
        });
      });
      allTeamReports.push(teamMsg);
    } else {
      allTeamReports.push(`✅ <b>Team ${team.name}</b> — All IPs OK!\n`);
    }
  }

  // Save updated ipStatus back to Firestore
  if (ipStatusChanged) {
    try {
      await setDoc(IP_STATUS_REF, { history: ipStatus });
      console.log('[CRON] Updated ip_status from runRdnsCheck');
    } catch(e) {
      console.error('[CRON] Failed to save ipStatus in runRdnsCheck:', e);
    }
  }

  const now = new Date().toLocaleString('en-US');
  let finalMsg = `🤖 <b>AUTO RDNS CHECK</b>\n📅 ${now}\n${'─'.repeat(25)}\n\n`;
  finalMsg += allTeamReports.join('\n');
  // Envoyer dans le topic RDNS du groupe
  await sendTelegramTopic(finalMsg, TELEGRAM_GROUP_ID, TOPIC_RDNS_THREAD_ID);
}

async function runBlacklistCheck(type: string, teamName: string) {
  console.log(`[CRON] Running Blacklist check (${type}) for team: ${teamName}`);
  const cronData = await loadCronData();
  const teams = cronData.teams;
  
  if (!teams || teams.length === 0) {
    console.log('[CRON] No teams data available for Blacklist check');
    return;
  }

  const checkIps = type === 'blacklist_ips' || type === 'blacklist_both';
  const checkDomains = type === 'blacklist_domains' || type === 'blacklist_both';
  const targetTeams = teamName === 'all' ? teams : teams.filter((t: any) => t.name === teamName);
  
  const itemsToCheck: { serverName: string, ip: string, domain: string, teamName: string }[] = [];
  
  targetTeams.forEach((t: any) => {
    const activeServers = (t.servers || []).filter((s: any) => s.status !== 'deleted');
    activeServers.forEach((s: any) => {
      const uniqueDomains = getUniqueIpDomains(s.ipDomains);
      if (checkIps) {
        if (s.mainIp) itemsToCheck.push({ serverName: s.serverName, ip: s.mainIp, domain: 'No Domain', teamName: t.name });
        uniqueDomains.forEach((d: any) => {
          itemsToCheck.push({ serverName: s.serverName, ip: d.ip, domain: 'No Domain', teamName: t.name });
        });
      }
      if (checkDomains) {
        uniqueDomains.forEach((d: any) => {
          if (d.domain) itemsToCheck.push({ serverName: s.serverName, ip: '', domain: d.domain, teamName: t.name });
        });
      }
    });
  });

  const uniqueItems = Array.from(new Set(itemsToCheck.map(i => JSON.stringify(i)))).map(s => JSON.parse(s));

  if (uniqueItems.length === 0) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  // Call the internal blacklist API to reuse its DNS checking logic
  try {
    const response = await fetch(`${baseUrl}/api/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: uniqueItems })
    });
    const data = await response.json();

    if (data.results) {
      // Load history data first for yesterday comparison
      const DOC_REF = doc(db, 'appData', 'blacklist_history');
      let historyData: any = {};
      try {
        const snap = await getDoc(DOC_REF);
        if (snap.exists()) {
          historyData = snap.data().history || {};
        }
      } catch (e) {
        console.error('[CRON] Failed to load history from Firebase:', e);
      }

      const teamStats: Record<string, { total: number, sbl: number, css: number, barra: number, dbl: number, clean: number }> = {};
      let globalTotal = 0;
      let globalClean = 0;

      data.results.forEach((r: any) => {
        const itemInfo = uniqueItems.find((i: any) => i.ip === r.ip && i.serverName === r.serverName && i.domain === r.domain);
        if (!itemInfo) return;

        const tName = itemInfo.teamName;
        if (!teamStats[tName]) teamStats[tName] = { total: 0, sbl: 0, css: 0, barra: 0, dbl: 0, clean: 0 };

        globalTotal++;
        teamStats[tName].total++;
        const isListed = r.sbl || r.css || r.barracuda || r.dbl;
        
        if (isListed) {
          if (r.sbl) teamStats[tName].sbl++;
          if (r.css) teamStats[tName].css++;
          if (r.barracuda) teamStats[tName].barra++;
          if (r.dbl) teamStats[tName].dbl++;
        } else {
          teamStats[tName].clean++;
          globalClean++;
        }
      });

      // Calculate Yesterday's Stats
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = yesterday.toLocaleDateString('en-CA'); // reliable YYYY-MM-DD
      const yesterdayData = historyData[yesterdayKey] || {};

      const yesterdayTeamStats: Record<string, { total: number, sbl: number, css: number, barra: number, dbl: number, clean: number }> = {};
      let yesterdayGlobalTotal = 0;
      let yesterdayGlobalClean = 0;

      Object.keys(yesterdayData).forEach(key => {
        const entry = yesterdayData[key];
        if (!entry) return;

        const isIp = entry.ip && entry.ip !== '';
        const isDomain = entry.domain && entry.domain !== 'No Domain';
        
        if (checkIps && !isIp) return;
        if (checkDomains && !isDomain) return;

        // Parse serverName and teamName robustly
        let serverName = entry.serverName || '';
        let teamName = entry.teamName || '';
        
        if (!serverName) {
          if (key.includes('-')) {
            const dashIdx = key.indexOf('-');
            serverName = key.substring(0, dashIdx);
          } else if (key.includes('_')) {
            const parts = key.split('_');
            const ipIndex = parts.findIndex(p => p.includes('.') || p === 'noip');
            if (ipIndex > -1) {
              serverName = parts.slice(0, ipIndex).join('_');
            } else {
              serverName = parts[0];
            }
          } else {
            serverName = key;
          }
        }

        if (!teamName) {
          const foundTeam = teams.find(t => (t.servers || []).some((s: any) => s.serverName === serverName));
          teamName = foundTeam ? foundTeam.name : 'Unknown';
        }

        if (!yesterdayTeamStats[teamName]) {
          yesterdayTeamStats[teamName] = { total: 0, sbl: 0, css: 0, barra: 0, dbl: 0, clean: 0 };
        }

        // Check listings
        let sbl = !!entry.sbl;
        let css = !!entry.css;
        let barra = !!entry.barracuda;
        let dbl = !!entry.dbl;
        
        if (entry.activeLists && Array.isArray(entry.activeLists)) {
          sbl = entry.activeLists.includes('SBL');
          css = entry.activeLists.includes('CSS');
          barra = entry.activeLists.includes('BARRA');
          dbl = entry.activeLists.includes('DBL');
        }

        const isListed = entry.status === 'Listed' || sbl || css || barra || dbl;
        const status = entry.status || (isListed ? 'Listed' : 'Clean');

        yesterdayGlobalTotal++;
        yesterdayTeamStats[teamName].total++;

        if (status === 'Clean') {
          yesterdayTeamStats[teamName].clean++;
          yesterdayGlobalClean++;
        } else if (status === 'Listed') {
          if (sbl) yesterdayTeamStats[teamName].sbl++;
          if (css) yesterdayTeamStats[teamName].css++;
          if (barra) yesterdayTeamStats[teamName].barra++;
          if (dbl) yesterdayTeamStats[teamName].dbl++;
        }
      });

      // Format Monospace Table
      const formatHeader = () => {
        const paddedLabel = "".padEnd(22, ' ');
        const paddedToday = "TODAY".padEnd(14, ' ');
        return `${paddedLabel} ${paddedToday} YESTERDAY\n`;
      };

      const formatRow = (label: string, todayVal: string, yestVal: string) => {
        const paddedLabel = label.padEnd(22, ' ');
        const paddedToday = todayVal.padEnd(14, ' ');
        return `${paddedLabel} ${paddedToday} ${yestVal}\n`;
      };

      const formatPercent = (val: number, total: number) => {
        if (total === 0) return '0.00%';
        return `${((val / total) * 100).toFixed(2)}%`;
      };

      const todayCleanPct = formatPercent(globalClean, globalTotal);
      const todayListedPct = formatPercent(globalTotal - globalClean, globalTotal);
      const yestCleanPct = formatPercent(yesterdayGlobalClean, yesterdayGlobalTotal);
      const yestListedPct = formatPercent(yesterdayGlobalTotal - yesterdayGlobalClean, yesterdayGlobalTotal);

      let tableContent = formatHeader();
      tableContent += formatRow("Global Total Checked", String(globalTotal), String(yesterdayGlobalTotal));
      tableContent += formatRow("Global Clean", `${globalClean} (${todayCleanPct})`, `${yesterdayGlobalClean} (${yestCleanPct})`);
      tableContent += formatRow("Global Listed", `${globalTotal - globalClean} (${todayListedPct})`, `${yesterdayGlobalTotal - yesterdayGlobalClean} (${yestListedPct})`);
      tableContent += "\n";

      const allTeamsWithStats = Array.from(new Set([
        ...Object.keys(teamStats),
        ...Object.keys(yesterdayTeamStats)
      ])).sort();

      allTeamsWithStats.forEach(team => {
        const tToday = teamStats[team] || { total: 0, sbl: 0, css: 0, barra: 0, dbl: 0, clean: 0 };
        const tYest = yesterdayTeamStats[team] || { total: 0, sbl: 0, css: 0, barra: 0, dbl: 0, clean: 0 };
        
        tableContent += `[Team ${team}]\n`;
        tableContent += formatRow("Total Checked", String(tToday.total), String(tYest.total));
        tableContent += formatRow("Clean", String(tToday.clean), String(tYest.clean));
        if (checkIps) {
          tableContent += formatRow("SBL", String(tToday.sbl), String(tYest.sbl));
          tableContent += formatRow("CSS", String(tToday.css), String(tYest.css));
          tableContent += formatRow("Barracuda", String(tToday.barra), String(tYest.barra));
        }
        if (checkDomains) {
          tableContent += formatRow("DBL", String(tToday.dbl), String(tYest.dbl));
        }
        tableContent += "\n";
      });

      const now = new Date().toLocaleString('en-US');
      const displayType = type.replace('blacklist_', '').toUpperCase();
      let finalMsg = `🤖 <b>AUTO BLACKLIST CHECK (${displayType})</b>\n📅 ${now}\n${'─'.repeat(30)}\n`;
      finalMsg += `<pre>${tableContent}</pre>\n`;

      // Save to History File automatically
      try {
        const DOC_REF = doc(db, 'appData', 'blacklist_history');
        let historyData: any = {};
        const snap = await getDoc(DOC_REF);
        if (snap.exists()) {
          historyData = snap.data().history || {};
        }
        
        // Build resultsMap equivalent for today
        const dateKey = new Date().toISOString().split('T')[0];
        if (!historyData[dateKey]) historyData[dateKey] = {};
        
        data.results.forEach((r: any) => {
          const itemInfo = uniqueItems.find((i: any) => i.ip === r.ip && i.serverName === r.serverName && i.domain === r.domain);
          if (!itemInfo) return;
          
          const sblListed = r.sbl ? 'SBL' : '';
          const cssListed = r.css ? 'CSS' : '';
          const dblListed = r.dbl ? 'DBL' : '';
          const barraListed = r.barracuda ? 'BARRA' : '';
          const activeLists = [sblListed, cssListed, dblListed, barraListed].filter(Boolean);
          const status = activeLists.length > 0 ? 'Listed' : 'Clean';
          
          const uniqueKey = `${itemInfo.serverName}_${itemInfo.ip || 'noip'}_${itemInfo.domain || 'nodomain'}`;
          historyData[dateKey][uniqueKey] = {
            serverName: itemInfo.serverName,
            ip: itemInfo.ip,
            domain: itemInfo.domain,
            status,
            activeLists,
            teamName: itemInfo.teamName,
            timestamp: Date.now()
          };
        });
        
        await setDoc(DOC_REF, { history: historyData });

        // ── Daily Changes Comparison ──
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().split('T')[0];
        const todayData = historyData[dateKey] || {};
        const yesterdayData = historyData[yesterdayKey] || {};

        const newlyClean: string[] = [];
        const newlyListed: string[] = [];

        const parsedYesterdayMap: Record<string, any> = {};
        Object.keys(yesterdayData).forEach(key => {
          const entry = yesterdayData[key];
          if (!entry) return;
          
          let serverName = entry.serverName || '';
          if (!serverName) {
            if (key.includes('-')) {
              const dashIdx = key.indexOf('-');
              serverName = key.substring(0, dashIdx);
            } else if (key.includes('_')) {
              const parts = key.split('_');
              const ipIndex = parts.findIndex(p => p.includes('.') || p === 'noip');
              if (ipIndex > -1) {
                serverName = parts.slice(0, ipIndex).join('_');
              } else {
                serverName = parts[0];
              }
            } else {
              serverName = key;
            }
          }
          
          const ip = entry.ip || '';
          const domain = entry.domain || '';
          const identifier = `${serverName}_${checkIps ? ip : domain}`;
          parsedYesterdayMap[identifier] = entry;
        });

        Object.keys(todayData).forEach(key => {
          const todayEntry = todayData[key];
          let serverName = todayEntry.serverName || '';
          if (!serverName) {
            if (key.includes('-')) {
              const dashIdx = key.indexOf('-');
              serverName = key.substring(0, dashIdx);
            } else if (key.includes('_')) {
              const parts = key.split('_');
              const ipIndex = parts.findIndex(p => p.includes('.') || p === 'noip');
              if (ipIndex > -1) {
                serverName = parts.slice(0, ipIndex).join('_');
              } else {
                serverName = parts[0];
              }
            } else {
              serverName = key;
            }
          }
          
          const ip = todayEntry.ip || '';
          const domain = todayEntry.domain || '';
          const identifier = `${serverName}_${checkIps ? ip : domain}`;
          
          const yestEntry = parsedYesterdayMap[identifier];
          const label = todayEntry.ip || todayEntry.domain || key;
          if (yestEntry) {
            // Check listings
            let yestSbl = !!yestEntry.sbl;
            let yestCss = !!yestEntry.css;
            let yestBarra = !!yestEntry.barracuda;
            let yestDbl = !!yestEntry.dbl;
            if (yestEntry.activeLists && Array.isArray(yestEntry.activeLists)) {
              yestSbl = yestEntry.activeLists.includes('SBL');
              yestCss = yestEntry.activeLists.includes('CSS');
              yestBarra = yestEntry.activeLists.includes('BARRA');
              yestDbl = yestEntry.activeLists.includes('DBL');
            }
            const yestIsListed = yestEntry.status === 'Listed' || yestSbl || yestCss || yestBarra || yestDbl;
            const yestStatus = yestEntry.status || (yestIsListed ? 'Listed' : 'Clean');

            let todaySbl = !!todayEntry.sbl;
            let todayCss = !!todayEntry.css;
            let todayBarra = !!todayEntry.barracuda;
            let todayDbl = !!todayEntry.dbl;
            if (todayEntry.activeLists && Array.isArray(todayEntry.activeLists)) {
              todaySbl = todayEntry.activeLists.includes('SBL');
              todayCss = todayEntry.activeLists.includes('CSS');
              todayBarra = todayEntry.activeLists.includes('BARRA');
              todayDbl = todayEntry.activeLists.includes('DBL');
            }
            const todayIsListed = todayEntry.status === 'Listed' || todaySbl || todayCss || todayBarra || todayDbl;
            const todayStatus = todayEntry.status || (todayIsListed ? 'Listed' : 'Clean');

            if (yestStatus === 'Listed' && todayStatus === 'Clean') newlyClean.push(label);
            if (yestStatus === 'Clean' && todayStatus === 'Listed') newlyListed.push(label);
          }
        });

        if (newlyClean.length > 0 || newlyListed.length > 0) {
          finalMsg += '\n\xF0\x9F\x94\x84 <b>Daily Changes:</b>\n';
          if (newlyClean.length > 0) {
            finalMsg += '\u2728 <b>Newly Cleaned (' + newlyClean.length + '):</b>\n';
            newlyClean.slice(0, 30).forEach(ip => { finalMsg += '  \uD83D\uDFE2 ' + ip + '\n'; });
            if (newlyClean.length > 30) finalMsg += '  ... and ' + (newlyClean.length - 30) + ' more\n';
          }
          if (newlyListed.length > 0) {
            finalMsg += '\u26A0\uFE0F <b>Status Alert: ' + newlyListed.length + ' newly listed!</b>\n';
            newlyListed.slice(0, 30).forEach(ip => { finalMsg += '  \uD83D\uDD34 ' + ip + '\n'; });
            if (newlyListed.length > 30) finalMsg += '  ... and ' + (newlyListed.length - 30) + ' more\n';
          }
        }
      } catch (historyErr) {
        console.error('[CRON] Failed to save history to Firebase:', historyErr);
      }

      await sendTelegramTopic(finalMsg, TELEGRAM_GROUP_ID, TOPIC_BLACKLIST_THREAD_ID);
    }
  } catch (e) {
    console.error('[CRON] Failed to run blacklist check:', e);
  }
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  let day = 0, month = 0, year = 0;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/').map(Number);
    day = parts[0];
    month = parts[1];
    year = parts[2];
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-').map(Number);
    if (parts[0] > 1000) {
      year = parts[0];
      month = parts[1];
      day = parts[2];
    } else {
      day = parts[0];
      month = parts[1];
      year = parts[2];
    }
  } else {
    return null;
  }
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

async function runPaymentNoticeCheck(teamName: string) {
  console.log(`[CRON] Running Payment Notice check for team: ${teamName}`);
  const cronData = await loadCronData();
  const teams = cronData.teams;
  
  if (!teams || teams.length === 0) return;

  const targetTeams = teamName === 'all' ? teams : teams.filter((t: any) => t.name === teamName);
  
  let allTeamReports: string[] = [];
  
  targetTeams.forEach((team: any) => {
    const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
    let redAlerts: string[] = [];
    let orangeAlerts: string[] = [];
    
    activeServers.forEach((s: any) => {
      const d = parseDate(s.dateSortie); // Notice date
      if (!d) return;
      
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);
      
      const diffTime = d.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Kept (Grey) if it's more than 2 days overdue => ignore
      if (diffDays < -2) return;

      // Urgent (Red) between -2 days (overdue) and 3 days left
      if (diffDays >= -2 && diffDays <= 3) {
        redAlerts.push(`     🔴 <b>${s.serverName}</b> (IP: ${s.mainIp}) - <b>${diffDays < 0 ? 'OVERDUE (' + Math.abs(diffDays) + 'd)' : diffDays + ' days'}</b> (${s.dateSortie})`);
      } 
      // Warning (Orange) 4 to 7 days
      else if (diffDays >= 4 && diffDays <= 7) {
        orangeAlerts.push(`     🟠 <b>${s.serverName}</b> (IP: ${s.mainIp}) - <b>${diffDays} days</b> (${s.dateSortie})`);
      }
    });

    const teamAlerts = [...orangeAlerts, ...redAlerts];
    if (teamAlerts.length > 0) {
      allTeamReports.push(`🏢 <b>Team ${team.name}</b>\n${teamAlerts.join('\n')}\n`);
    }
  });

  const now = new Date().toLocaleString('en-US');
  let finalMsg = `🤖 <b>DAILY SERVER PAYMENT NOTICE</b>\n📅 ${now}\n${'─'.repeat(25)}\n\n`;
  
  if (allTeamReports.length === 0) {
    finalMsg += `✅ No servers require payment soon. All good!`;
  } else {
    finalMsg += allTeamReports.join('\n');
    finalMsg += `\n⚠️ <i>Please review these servers and decide whether to Keep or Cancel them.</i>`;
  }
  
  await sendTelegramTopic(finalMsg, TELEGRAM_GROUP_ID, TOPIC_DATABASE_THREAD_ID);
}

async function runOldAgeCheck(minDays: number, teamName: string) {
  console.log(`[CRON] Running Old Age Server check (>=${minDays} days) for team: ${teamName}`);
  const cronData = await loadCronData();
  const teams = cronData.teams || [];
  const targetTeams = teamName === 'all' ? teams : teams.filter((t: any) => t.name === teamName);
  
  let allTeamReports: string[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  targetTeams.forEach((team: any) => {
    const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
    let agedAlerts: string[] = [];
    
    activeServers.forEach((s: any) => {
      const d = parseDate(s.dateEntre);
      if (!d) return;
      d.setHours(0, 0, 0, 0);
      
      const diffTime = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      // Define "Old Age" as >= minDays days
      if (diffDays >= minDays) {
        agedAlerts.push(`     👴 <b>${s.serverName}</b> (IP: ${s.mainIp}) - <b>${diffDays} days old</b> (since ${s.dateEntre})`);
      }
    });

    if (agedAlerts.length > 0) {
      allTeamReports.push(`🏢 <b>Team ${team.name}</b>\n${agedAlerts.join('\n')}\n`);
    }
  });

  const nowStr = new Date().toLocaleString('en-US');
  let finalMsg = `🤖 <b>OLD AGE SERVER NOTICE (>=${minDays} Days)</b>\n📅 ${nowStr}\n${'─'.repeat(25)}\n\n`;
  
  if (allTeamReports.length === 0) {
    finalMsg += `✅ No old servers found (>=${minDays} days).`;
  } else {
    finalMsg += allTeamReports.join('\n');
    finalMsg += `\n⚠️ <i>Please review these old servers to decide if they should be replaced.</i>`;
  }
  
  await sendTelegramTopic(finalMsg, TELEGRAM_GROUP_ID, TOPIC_DATABASE_THREAD_ID);
}

async function runProviderCheck(providerName: string, teamName: string) {
  console.log(`[CRON] Running Provider check (${providerName}) for team: ${teamName}`);
  const cronData = await loadCronData();
  const teams = cronData.teams || [];
  const targetTeams = teamName === 'all' ? teams : teams.filter((t: any) => t.name === teamName);
  
  let allTeamReports: string[] = [];
  let totalProviderServers = 0;

  targetTeams.forEach((team: any) => {
    const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
    const matchingServers = activeServers.filter((s: any) => (s.provider || '').toLowerCase() === providerName.toLowerCase());
    
    if (matchingServers.length > 0) {
      totalProviderServers += matchingServers.length;
      let alerts: string[] = [];
      matchingServers.forEach((s: any) => {
        alerts.push(`     🖥️ <b>${s.serverName}</b> (IP: ${s.mainIp}) - ${s.nbrIps} IPs`);
      });
      allTeamReports.push(`🏢 <b>Team ${team.name}</b> (${matchingServers.length} servers)\n${alerts.join('\n')}\n`);
    }
  });

  const nowStr = new Date().toLocaleString('en-US');
  let finalMsg = `🤖 <b>PROVIDER REPORT: ${providerName.toUpperCase()}</b>\n📅 ${nowStr}\n${'─'.repeat(25)}\n`;
  finalMsg += `Total active servers: <b>${totalProviderServers}</b>\n\n`;
  
  if (allTeamReports.length === 0) {
    finalMsg += `✅ No active servers found for provider: ${providerName}.`;
  } else {
    finalMsg += allTeamReports.join('\n');
  }
  
  await sendTelegramTopic(finalMsg, TELEGRAM_GROUP_ID, TOPIC_DATABASE_THREAD_ID);
}

async function runSpfCheck(teamName: string) {
  console.log(`[CRON] Running SPF check for team: ${teamName}`);
  const cronData = await loadCronData();
  const teams = cronData.teams || [];
  const targetTeams = teamName === 'all' ? teams : teams.filter((t: any) => t.name === teamName);
  
  let failures: any[] = [];
  
  for (const team of targetTeams) {
    const servers = team.servers || [];
    for (const server of servers) {
      if (server.status === 'deleted') continue;
      
      const domainsToCheck = getUniqueIpDomains(server.ipDomains);
      for (const d of domainsToCheck) {
        if (!d.domain || !d.ip) continue;
        
        try {
          const records = await resolveTxt(d.domain);
          const txtStrings = records.map(r => r.join(''));
          const spfRecord = txtStrings.find(txt => txt.startsWith('v=spf1'));
          
          if (!spfRecord) {
             failures.push({ teamName: team.name, serverName: server.serverName, ip: d.ip, ptr: d.domain, reason: 'No SPF record found' });
          } else {
             let isValid = spfRecord.includes(d.ip);
             
             // If IP not explicitly in string, check if it relies on A record ('a' or 'a:')
             if (!isValid && (spfRecord.includes(' a ') || spfRecord.includes(' a:') || spfRecord.includes('=spf1 a ') || spfRecord.endsWith(' a') || spfRecord.includes('+a '))) {
               try {
                 const aRecords = await resolve4(d.domain);
                 if (aRecords.includes(d.ip)) {
                   isValid = true;
                 }
               } catch (e) {}
             }
             
             // If still not valid, check if it has an include or redirect that we can't easily parse
             // but let's just flag it for now if we can't prove it's valid
             if (!isValid) {
               failures.push({ teamName: team.name, serverName: server.serverName, ip: d.ip, ptr: d.domain, reason: 'IP not found in SPF' });
             }
          }
        } catch (e: any) {
          failures.push({ teamName: team.name, serverName: server.serverName, ip: d.ip, ptr: d.domain, reason: e.code === 'ENODATA' ? 'No TXT records' : e.message });
        }
      }
    }
  }

  const nowStr = new Date().toLocaleString('en-US');
  let msg = '';
  if (failures.length > 0) {
    msg = `🔍 <b>Hourly PTR SPF Check Failures</b>\nStatus: ⚠️ ISSUES DETECTED\n\n`;
    msg += `The following IPs do not have their corresponding server IP included in their PTR domain's SPF record:\n\n`;
    
    let displayFailures = failures;
    if (displayFailures.length > 25) {
      const extra = displayFailures.length - 25;
      displayFailures = displayFailures.slice(0, 25);
      msg += `<i>⚠️ Showing first 25 failures (Total: ${failures.length}). ${extra} more hidden.</i>\n\n`;
    }

    const groupedByTeam = displayFailures.reduce((acc, f) => {
      if (!acc[f.teamName]) acc[f.teamName] = [];
      acc[f.teamName].push(f);
      return acc;
    }, {} as Record<string, any[]>);

    (Object.entries(groupedByTeam) as [string, any[]][]).forEach(([team, items]) => {
      msg += `🏢 <b>Team ${team}</b>\n`;
      items.forEach((f: any) => {
        msg += `• <b>${f.serverName}</b>\n  IP: ${f.ip}\n  PTR: <code>${f.ptr}</code>\n  Reason: <i>${f.reason}</i>\n\n`;
      });
    });
    msg += `⏰ Check Time: ${nowStr}`;
    await sendTelegramTopic(msg, TELEGRAM_GROUP_ID, TOPIC_SPF_THREAD_ID);
  } else {
    msg = `🔍 <b>Hourly PTR SPF Check</b>\nStatus: ✅ ALL OK\n\n`;
    msg += `All domains have their corresponding IP in their SPF records.\n\n`;
    msg += `⏰ Check Time: ${nowStr}`;
    await sendTelegramTopic(msg, TELEGRAM_GROUP_ID, TOPIC_SPF_THREAD_ID);
  }
  return msg;
}

async function runImapSyncCheck(email: string, password?: string, inboxLabel?: string, teamName?: string) {
  console.log(`[CRON] Running IMAP Sync Check for ${email}`);
  if (!email || !password) {
    console.error('[CRON] IMAP Sync failed: Missing credentials');
    return;
  }
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  try {
    const res = await fetch(`${baseUrl}/api/imap-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, inboxLabel: inboxLabel || 'RP TEST' })
    });
    const data = await res.json();
    
    if (data.success && data.results) {
      const IP_STATUS_REF = doc(db, 'appData', 'ip_status');
      let ipStatus: any = {};
      try {
        const snap = await getDoc(IP_STATUS_REF);
        if (snap.exists() && snap.data().history) ipStatus = snap.data().history;
      } catch(e) {}
      
      const today = new Date().toISOString().split('T')[0];
      const resultsCount = Object.keys(data.results).length;
      
      const cronData = await loadCronData();
      const teams = cronData.teams || [];
      const protectStatuses = ['Change DOM', 'RDNS Not Active', 'DOWN', 'BOUNCE', 'TO', 'PAUSED'];

      // Gather active IPs of the selected team(s)
      const allActiveIps = new Set<string>();
      const targetTeams = (!teamName || teamName === 'all') ? teams : teams.filter((t: any) => t.name === teamName);
      targetTeams.forEach((team: any) => {
        const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
        activeServers.forEach((server: any) => {
          const uniqueDomains = getUniqueIpDomains(server.ipDomains);
          uniqueDomains.forEach((d: any) => {
            if (d.ip) allActiveIps.add(d.ip);
          });
          if (server.mainIp) allActiveIps.add(server.mainIp);
        });
      });

      allActiveIps.forEach(ip => {
        if (!ipStatus[ip]) ipStatus[ip] = {};
        const currentVal = ipStatus[ip][today];
        
        if (data.results[ip]) {
          if (!protectStatuses.includes(currentVal)) {
            ipStatus[ip][today] = data.results[ip];
          }
        } else {
          // Not found in IMAP -> clear/set to empty if not protected
          if (currentVal && !protectStatuses.includes(currentVal)) {
            delete ipStatus[ip][today];
          }
        }
      });
      
      await setDoc(IP_STATUS_REF, { history: ipStatus });
      
      const msg = `🤖 <b>AUTO IMAP SYNC</b>\n📅 ${new Date().toLocaleString('en-US')}\n\n✅ Successfully synced <b>${resultsCount}</b> IPs from <code>${email}</code>.\n(Inbox marked as: <b>${inboxLabel || 'RP TEST'}</b>)`;
      await sendTelegram(msg);
    } else {
      console.error('[CRON] IMAP Sync failed via API:', data.error);
    }
  } catch (e) {
    console.error('[CRON] IMAP Sync fetch error:', e);
  }
}

async function runIpStatusReport() {
  console.log('[CRON] Running IP Status Report...');
  try {
    const cronData = await loadCronData();
    const teams = cronData.teams || [];

    const IP_STATUS_REF = doc(db, 'appData', 'ip_status');
    const snap = await getDoc(IP_STATUS_REF);
    const ipStatus: Record<string, Record<string, string>> = snap.exists() ? (snap.data().history || {}) : {};

    const today = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    const nowStr = new Date().toLocaleString('en-US');

    const STATUS_LABELS: Record<string, string> = {
      'RP TEST': '📬 RP TEST', 'SPAM': '🔴 SPAM', 'BOUNCE': '❌ BOUNCE',
      'RDNS': '✅ RDNS', 'RDNS Not Active': '🟣 RDNS Not Active',
      'PAUSED': '⏸️ PAUSED', 'Change DOM': '🔄 Change DOM',
      'DOWN': '💀 DOWN', 'TO': '⏱️ TO',
    };

    const formatDiff = (todayCount: number, yesterdayCount: number): string => {
      const diff = todayCount - yesterdayCount;
      if (diff > 0) return ` (<b>+${diff}</b>)`;
      if (diff < 0) return ` (<b>${diff}</b>)`;
      return '';
    };

    let msg = '📊 <b>IP STATUS REPORT</b>\n📅 ' + nowStr + '\n' + '─'.repeat(28) + '\n\n';
    let globalTotal = 0, globalChecked = 0, globalEmpty = 0;
    let globalTotalYesterday = 0, globalCheckedYesterday = 0, globalEmptyYesterday = 0;
    const globalStats: Record<string, number> = {};
    const globalStatsYesterday: Record<string, number> = {};

    let teamsSection = '';

    for (const team of teams) {
      const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
      if (activeServers.length === 0) continue;

      const teamStats: Record<string, number> = {};
      const teamStatsYesterday: Record<string, number> = {};
      let teamTotal = 0, teamEmpty = 0;
      let teamTotalYesterday = 0, teamEmptyYesterday = 0;

      for (const server of activeServers) {
        const uniqueDomains = getUniqueIpDomains(server.ipDomains);
        const ips: string[] = [];
        if (uniqueDomains.length > 0) uniqueDomains.forEach((d: any) => { if (d.ip) ips.push(d.ip); });
        else if (server.mainIp) ips.push(server.mainIp);

        for (const ip of ips) {
          // Today
          teamTotal++; globalTotal++;
          const statusToday = ipStatus[ip]?.[today];
          if (statusToday) {
            teamStats[statusToday] = (teamStats[statusToday] || 0) + 1;
            globalStats[statusToday] = (globalStats[statusToday] || 0) + 1;
            globalChecked++;
          } else { teamEmpty++; globalEmpty++; }

          // Yesterday
          teamTotalYesterday++; globalTotalYesterday++;
          const statusYesterday = ipStatus[ip]?.[yesterday];
          if (statusYesterday) {
            teamStatsYesterday[statusYesterday] = (teamStatsYesterday[statusYesterday] || 0) + 1;
            globalStatsYesterday[statusYesterday] = (globalStatsYesterday[statusYesterday] || 0) + 1;
            globalCheckedYesterday++;
          } else { teamEmptyYesterday++; globalEmptyYesterday++; }
        }
      }

      teamsSection += '🏢 <b>Team ' + team.name + '</b> — ' + teamTotal + ' IPs' + formatDiff(teamTotal, teamTotalYesterday) + '\n';
      
      const allStatuses = new Set([...Object.keys(teamStats), ...Object.keys(teamStatsYesterday)]);
      const sorted = Array.from(allStatuses).sort((a, b) => (teamStats[b] || 0) - (teamStats[a] || 0));

      sorted.forEach((status) => {
        const todayCount = teamStats[status] || 0;
        const yesterdayCount = teamStatsYesterday[status] || 0;
        if (todayCount > 0 || yesterdayCount > 0) {
          teamsSection += '  ' + (STATUS_LABELS[status] || status) + ': <b>' + todayCount + '</b>' + formatDiff(todayCount, yesterdayCount) + '\n';
        }
      });

      if (teamEmpty > 0 || teamEmptyYesterday > 0) {
        teamsSection += '  ⬜ No Status: <b>' + teamEmpty + '</b>' + formatDiff(teamEmpty, teamEmptyYesterday) + '\n';
      }

      teamsSection += '\n';
    }

    msg += '📦 <b>Total IPs (All Teams)</b> — ' + globalTotal + ' IPs' + formatDiff(globalTotal, globalTotalYesterday) + '\n';
    
    // Global Statuses Breakdown
    const allGlobalStatuses = new Set([...Object.keys(globalStats), ...Object.keys(globalStatsYesterday)]);
    const sortedGlobal = Array.from(allGlobalStatuses).sort((a, b) => (globalStats[b] || 0) - (globalStats[a] || 0));

    sortedGlobal.forEach((status) => {
      const todayCount = globalStats[status] || 0;
      const yesterdayCount = globalStatsYesterday[status] || 0;
      if (todayCount > 0 || yesterdayCount > 0) {
        msg += '  ' + (STATUS_LABELS[status] || status) + ': <b>' + todayCount + '</b>' + formatDiff(todayCount, yesterdayCount) + '\n';
      }
    });

    if (globalEmpty > 0 || globalEmptyYesterday > 0) {
      msg += '  ⬜ No Status: <b>' + globalEmpty + '</b>' + formatDiff(globalEmpty, globalEmptyYesterday) + '\n';
    }

    msg += '\n' + '─'.repeat(28) + '\n\n' + teamsSection;

    await sendTelegramTopic(msg, TELEGRAM_GROUP_ID, TOPIC_IP_STATUS_THREAD_ID);
    console.log('[CRON] IP Status Report sent!');
  } catch (e) {
    console.error('[CRON] IP Status Report error:', e);
  }
}
async function runSummaryReportCheck(teamName: string) {
  console.log(`[CRON] Running Summary Report check for team: ${teamName}`);
  const cronData = await loadCronData();
  const teams = cronData.teams || [];
  
  if (teams.length === 0) return;

  const targetTeams = teamName === 'all' ? teams : teams.filter((t: any) => t.name === teamName);
  
  const now = new Date();
  const reportMonthNum = now.getFullYear() * 12 + now.getMonth();
  const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  
  let finalMsg = `📊 <b>TEAMS SUMMARY REPORT (${monthLabel})</b>\n📅 ${now.toLocaleString('en-US')}\n${'─'.repeat(25)}\n\n`;
  
  let totalProd = 0;
  let totalNew = 0;
  let totalToCancel = 0;
  let totalDeleted = 0;

  const getYearMonthNumberLocal = (dateStr: string): number => {
    const d = parseDate(dateStr);
    if (!d) return 0;
    return d.getFullYear() * 12 + d.getMonth();
  };

  targetTeams.forEach((team: any) => {
    const servers = team.servers || [];
    
    const newServers: any[] = [];
    const existingServers: any[] = [];
    const toCancelServers: any[] = [];
    const deletedServers: any[] = [];

    servers.forEach((s: any) => {
      const entryMonthNum = getYearMonthNumberLocal(s.dateEntre);
      const exitMonthNum = s.dateSortie ? getYearMonthNumberLocal(s.dateSortie) : 0;

      if (s.status === 'deleted') {
        if (exitMonthNum === reportMonthNum) {
          deletedServers.push(s);
        } else if (entryMonthNum === reportMonthNum && reportMonthNum < exitMonthNum) {
          newServers.push(s);
        } else if (entryMonthNum < reportMonthNum && reportMonthNum < exitMonthNum) {
          existingServers.push(s);
        }
      } else if (s.status === 'tocancel') {
        if (entryMonthNum <= reportMonthNum) {
          toCancelServers.push(s);
        }
      } else {
        if (entryMonthNum === reportMonthNum) {
          newServers.push(s);
        } else if (entryMonthNum < reportMonthNum) {
          existingServers.push(s);
        }
      }
    });

    const activeCount = existingServers.length;
    const newCount = newServers.length;
    const toCancelCount = toCancelServers.length;
    const cancelCount = deletedServers.length;

    totalProd += activeCount;
    totalNew += newCount;
    totalToCancel += toCancelCount;
    totalDeleted += cancelCount;

    finalMsg += `👥 <b>${team.name}</b>\n`;
    finalMsg += `  🟢 Prod Servers: <b>${activeCount}</b>\n`;
    finalMsg += `  🔵 New Servers: <b>${newCount}</b>\n`;
    finalMsg += `  🟠 Cancel Declared: <b>${toCancelCount}</b>\n`;
    finalMsg += `  🔴 Cancelled Definitive: <b>${cancelCount}</b>\n\n`;
  });

  if (targetTeams.length > 1) {
    finalMsg += `<b>========== TOTAL ==========</b>\n`;
    finalMsg += `  🟢 Prod Servers: <b>${totalProd}</b>\n`;
    finalMsg += `  🔵 New Servers: <b>${totalNew}</b>\n`;
    finalMsg += `  🟠 Cancel Declared: <b>${totalToCancel}</b>\n`;
    finalMsg += `  🔴 Cancelled Definitive: <b>${totalDeleted}</b>\n`;
  }

  await sendTelegramTopic(finalMsg, TELEGRAM_GROUP_ID, TOPIC_DATABASE_THREAD_ID);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, teamName } = body;
    let resultMessage = 'ok';

    if (type === 'rdns') {
      await runRdnsCheck(teamName || 'all');
    } else if (type === 'vmta') {
      await runVmtaCheck(teamName || 'all');
    } else if (type === 'both') {
      await runRdnsCheck(teamName || 'all');
      await runVmtaCheck(teamName || 'all');
    } else if (type === 'payment_notice') {
      await runPaymentNoticeCheck(teamName || 'all');
    } else if (type === 'summary_report') {
      await runSummaryReportCheck(teamName || 'all');
    } else if (type && type.startsWith('old_age')) {
      const minDays = parseInt(type.replace('old_age_', '')) || 60;
      await runOldAgeCheck(minDays, teamName || 'all');
    } else if (type && type.startsWith('by_provider_')) {
      const provider = type.replace('by_provider_', '');
      await runProviderCheck(provider, teamName || 'all');
    } else if (type === 'spf') {
      resultMessage = await runSpfCheck(teamName || 'all') || 'ok';
    } else if (type && type.startsWith('blacklist')) {
      await runBlacklistCheck(type, teamName || 'all');
    } else if (type === 'imap_sync') {
      await runImapSyncCheck(body.email, body.password, body.inboxLabel, teamName);
    } else if (type === 'ip_status_report') {
      await runIpStatusReport();
    }

    return NextResponse.json({ success: true, message: resultMessage });
  } catch (e: any) {
    console.error('[CRON-CHECK] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const teamName = searchParams.get('teamName') || 'all';

    if (!type) {
      return NextResponse.json({ error: 'Missing type parameter' }, { status: 400 });
    }

    let resultMessage = 'ok';

    if (type === 'rdns') {
      await runRdnsCheck(teamName);
    } else if (type === 'vmta') {
      await runVmtaCheck(teamName);
    } else if (type === 'both') {
      await runRdnsCheck(teamName);
      await runVmtaCheck(teamName);
    } else if (type === 'payment_notice') {
      await runPaymentNoticeCheck(teamName);
    } else if (type === 'summary_report') {
      await runSummaryReportCheck(teamName);
    } else if (type.startsWith('old_age')) {
      const minDays = parseInt(type.replace('old_age_', '')) || 60;
      await runOldAgeCheck(minDays, teamName);
    } else if (type.startsWith('by_provider_')) {
      const provider = type.replace('by_provider_', '');
      await runProviderCheck(provider, teamName);
    } else if (type === 'spf') {
      resultMessage = await runSpfCheck(teamName) || 'ok';
    } else if (type.startsWith('blacklist')) {
      await runBlacklistCheck(type, teamName);
    } else if (type === 'ip_status_report') {
      await runIpStatusReport();
    }

    return NextResponse.json({ success: true, message: resultMessage });
  } catch (e: any) {
    console.error('[CRON-CHECK] GET Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Also add endpoint to sync team data from frontend
export async function PUT(request: NextRequest) {
  try {
    const { teams } = await request.json();
    const data = await loadCronData();
    data.teams = teams;
    await saveCronData(data);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to update teams' }, { status: 500 });
  }
}
