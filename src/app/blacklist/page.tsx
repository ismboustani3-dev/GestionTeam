'use client';

import React, { useState, useEffect } from 'react';
import { loadTeamsFromFirebase, saveTeamsToFirebase, loadBlacklistResultsFromFirebase, saveBlacklistResultsToFirebase } from '@/lib/firebaseTeams';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import '../infrastructure/Infrastructure.css'; // Reusing the same styling
import './Blacklist.css';

interface Server {
  id: number;
  serverName: string;
  mainIp: string;
  provider: string;
  asn: string;
  dateEntre: string;
  dateSortie: string;
  nbrIps: number;
  classType: string;
  status?: 'active' | 'deleted' | 'tocancel';
  ipDomains?: { ip: string, domain: string }[];
}

interface Team {
  name: string;
  servers: Server[];
}

interface BlacklistIp {
  ip: string;
  domain: string;
  sbl: boolean;
  css: boolean;
  barracuda: boolean;
  dbl: boolean;
  status: 'Pending' | 'Clean' | 'Listed' | 'Error';
  errorMsg?: string;
  serverName?: string;
  teamName?: string;
  timestamp?: number;
  activeLists?: string[];
}

interface BlacklistServerRow {
  serverId: number;
  serverName: string;
  serverStatus?: string;
  ips: BlacklistIp[];
}

export default function BlacklistPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [checkType, setCheckType] = useState<'ips' | 'domains'>('ips');
  const [isChecking, setIsChecking] = useState(false);
  const [resultsMap, setResultsMap] = useState<Record<string, BlacklistIp>>({});
  
  // Schedule state
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleType, setNewScheduleType] = useState('blacklist_both');
  const [newScheduleTime, setNewScheduleTime] = useState('08:00');
  const [newScheduleTeam, setNewScheduleTeam] = useState('all');
  const [newScheduleDays, setNewScheduleDays] = useState([1, 2, 3, 4, 5, 6, 0]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
 
  // History state
  const [viewMode, setViewMode] = useState<'live' | 'historical'>('live');
  const [historicalData, setHistoricalData] = useState<Record<string, Record<string, BlacklistIp>>>({});
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>('');
 
  const [isTeamsLoaded, setIsTeamsLoaded] = useState(false);
  const [isResultsLoaded, setIsResultsLoaded] = useState(false);

  const loadSchedules = async () => {
    try {
      const res = await fetch('/api/schedule');
      const data = await res.json();
      if (data.schedules) {
        setSchedules(data.schedules);
      }
    } catch (e) {
      console.error('Failed to load schedules:', e);
    }
  };
 
  useEffect(() => {
    const load = async () => {
      const data = await loadTeamsFromFirebase();
      if (data && data.length > 0) {
        setTeams(data);
      }
      setIsTeamsLoaded(true);
 
      const results = await loadBlacklistResultsFromFirebase();
      if (results && Object.keys(results).length > 0) {
        setResultsMap(results);
      }
      setIsResultsLoaded(true);
    };
    load();
    loadSchedules();
 
    // Load History
    fetch('/api/blacklist-history')
      .then(r => r.json())
      .then(d => {
        if (d.history) {
          setHistoricalData(d.history);
          const dates = Object.keys(d.history).sort().reverse();
          if (dates.length > 0) setSelectedHistoryDate(dates[0]);
        }
      })
      .catch(e => console.error("Failed to load history", e));
  }, []);

  // Save resultsMap whenever it changes
  useEffect(() => {
    if (isResultsLoaded && Object.keys(resultsMap).length > 0) {
      saveBlacklistResultsToFirebase(resultsMap);
    }
  }, [resultsMap, isResultsLoaded]);

  const handleCheckActiveTeam = async () => {
    setIsChecking(true);
    try {
      const currentTeam = teams.find(t => t.name === activeTeam);
      const activeServers = currentTeam?.servers.filter(s => s.status !== 'deleted') || [];
      
      const itemsToCheck: { serverName: string, ip: string, domain: string }[] = [];
      
      activeServers.forEach(s => {
        if (checkType === 'ips') {
          if (s.mainIp) {
            itemsToCheck.push({ serverName: s.serverName, ip: s.mainIp, domain: 'No Domain' });
          }
          const uniqueDomains = getUniqueIpDomains(s.ipDomains);
          uniqueDomains.forEach(d => {
            itemsToCheck.push({ serverName: s.serverName, ip: d.ip, domain: 'No Domain' });
          });
        } else {
          // domains
          const uniqueDomains = getUniqueIpDomains(s.ipDomains);
          uniqueDomains.forEach(d => {
            if (d.domain) {
              itemsToCheck.push({ serverName: s.serverName, ip: '', domain: d.domain });
            }
          });
        }
      });

      const uniqueItems = Array.from(new Set(itemsToCheck.map(i => JSON.stringify(i)))).map(s => JSON.parse(s));

      if (uniqueItems.length === 0) {
        alert(`No active ${checkType === 'ips' ? 'IPs' : 'Domains'} to check for this team.`);
        setIsChecking(false);
        return;
      }

      const response = await fetch('/api/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: uniqueItems })
      });
      const data = await response.json();

      if (data.results) {
        const newResultsMap = { ...resultsMap };
        let totalChecked = 0;
        let sblCount = 0;
        let cssCount = 0;
        let barracudaCount = 0;
        let dblCount = 0;
        let cleanCount = 0;

        data.results.forEach((r: any) => {
          totalChecked++;
          const key = `${r.serverName}-${checkType === 'ips' ? r.ip : r.domain}`;
          const isListed = r.sbl || r.css || r.barracuda || r.dbl;
          const status = r.error ? 'Error' : (isListed ? 'Listed' : 'Clean');
          
          const itemInfo = uniqueItems.find((i: any) => i.ip === r.ip && i.serverName === r.serverName && i.domain === r.domain);
          const sName = itemInfo ? itemInfo.serverName : r.serverName;
          newResultsMap[key] = {
            ip: r.ip,
            domain: r.domain,
            sbl: r.sbl,
            css: r.css,
            barracuda: r.barracuda,
            dbl: r.dbl,
            status,
            errorMsg: r.error,
            serverName: sName,
            teamName: activeTeam,
            timestamp: Date.now()
          };

          if (isListed) {
            if (r.sbl) sblCount++;
            if (r.css) cssCount++;
            if (r.barracuda) barracudaCount++;
            if (r.dbl) dblCount++;
          } else {
            cleanCount++;
          }
        });

        setResultsMap(newResultsMap);

        // Save to History
        const dateKey = new Date().toISOString().split('T')[0];
        fetch('/api/blacklist-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateKey, results: newResultsMap })
        }).then(r => r.json()).then(d => {
          if (d.success) {
            setHistoricalData(prev => ({ ...prev, [dateKey]: { ...(prev[dateKey] || {}), ...newResultsMap } }));
            if (!selectedHistoryDate) setSelectedHistoryDate(dateKey);
          }
        }).catch(e => console.error("Error saving history:", e));

        const now = new Date().toLocaleString('en-US');
        const hasListings = sblCount > 0 || cssCount > 0 || barracudaCount > 0 || dblCount > 0;
        
        let msg = `📊 <b>BLACKLIST REPORT (${checkType.toUpperCase()}) — Team ${activeTeam}</b>\n📅 ${now}\n\n`;
        msg += `Total Checked: <b>${totalChecked}</b>\n`;
        msg += `✅ Clean: <b>${cleanCount}</b>\n`;
        if (checkType === 'ips') {
          if (sblCount > 0) msg += `🔴 SBL: <b>${sblCount}</b>\n`;
          if (cssCount > 0) msg += `🟠 CSS: <b>${cssCount}</b>\n`;
          if (barracudaCount > 0) msg += `🟣 Barracuda: <b>${barracudaCount}</b>\n`;
        }
        if (checkType === 'domains' && dblCount > 0) msg += `🟤 DBL: <b>${dblCount}</b>\n`;

        if (!hasListings) {
          msg += `\n✅ All ${checkType === 'ips' ? 'IPs' : 'Domains'} are clean!`;
        }

        await fetch('/api/telegram-blacklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
      }
    } catch (e) {
      console.error(e);
      alert('Failed to check blacklist');
    }
    setIsChecking(false);
  };

  const handleCheckAllTeams = async (targetType: 'ips' | 'domains') => {
    setIsChecking(true);
    try {
      const itemsToCheck: { serverName: string, ip: string, domain: string, teamName: string }[] = [];
      
      teams.forEach(t => {
        const activeServers = t.servers.filter(s => s.status !== 'deleted');
        activeServers.forEach(s => {
          if (targetType === 'ips') {
            if (s.mainIp) {
              itemsToCheck.push({ serverName: s.serverName, ip: s.mainIp, domain: 'No Domain', teamName: t.name });
            }
            const uniqueDomains = getUniqueIpDomains(s.ipDomains);
            uniqueDomains.forEach(d => {
              itemsToCheck.push({ serverName: s.serverName, ip: d.ip, domain: 'No Domain', teamName: t.name });
            });
          } else {
            // domains
            const uniqueDomains = getUniqueIpDomains(s.ipDomains);
            uniqueDomains.forEach(d => {
              if (d.domain) {
                itemsToCheck.push({ serverName: s.serverName, ip: '', domain: d.domain, teamName: t.name });
              }
            });
          }
        });
      });

      const uniqueItems = Array.from(new Set(itemsToCheck.map(i => JSON.stringify(i)))).map(s => JSON.parse(s));

      if (uniqueItems.length === 0) {
        setIsChecking(false);
        return;
      }

      const response = await fetch('/api/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: uniqueItems })
      });
      const data = await response.json();

      if (data.results) {
        const newResultsMap = { ...resultsMap };
        const teamStats: Record<string, { total: number, sbl: number, css: number, barra: number, dbl: number, clean: number }> = {};
        let globalTotal = 0;
        let globalClean = 0;

        data.results.forEach((r: any) => {
          const itemInfo = uniqueItems.find((i: any) => i.ip === r.ip && i.serverName === r.serverName && i.domain === r.domain);
          if (!itemInfo) return;

          const teamName = itemInfo.teamName;
          if (!teamStats[teamName]) {
            teamStats[teamName] = { total: 0, sbl: 0, css: 0, barra: 0, dbl: 0, clean: 0 };
          }

          globalTotal++;
          teamStats[teamName].total++;
          
          const key = `${r.serverName}-${targetType === 'ips' ? r.ip : r.domain}`;
          const isListed = r.sbl || r.css || r.barracuda || r.dbl;
          const status = r.error ? 'Error' : (isListed ? 'Listed' : 'Clean');
          
          if (isListed) {
            if (r.sbl) teamStats[teamName].sbl++;
            if (r.css) teamStats[teamName].css++;
            if (r.barracuda) teamStats[teamName].barra++;
            if (r.dbl) teamStats[teamName].dbl++;
          } else {
            teamStats[teamName].clean++;
            globalClean++;
          }
          
          newResultsMap[key] = {
            ip: r.ip,
            domain: r.domain,
            sbl: r.sbl,
            css: r.css,
            barracuda: r.barracuda,
            dbl: r.dbl,
            status,
            errorMsg: r.error,
            serverName: itemInfo.serverName,
            teamName: teamName,
            timestamp: Date.now()
          };
        });

        setResultsMap(newResultsMap);

        // Save to History
        const dateKey = new Date().toISOString().split('T')[0];
        fetch('/api/blacklist-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateKey, results: newResultsMap })
        }).then(r => r.json()).then(d => {
          if (d.success) {
            setHistoricalData(prev => ({ ...prev, [dateKey]: { ...(prev[dateKey] || {}), ...newResultsMap } }));
            if (!selectedHistoryDate) setSelectedHistoryDate(dateKey);
          }
        }).catch(e => console.error("Error saving history:", e));

        const now = new Date().toLocaleString('en-US');
        
        // Calculate Yesterday's Stats
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toLocaleDateString('en-CA'); // reliable YYYY-MM-DD
        const yesterdayResults = historicalData[yesterdayKey] || {};
        
        const yesterdayTeamStats: Record<string, { total: number, sbl: number, css: number, barra: number, dbl: number, clean: number }> = {};
        let yesterdayGlobalTotal = 0;
        let yesterdayGlobalClean = 0;

        Object.keys(yesterdayResults).forEach(key => {
          const entry = yesterdayResults[key];
          if (!entry) return;

          const isIp = entry.ip && entry.ip !== '';
          const isDomain = entry.domain && entry.domain !== 'No Domain';
          
          if (targetType === 'ips' && !isIp) return;
          if (targetType === 'domains' && !isDomain) return;

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
            const foundTeam = teams.find(t => (t.servers || []).some(s => s.serverName === serverName));
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
          if (targetType === 'ips') {
            tableContent += formatRow("SBL", String(tToday.sbl), String(tYest.sbl));
            tableContent += formatRow("CSS", String(tToday.css), String(tYest.css));
            tableContent += formatRow("Barracuda", String(tToday.barra), String(tYest.barra));
          }
          if (targetType === 'domains') {
            tableContent += formatRow("DBL", String(tToday.dbl), String(tYest.dbl));
          }
          tableContent += "\n";
        });

        let finalMsg = `📊 <b>BLACKLIST AUDIT (${targetType.toUpperCase()}) — ALL TEAMS</b>\n📅 ${now}\n${'─'.repeat(30)}\n`;
        finalMsg += `<pre>${tableContent}</pre>\n`;

        // Daily Changes Comparison
        const yesterday2 = new Date();
        yesterday2.setDate(yesterday2.getDate() - 1);
        const yesterdayKey2 = yesterday2.toISOString().split('T')[0];
        const yesterdayResults2 = historicalData[yesterdayKey2] || {};

        const newlyCleanItems: string[] = [];
        const newlyListedItems: string[] = [];

        const parsedYesterdayMap: Record<string, any> = {};
        Object.keys(yesterdayResults2).forEach(key => {
          const entry = yesterdayResults2[key];
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
          const identifier = `${serverName}_${targetType === 'ips' ? ip : domain}`;
          parsedYesterdayMap[identifier] = entry;
        });

        Object.keys(newResultsMap).forEach(key => {
          const todayEntry = newResultsMap[key];
          const serverName = todayEntry.serverName || '';
          const ip = todayEntry.ip || '';
          const domain = todayEntry.domain || '';
          const identifier = `${serverName}_${targetType === 'ips' ? ip : domain}`;
          
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

            const todayStatus = todayEntry.status;

            if (yestStatus === 'Listed' && todayStatus === 'Clean') newlyCleanItems.push(label);
            if (yestStatus === 'Clean' && todayStatus === 'Listed') newlyListedItems.push(label);
          }
        });

        if (newlyCleanItems.length > 0 || newlyListedItems.length > 0) {
          finalMsg += '\n\uD83D\uDD04 <b>Daily Changes:</b>\n';
          if (newlyCleanItems.length > 0) {
            finalMsg += '\u2728 <b>Newly Cleaned (' + newlyCleanItems.length + '):</b>\n';
            newlyCleanItems.slice(0, 30).forEach(ip => { finalMsg += '  \uD83D\uDFE2 ' + ip + '\n'; });
            if (newlyCleanItems.length > 30) finalMsg += '  ... and ' + (newlyCleanItems.length - 30) + ' more\n';
          }
          if (newlyListedItems.length > 0) {
            finalMsg += '\u26A0\uFE0F <b>Status Alert \u2014 ' + newlyListedItems.length + ' newly listed!</b>\n';
            newlyListedItems.slice(0, 30).forEach(ip => { finalMsg += '  \uD83D\uDD34 ' + ip + '\n'; });
            if (newlyListedItems.length > 30) finalMsg += '  ... and ' + (newlyListedItems.length - 30) + ' more\n';
          }
        }

        await fetch('/api/telegram-blacklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: finalMsg })
        });
      }
    } catch (e) {
      console.error(e);
      alert('Failed to check blacklist for all teams');
    }
    setIsChecking(false);
  };

  const copyListed = (type: 'ips' | 'domains') => {
    const listed = Object.values(resultsMap).filter(r => r.status === 'Listed');
    const items = listed.map(r => type === 'ips' ? r.ip : r.domain).filter(Boolean);
    const unique = Array.from(new Set(items));
    if (unique.length === 0) {
      alert(`No listed ${type} to copy.`);
      return;
    }
    navigator.clipboard.writeText(unique.join('\n'));
    alert(`Copied ${unique.length} listed ${type} to clipboard!`);
  };

  const handleAddSchedule = async () => {
    if (!newScheduleName) {
      alert('Please enter a schedule name');
      return;
    }

    const [hour, min] = newScheduleTime.split(':');
    const daysStr = newScheduleDays.length === 7 ? '*' : newScheduleDays.join(',');
    const cronExpression = `${min} ${hour} * * ${daysStr}`;

    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          name: newScheduleName,
          type: newScheduleType,
          cronExpression,
          teamName: newScheduleTeam
        })
      });
      alert('Schedule added successfully!');
      setNewScheduleName('');
      loadSchedules();
    } catch (e) {
      console.error(e);
      alert('Failed to add schedule');
    }
  };

  const handleToggleSchedule = async (id: string, currentEnabled: boolean) => {
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle',
          id,
          enabled: !currentEnabled
        })
      });
      loadSchedules();
    } catch (e) {
      console.error('Failed to toggle schedule:', e);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          id
        })
      });
      loadSchedules();
    } catch (e) {
      console.error('Failed to delete schedule:', e);
    }
  };

  const formatCronExpression = (cron: string): string => {
    if (!cron) return '—';
    const parts = cron.split(' ');
    if (parts.length < 5) return cron;

    const [min, hour, dom, month, dow] = parts;
    const timeStr = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    
    let daysStr = '';
    if (dow === '*') {
      daysStr = 'Everyday';
    } else {
      const daysMap: Record<string, string> = {
        '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '0': 'Sun'
      };
      daysStr = dow.split(',').map(d => daysMap[d] || d).join(', ');
    }

    return `${timeStr} (${daysStr})`;
  };

  // Source of truth for displaying rows
  const displayMap = viewMode === 'historical' && selectedHistoryDate && historicalData[selectedHistoryDate]
    ? historicalData[selectedHistoryDate]
    : resultsMap;

  const rows: BlacklistServerRow[] = [];
  const currentTeamData = teams.find(t => t.name === activeTeam);
  
  if (currentTeamData) {
    currentTeamData.servers.filter(s => s.status !== 'deleted').forEach(s => {
      const itemsList: BlacklistIp[] = [];
      
      const addItem = (ip: string, domain: string) => {
        const key = `${s.serverName}-${checkType === 'ips' ? ip : domain}`;
        const res = displayMap[key];
        
        if (res) {
          itemsList.push(res);
        } else {
          itemsList.push({
            ip,
            domain,
            sbl: false,
            css: false,
            barracuda: false,
            dbl: false,
            status: 'Pending'
          });
        }
      };

      const itemsAdded = new Set<string>();

      if (checkType === 'ips') {
        if (s.mainIp) {
          addItem(s.mainIp, 'No Domain');
          itemsAdded.add(s.mainIp);
        }
        const uniqueDomains = getUniqueIpDomains(s.ipDomains);
        uniqueDomains.forEach(d => {
          if (!itemsAdded.has(d.ip)) {
            addItem(d.ip, 'No Domain');
            itemsAdded.add(d.ip);
          }
        });
      } else {
        const uniqueDomains = getUniqueIpDomains(s.ipDomains);
        uniqueDomains.forEach(d => {
          if (d.domain && !itemsAdded.has(d.domain)) {
            addItem('', d.domain);
            itemsAdded.add(d.domain);
          }
        });
      }

      if (itemsList.length > 0) {
        rows.push({
          serverId: s.id,
          serverName: s.serverName,
          serverStatus: s.status,
          ips: itemsList
        });
      }
    });
  }

  // Calculate Dashboard Stats
  let cleanTotal = 0;
  let listedTotal = 0;
  let cssTotal = 0;
  let barraTotal = 0;
  let sblTotal = 0;
  let dblTotal = 0;

  rows.forEach(r => {
    r.ips.forEach(ip => {
      if (ip.status === 'Clean') cleanTotal++;
      if (ip.status === 'Listed') listedTotal++;
      if (ip.css) cssTotal++;
      if (ip.barracuda) barraTotal++;
      if (ip.sbl) sblTotal++;
      if (ip.dbl) dblTotal++;
    });
  });

  const copyListedByType = (targetType: 'clean' | 'listed' | 'css' | 'sbl' | 'barracuda' | 'dbl') => {
    const items: string[] = [];
    rows.forEach(r => {
      r.ips.forEach(ip => {
        let match = false;
        if (targetType === 'clean' && ip.status === 'Clean') match = true;
        if (targetType === 'listed' && ip.status === 'Listed') match = true;
        if (targetType === 'css' && ip.css) match = true;
        if (targetType === 'barracuda' && ip.barracuda) match = true;
        if (targetType === 'sbl' && ip.sbl) match = true;
        if (targetType === 'dbl' && ip.dbl) match = true;
        
        if (match) {
          const val = checkType === 'ips' ? ip.ip : ip.domain;
          if (val && val !== 'No Domain') items.push(val);
        }
      });
    });
    
    if (items.length === 0) {
      alert(`No items found for ${targetType}`);
      return;
    }
    
    navigator.clipboard.writeText(items.join('\n'));
    alert(`Copied ${items.length} items to clipboard!`);
  };

  // Generate last 14 days for history
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d;
  });

  const blacklistSchedules = schedules.filter(s => 
    s.type === 'blacklist_ips' || s.type === 'blacklist_domains' || s.type === 'blacklist_both'
  );

  return (
    <div className="infra-page animate-fade-in">
      <div className="infra-header">
        <div className="infra-title">
          <h1>Blacklist Checker</h1>
          <p>Check your IPs and Domains against Spamhaus (SBL/CSS/DBL) and Barracuda.</p>
        </div>
        <div className="infra-actions">
          <button 
            className="btn-blue" 
            onClick={handleCheckActiveTeam}
            disabled={isChecking}
          >
            {isChecking ? 'Checking...' : `🛡️ Check Active Team (${checkType.toUpperCase()})`}
          </button>
          <button 
            className="btn-blue" 
            style={{ background: '#f59e0b' }}
            onClick={() => handleCheckAllTeams('ips')}
            disabled={isChecking}
          >
            {isChecking ? 'Checking...' : `⚡ Check All Teams (IPS)`}
          </button>
          <button 
            className="btn-blue" 
            style={{ background: '#d97706' }}
            onClick={() => handleCheckAllTeams('domains')}
            disabled={isChecking}
          >
            {isChecking ? 'Checking...' : `⚡ Check All Teams (DOMAINS)`}
          </button>
        </div>
      </div>

      <div className="mode-toggle-container">
        <button 
          className={`mode-toggle-btn ${viewMode === 'live' ? 'active' : ''}`}
          onClick={() => setViewMode('live')}
        >
          Live Checker
        </button>
        <button 
          className={`mode-toggle-btn ${viewMode === 'historical' ? 'active' : ''}`}
          onClick={() => setViewMode('historical')}
        >
          Historical Blacklist
        </button>
      </div>

      {viewMode === 'historical' && (
        <div className="date-cards-wrapper">
          {last14Days.filter(d => {
            const dateStr = d.toISOString().split('T')[0];
            return historicalData[dateStr] && Object.keys(historicalData[dateStr]).length > 0;
          }).map((d, idx) => {
            const dateStr = d.toISOString().split('T')[0];
            const hasData = true; // since we just filtered it
            const isActive = selectedHistoryDate === dateStr;
            const yearStr = d.getFullYear();
            const dayStr = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
            
            return (
              <div 
                key={dateStr}
                className={`date-card ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedHistoryDate(dateStr)}
                style={{ cursor: 'pointer' }}
              >
                <div className="date-card-year">{yearStr}</div>
                <div className="date-card-day">{dayStr}</div>
                <div className={`date-card-status recorded`}>
                  RECORDED
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showScheduleForm && (
        <div className="schedules-grid">
          {/* New Schedule Card */}
          <div className="schedule-card" style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem', height: 'fit-content' }}>
            <h3 style={{ color: '#34d399', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>+</span> New Schedule
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <input 
                type="text" 
                placeholder="Schedule Name" 
                value={newScheduleName}
                onChange={e => setNewScheduleName(e.target.value)}
                style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.8rem', borderRadius: '8px', color: '#fff', width: '100%' }}
              />
              <select 
                value={newScheduleType} 
                onChange={e => setNewScheduleType(e.target.value)}
                style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.8rem', borderRadius: '8px', color: '#fff', width: '100%' }}
              >
                <option value="blacklist_ips">Blacklist IPs Only</option>
                <option value="blacklist_domains">Blacklist Domains Only</option>
                <option value="blacklist_both">Blacklist Both</option>
              </select>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ color: '#94a3b8' }}>Time:</label>
                <input 
                  type="time" 
                  value={newScheduleTime}
                  onChange={e => setNewScheduleTime(e.target.value)}
                  style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem', borderRadius: '8px', color: '#fff', flex: 1 }}
                />
              </div>
              <select 
                value={newScheduleTeam} 
                onChange={e => setNewScheduleTeam(e.target.value)}
                style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.8rem', borderRadius: '8px', color: '#fff', width: '100%' }}
              >
                <option value="all">All Teams</option>
                {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
                const dayNum = i === 6 ? 0 : i + 1; 
                const isActive = newScheduleDays.includes(dayNum);
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (isActive) setNewScheduleDays(newScheduleDays.filter(d => d !== dayNum));
                      else setNewScheduleDays([...newScheduleDays, dayNum]);
                    }}
                    style={{
                      width: '36px', height: '36px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer',
                      background: isActive ? '#10b981' : 'rgba(255,255,255,0.1)', color: '#fff'
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <button 
              className="execute-btn"
              onClick={handleAddSchedule}
              style={{ width: '100%', padding: '1rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}
            >
              Add Schedule
            </button>
          </div>

          {/* Active Schedules Card */}
          <div className="schedule-card" style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ color: '#38bdf8', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🕒</span> Active Schedules ({blacklistSchedules.length})
            </h3>
            
            {blacklistSchedules.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', padding: '3.5rem 2rem' }}>
                No active schedules configured. Use the form on the left to add one.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '315px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '0.5rem', color: '#94a3b8' }}>Name</th>
                      <th style={{ padding: '0.5rem', color: '#94a3b8' }}>Type</th>
                      <th style={{ padding: '0.5rem', color: '#94a3b8' }}>Team</th>
                      <th style={{ padding: '0.5rem', color: '#94a3b8' }}>Time Details</th>
                      <th style={{ padding: '0.5rem', color: '#94a3b8', textAlign: 'center' }}>Active</th>
                      <th style={{ padding: '0.5rem', color: '#94a3b8', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blacklistSchedules.map((s) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: '#fff' }}>{s.name}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: '#e2e8f0' }}>
                          {s.type === 'blacklist_ips' ? 'IPs Only' : s.type === 'blacklist_domains' ? 'Domains Only' : 'Both'}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textTransform: 'uppercase', color: '#e2e8f0' }}>{s.teamName}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: '#34d399', fontWeight: 500 }}>{formatCronExpression(s.cronExpression)}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                          <label className="switch" style={{ transform: 'scale(0.8)', display: 'inline-block' }}>
                            <input 
                              type="checkbox" 
                              checked={s.enabled} 
                              onChange={() => handleToggleSchedule(s.id, s.enabled)}
                            />
                            <span className="slider"></span>
                          </label>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                          <button 
                            onClick={() => handleDeleteSchedule(s.id)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem', padding: '0.2rem' }}
                            title="Delete Schedule"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="infra-tabs">
        {teams.map(t => {
          const activeServersCount = t.servers.filter(s => s.status !== 'deleted').length;
          return (
            <button
              key={t.name}
              className={`infra-tab ${activeTeam === t.name ? 'active' : ''}`}
              onClick={() => setActiveTeam(t.name)}
            >
              👥 {t.name}
              <span className="infra-tab-count">{activeServersCount}</span>
            </button>
          );
        })}
      </div>

      <div className="stats-dashboard">
        <div className="stat-card clean">
          <div>
            <div className="stat-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              Clean Today
            </div>
            <div className="stat-value">{cleanTotal}</div>
          </div>
          <button className="stat-copy-btn" onClick={() => copyListedByType('clean')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy List
          </button>
        </div>

        <div className="stat-card listed">
          <div>
            <div className="stat-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              Listed Total
            </div>
            <div className="stat-value">{listedTotal}</div>
          </div>
          <button className="stat-copy-btn" onClick={() => copyListedByType('listed')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy List
          </button>
        </div>

        <div className="stat-card css-stat">
          <div>
            <div className="stat-header">
              CSS / ZEN
            </div>
            <div className="stat-value">{cssTotal}</div>
          </div>
          <button className="stat-copy-btn" onClick={() => copyListedByType('css')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy IPs
          </button>
        </div>

        <div className="stat-card barracuda">
          <div>
            <div className="stat-header">
              BARRACUDA
            </div>
            <div className="stat-value">{barraTotal}</div>
          </div>
          <button className="stat-copy-btn" onClick={() => copyListedByType('barracuda')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy IPs
          </button>
        </div>

        <div className="stat-card sbl">
          <div>
            <div className="stat-header">
              SBL / XBL
            </div>
            <div className="stat-value">{sblTotal}</div>
          </div>
          <button className="stat-copy-btn" onClick={() => copyListedByType('sbl')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy IPs
          </button>
        </div>
      </div>

      <div className="infra-filters">
        <div className="filter-group">
          <label>Check Type:</label>
          <div className="check-type-toggle">
            <button
              className={`check-type-btn ${checkType === 'ips' ? 'active' : ''}`}
              onClick={() => setCheckType('ips')}
            >
              🌐 IPs Only
            </button>
            <button
              className={`check-type-btn ${checkType === 'domains' ? 'active' : ''}`}
              onClick={() => setCheckType('domains')}
            >
              🏷️ Domains Only
            </button>
          </div>
        </div>
        <div className="filter-group">
          <label>Actions:</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-blue" style={{ background: '#3b82f6', padding: '0.4rem 0.8rem' }} onClick={() => copyListed('ips')}>📋 Copy Listed IPs</button>
            <button className="btn-blue" style={{ background: '#3b82f6', padding: '0.4rem 0.8rem' }} onClick={() => copyListed('domains')}>📋 Copy Listed Domains</button>
            <button className="btn-blue" style={{ background: '#10b981', padding: '0.4rem 0.8rem' }} onClick={() => setShowScheduleForm(!showScheduleForm)}>🕒 {showScheduleForm ? 'Hide Schedule' : 'New Schedule'}</button>
          </div>
        </div>
      </div>

      <div className="infra-content">
        {rows.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <p>No {checkType === 'ips' ? 'IPs' : 'Domains'} found for this team's servers.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="merged-table">
              <thead>
                <tr>
                  <th>Server</th>
                  <th>{checkType === 'ips' ? 'IP Address' : 'Domain Name'}</th>
                  <th>Listings</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, serverIdx) => (
                  <React.Fragment key={row.serverId}>
                    {row.ips.map((itemInfo, ipIdx) => (
                      <tr 
                        key={`${row.serverId}-${ipIdx}`} 
                        className={ipIdx === row.ips.length - 1 ? "last-row" : ""}
                        style={row.serverStatus === 'tocancel' ? { background: 'rgba(249, 115, 22, 0.08)' } : undefined}
                      >
                        {ipIdx === 0 && (
                          <td rowSpan={row.ips.length} className="server-cell">
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ color: row.serverStatus === 'tocancel' ? '#f97316' : undefined, fontWeight: 600 }}>{row.serverName}</span>
                              {row.serverStatus === 'tocancel' && <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 'bold' }}>tocancel</span>}
                            </div>
                          </td>
                        )}
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#e2e8f0' }}>
                          {checkType === 'ips' ? itemInfo.ip : itemInfo.domain}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {itemInfo.status === 'Pending' ? (
                              <span style={{ color: '#64748b' }}>-</span>
                            ) : (
                              <>
                                {itemInfo.sbl && <span style={{ background: '#b91c1c', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>SBL</span>}
                                {itemInfo.css && <span style={{ background: '#c2410c', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>CSS</span>}
                                {itemInfo.barracuda && <span style={{ background: '#be123c', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>Barracuda</span>}
                                {itemInfo.dbl && <span style={{ background: '#a21caf', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>DBL</span>}
                                {!itemInfo.sbl && !itemInfo.css && !itemInfo.barracuda && !itemInfo.dbl && (
                                  <span style={{ color: '#10b981', fontSize: '0.85rem' }}>None</span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td>
                          {itemInfo.status === 'Pending' && <span className="status-badge pending">Pending</span>}
                          {itemInfo.status === 'Clean' && <span className="status-badge ok">Clean</span>}
                          {itemInfo.status === 'Listed' && <span className="status-badge fail">Listed</span>}
                          {itemInfo.status === 'Error' && <span className="status-badge fail" title={itemInfo.errorMsg}>Error</span>}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
