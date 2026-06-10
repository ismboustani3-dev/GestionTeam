'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { loadTeamsFromFirebase, saveTeamsToFirebase, loadBlacklistResultsFromFirebase, saveBlacklistResultsToFirebase } from '@/lib/firebaseTeams';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import '../infrastructure/Infrastructure.css'; // Reusing the same styling
import './Blacklist.css';
import './BlacklistReports.css';

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
  const [viewMode, setViewMode] = useState<'live' | 'historical' | 'reports'>('live');
  const [historicalData, setHistoricalData] = useState<Record<string, Record<string, BlacklistIp>>>({});
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>('');

  // Report comparison state
  const [dateA, setDateA] = useState('');
  const [dateB, setDateB] = useState('');
  const [reportCheckType, setReportCheckType] = useState<'ips' | 'domains'>('ips');
  const [reportSelectedTeam, setReportSelectedTeam] = useState('all');
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
 
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
          const dates = Object.keys(d.history).sort();
          if (dates.length >= 2) {
            setDateA(dates[dates.length - 2]); // second to last
            setDateB(dates[dates.length - 1]); // latest date
          } else if (dates.length === 1) {
            setDateA(dates[0]);
            setDateB(dates[0]);
          } else {
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            setDateA(yesterday.toLocaleDateString('en-CA'));
            setDateB(today.toLocaleDateString('en-CA'));
          }
          const revDates = [...dates].reverse();
          if (revDates.length > 0) setSelectedHistoryDate(revDates[0]);
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
      
      const getHistoryItem = (serverName: string, ip: string, domain: string) => {
        // 1. Direct lookup with standard manual key format: `serverName-ip` or `serverName-domain`
        const key = `${serverName}-${checkType === 'ips' ? ip : domain}`;
        if (displayMap[key]) return displayMap[key];
        
        // 2. Lookup with cron format: `serverName_ip_domain`
        const cronKey = `${serverName}_${ip || 'noip'}_${domain || 'nodomain'}`;
        if (displayMap[cronKey]) {
          const entry = displayMap[cronKey];
          // Convert cron style activeLists to sbl/css/barracuda/dbl boolean flags
          let sbl = !!entry.sbl;
          let css = !!entry.css;
          let barracuda = !!entry.barracuda;
          let dbl = !!entry.dbl;
          if (entry.activeLists && Array.isArray(entry.activeLists)) {
            sbl = entry.activeLists.includes('SBL');
            css = entry.activeLists.includes('CSS');
            barracuda = entry.activeLists.includes('BARRA');
            dbl = entry.activeLists.includes('DBL');
          }
          return {
            ...entry,
            sbl,
            css,
            barracuda,
            dbl
          };
        }
        
        // 3. Fallback search by scanning values
        const found = Object.values(displayMap).find(entry => {
          if (!entry) return false;
          const matchServer = entry.serverName === serverName;
          if (!matchServer) return false;
          
          if (checkType === 'ips') {
            return entry.ip === ip;
          } else {
            return entry.domain === domain;
          }
        });
        
        if (found) {
          let sbl = !!found.sbl;
          let css = !!found.css;
          let barracuda = !!found.barracuda;
          let dbl = !!found.dbl;
          if (found.activeLists && Array.isArray(found.activeLists)) {
            sbl = found.activeLists.includes('SBL');
            css = found.activeLists.includes('CSS');
            barracuda = found.activeLists.includes('BARRA');
            dbl = found.activeLists.includes('DBL');
          }
          return {
            ...found,
            sbl,
            css,
            barracuda,
            dbl
          };
        }
        
        return null;
      };

      const addItem = (ip: string, domain: string) => {
        const res = getHistoryItem(s.serverName, ip, domain);
        
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

  // Generate dynamically all dates that have historical data sorted descending
  const historicalDates = useMemo(() => {
    return Object.keys(historicalData)
      .filter(dateStr => Object.keys(historicalData[dateStr] || {}).length > 0)
      .sort()
      .reverse();
  }, [historicalData]);

  const blacklistSchedules = schedules.filter(s => 
    s.type === 'blacklist_ips' || s.type === 'blacklist_domains' || s.type === 'blacklist_both'
  );

  const toggleTeam = (teamName: string) => {
    setExpandedTeams(prev => ({
      ...prev,
      [teamName]: !prev[teamName]
    }));
  };

  const getStatsForDate = (dateKey: string, type: 'ips' | 'domains', teamFilter: string) => {
    const data = historicalData[dateKey] || {};
    
    let targetTeams = teams;
    if (teamFilter !== 'all') {
      targetTeams = teams.filter(t => t.name === teamFilter);
    }
    
    let totalChecked = 0;
    let cleanCount = 0;
    let listedCount = 0;
    let sblCount = 0;
    let cssCount = 0;
    let barraCount = 0;
    let dblCount = 0;
    
    interface StatItem {
      name: string;
      status: string;
      sbl: boolean;
      css: boolean;
      barracuda: boolean;
      dbl: boolean;
    }
    
    interface ServerStats {
      serverName: string;
      teamName: string;
      total: number;
      clean: number;
      listed: number;
      sbl: number;
      css: number;
      barracuda: number;
      dbl: number;
      items: StatItem[];
    }

    const serverStatsMap: Record<string, ServerStats> = {};
    
    // Initialize active servers
    targetTeams.forEach(team => {
      const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
      activeServers.forEach((server: any) => {
        serverStatsMap[server.serverName] = {
          serverName: server.serverName,
          teamName: team.name,
          total: 0,
          clean: 0,
          listed: 0,
          sbl: 0,
          css: 0,
          barracuda: 0,
          dbl: 0,
          items: []
        };
      });
    });

    // Process all entries in the date
    Object.keys(data).forEach(key => {
      const entry = data[key];
      if (!entry) return;

      const isIp = entry.ip && entry.ip !== '';
      const isDomain = entry.domain && entry.domain !== 'No Domain';
      
      if (type === 'ips' && !isIp) return;
      if (type === 'domains' && !isDomain) return;
      
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
      
      let stats = serverStatsMap[serverName];
      if (!stats) {
        // Find if server belongs to a team (even if not currently active/initialized)
        let teamName = entry.teamName || '';
        if (!teamName) {
          const foundTeam = teams.find(t => (t.servers || []).some((s: any) => s.serverName === serverName));
          teamName = foundTeam ? foundTeam.name : 'Unknown';
        }
        
        if (teamFilter !== 'all' && teamName !== teamFilter) return;
        
        serverStatsMap[serverName] = {
          serverName,
          teamName,
          total: 0,
          clean: 0,
          listed: 0,
          sbl: 0,
          css: 0,
          barracuda: 0,
          dbl: 0,
          items: []
        };
        stats = serverStatsMap[serverName];
      }
      
      const name = type === 'ips' ? entry.ip : entry.domain;
      
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

      const isListed = sbl || css || barra || dbl;
      const status = entry.status || (isListed ? 'Listed' : 'Clean');
      
      stats.total++;
      totalChecked++;
      
      if (status === 'Clean') {
        stats.clean++;
        cleanCount++;
      } else if (status === 'Listed') {
        stats.listed++;
        listedCount++;
        if (sbl) { stats.sbl++; sblCount++; }
        if (css) { stats.css++; cssCount++; }
        if (barra) { stats.barracuda++; barraCount++; }
        if (dbl) { stats.dbl++; dblCount++; }
      }
      
      stats.items.push({
        name,
        status,
        sbl,
        css,
        barracuda: barra,
        dbl
      });
    });
    
    return {
      totalChecked,
      cleanCount,
      listedCount,
      sblCount,
      cssCount,
      barraCount,
      dblCount,
      serverStats: Object.values(serverStatsMap).filter(s => s.total > 0)
    };
  };

  const reportData = useMemo(() => {
    if (!dateA || !dateB) return null;

    const statsA = getStatsForDate(dateA, reportCheckType, reportSelectedTeam);
    const statsB = getStatsForDate(dateB, reportCheckType, reportSelectedTeam);

    const allServerNames = Array.from(new Set([
      ...statsA.serverStats.map(s => s.serverName),
      ...statsB.serverStats.map(s => s.serverName)
    ]));

    // Server-level comparison
    const serverComparisonRows = allServerNames.map(serverName => {
      const rowA = statsA.serverStats.find(s => s.serverName === serverName);
      const rowB = statsB.serverStats.find(s => s.serverName === serverName);
      const teamName = rowB?.teamName || rowA?.teamName || 'Unknown';
      
      return {
        serverName,
        teamName,
        a: rowA || { total: 0, clean: 0, listed: 0, sbl: 0, css: 0, barracuda: 0, dbl: 0, items: [] },
        b: rowB || { total: 0, clean: 0, listed: 0, sbl: 0, css: 0, barracuda: 0, dbl: 0, items: [] }
      };
    });

    // Team-level comparison
    const teamNames = Array.from(new Set([
      ...teams.map(t => t.name),
      ...serverComparisonRows.map(r => r.teamName)
    ])).filter(name => reportSelectedTeam === 'all' || name === reportSelectedTeam);

    interface StatItem {
      name: string;
      status: string;
      sbl: boolean;
      css: boolean;
      barracuda: boolean;
      dbl: boolean;
    }

    const teamComparisonRows = teamNames.map(teamName => {
      const servers = serverComparisonRows.filter(r => r.teamName === teamName);
      
      const a = servers.reduce((acc, curr) => ({
        total: acc.total + curr.a.total,
        clean: acc.clean + curr.a.clean,
        listed: acc.listed + curr.a.listed,
        sbl: acc.sbl + curr.a.sbl,
        css: acc.css + curr.a.css,
        barracuda: acc.barracuda + curr.a.barracuda,
        dbl: acc.dbl + curr.a.dbl,
        items: [...acc.items, ...curr.a.items]
      }), { total: 0, clean: 0, listed: 0, sbl: 0, css: 0, barracuda: 0, dbl: 0, items: [] as StatItem[] });

      const b = servers.reduce((acc, curr) => ({
        total: acc.total + curr.b.total,
        clean: acc.clean + curr.b.clean,
        listed: acc.listed + curr.b.listed,
        sbl: acc.sbl + curr.b.sbl,
        css: acc.css + curr.b.css,
        barracuda: acc.barracuda + curr.b.barracuda,
        dbl: acc.dbl + curr.b.dbl,
        items: [...acc.items, ...curr.b.items]
      }), { total: 0, clean: 0, listed: 0, sbl: 0, css: 0, barracuda: 0, dbl: 0, items: [] as StatItem[] });

      // Determine item-level deltas for this team
      const itemsDelta: { name: string; statusA: string; statusB: string; sblB: boolean; cssB: boolean; barracudaB: boolean; dblB: boolean }[] = [];
      const allItemNames = Array.from(new Set([
        ...a.items.map(i => i.name),
        ...b.items.map(i => i.name)
      ]));

      allItemNames.forEach(itemName => {
        const itemA = a.items.find(i => i.name === itemName);
        const itemB = b.items.find(i => i.name === itemName);
        const statusA = itemA?.status || 'Pending';
        const statusB = itemB?.status || 'Pending';

        if (statusA === 'Listed' || statusB === 'Listed' || statusA !== statusB) {
          itemsDelta.push({
            name: itemName,
            statusA,
            statusB,
            sblB: itemB?.sbl || false,
            cssB: itemB?.css || false,
            barracudaB: itemB?.barracuda || false,
            dblB: itemB?.dbl || false
          });
        }
      });

      return {
        teamName,
        a,
        b,
        servers,
        itemsDelta
      };
    }).filter(t => t.a.total > 0 || t.b.total > 0);

    return {
      statsA,
      statsB,
      teamComparisonRows
    };
  }, [teams, historicalData, dateA, dateB, reportCheckType, reportSelectedTeam]);

  const totals = useMemo(() => {
    if (!reportData) return null;
    return reportData.teamComparisonRows.reduce((acc, curr) => ({
      totalA: acc.totalA + curr.a.total,
      cleanA: acc.cleanA + curr.a.clean,
      listedA: acc.listedA + curr.a.listed,
      sblA: acc.sblA + curr.a.sbl,
      cssA: acc.cssA + curr.a.css,
      barracudaA: acc.barracudaA + curr.a.barracuda,
      dblA: acc.dblA + curr.a.dbl,

      totalB: acc.totalB + curr.b.total,
      cleanB: acc.cleanB + curr.b.clean,
      listedB: acc.listedB + curr.b.listed,
      sblB: acc.sblB + curr.b.sbl,
      cssB: acc.cssB + curr.b.css,
      barracudaB: acc.barracudaB + curr.b.barracuda,
      dblB: acc.dblB + curr.b.dbl,
    }), {
      totalA: 0, cleanA: 0, listedA: 0, sblA: 0, cssA: 0, barracudaA: 0, dblA: 0,
      totalB: 0, cleanB: 0, listedB: 0, sblB: 0, cssB: 0, barracudaB: 0, dblB: 0
    });
  }, [reportData]);

  const renderDeltaBadge = (valA: number, valB: number, reverseColors = false) => {
    const delta = valB - valA;
    if (delta === 0) return <span className="delta-badge neutral">0</span>;
    
    const isGood = reverseColors ? delta < 0 : delta > 0;
    const sign = delta > 0 ? '+' : '';
    
    return (
      <span className={`delta-badge ${isGood ? 'positive' : 'negative'}`}>
        {sign}{delta}
      </span>
    );
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
  };

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
          className={`mode-toggle-btn ${viewMode === 'reports' ? 'active' : ''}`}
          onClick={() => setViewMode('reports')}
        >
          Blacklist Reports
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
          {historicalDates.map((dateStr) => {
            const isActive = selectedHistoryDate === dateStr;
            const parts = dateStr.split('-');
            const yearStr = parts[0];
            const dayStr = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
            
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

      {viewMode !== 'reports' && (
        <>
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
        </>
      )}

      {viewMode === 'reports' && (
        <div className="reports-container" style={{ padding: 0, marginTop: '2rem' }}>
          <div className="filters-bar" style={{ marginTop: 0 }}>
            <div className="filter-group">
              <label>Check Type</label>
              <div className="check-type-toggle">
                <button
                  className={`check-type-btn ${reportCheckType === 'ips' ? 'active' : ''}`}
                  onClick={() => setReportCheckType('ips')}
                >
                  🌐 IPs Only
                </button>
                <button
                  className={`check-type-btn ${reportCheckType === 'domains' ? 'active' : ''}`}
                  onClick={() => setReportCheckType('domains')}
                >
                  🏷️ Domains Only
                </button>
              </div>
            </div>

            <div className="filter-group">
              <label>Team</label>
              <select value={reportSelectedTeam} onChange={e => setReportSelectedTeam(e.target.value)}>
                <option value="all">All Teams</option>
                {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label>Date A (Past/Yesterday)</label>
              <input 
                type="date" 
                value={dateA} 
                onChange={e => setDateA(e.target.value)} 
              />
            </div>

            <div className="filter-group">
              <label>Date B (Recent/Today)</label>
              <input 
                type="date" 
                value={dateB} 
                onChange={e => setDateB(e.target.value)} 
              />
            </div>
          </div>

          {reportData && reportData.statsA && reportData.statsB && (
            <div className="comparison-dashboard">
              {/* Checked Metric */}
              <div className="comparison-card checked-metric">
                <div className="card-title">
                  <span>📋</span> Total Checked
                </div>
                <div className="comparison-values">
                  <div className="date-value-box past">
                    <span className="date-value-label">{formatDateDisplay(dateA)}</span>
                    <span className="date-value-num">{reportData.statsA.totalChecked}</span>
                  </div>
                  <div className="date-value-box recent">
                    <span className="date-value-label">{formatDateDisplay(dateB)}</span>
                    <span className="date-value-num">{reportData.statsB.totalChecked}</span>
                  </div>
                  <div>
                    {renderDeltaBadge(reportData.statsA.totalChecked, reportData.statsB.totalChecked)}
                  </div>
                </div>
              </div>

              {/* Clean Metric */}
              <div className="comparison-card clean-metric">
                <div className="card-title">
                  <span>✅</span> Clean
                </div>
                <div className="comparison-values">
                  <div className="date-value-box past">
                    <span className="date-value-label">{formatDateDisplay(dateA)}</span>
                    <span className="date-value-num">{reportData.statsA.cleanCount}</span>
                    <span className="date-value-sub">
                      {(reportData.statsA.totalChecked > 0 ? ((reportData.statsA.cleanCount / reportData.statsA.totalChecked) * 100).toFixed(1) : '0.0')}%
                    </span>
                  </div>
                  <div className="date-value-box recent">
                    <span className="date-value-label">{formatDateDisplay(dateB)}</span>
                    <span className="date-value-num">{reportData.statsB.cleanCount}</span>
                    <span className="date-value-sub">
                      {(reportData.statsB.totalChecked > 0 ? ((reportData.statsB.cleanCount / reportData.statsB.totalChecked) * 100).toFixed(1) : '0.0')}%
                    </span>
                  </div>
                  <div>
                    {renderDeltaBadge(reportData.statsA.cleanCount, reportData.statsB.cleanCount)}
                  </div>
                </div>
              </div>

              {/* Listed Metric */}
              <div className="comparison-card listed-metric">
                <div className="card-title">
                  <span>⚠️</span> Listed
                </div>
                <div className="comparison-values">
                  <div className="date-value-box past">
                    <span className="date-value-label">{formatDateDisplay(dateA)}</span>
                    <span className="date-value-num">{reportData.statsA.listedCount}</span>
                    <span className="date-value-sub">
                      {(reportData.statsA.totalChecked > 0 ? ((reportData.statsA.listedCount / reportData.statsA.totalChecked) * 100).toFixed(1) : '0.0')}%
                    </span>
                  </div>
                  <div className="date-value-box recent">
                    <span className="date-value-label">{formatDateDisplay(dateB)}</span>
                    <span className="date-value-num">{reportData.statsB.listedCount}</span>
                    <span className="date-value-sub">
                      {(reportData.statsB.totalChecked > 0 ? ((reportData.statsB.listedCount / reportData.statsB.totalChecked) * 100).toFixed(1) : '0.0')}%
                    </span>
                  </div>
                  <div>
                    {renderDeltaBadge(reportData.statsA.listedCount, reportData.statsB.listedCount, true)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {reportData && reportData.teamComparisonRows.length > 0 ? (
            <div className="report-table-container">
              <table className="report-table">
                <thead>
                  <tr>
                    <th rowSpan={2} className="col-left" style={{ width: '25%' }}>Team</th>
                    <th colSpan={6} className="col-date-header">Date A ({formatDateDisplay(dateA)})</th>
                    <th colSpan={6} className="col-date-header col-divider-left">Date B ({formatDateDisplay(dateB)})</th>
                    <th rowSpan={2} className="col-divider-left">Delta</th>
                  </tr>
                  <tr>
                    <th>Total</th>
                    <th>Clean</th>
                    <th>SBL</th>
                    <th>CSS</th>
                    <th>Barra</th>
                    <th>DBL</th>
                    
                    <th className="col-divider-left">Total</th>
                    <th>Clean</th>
                    <th>SBL</th>
                    <th>CSS</th>
                    <th>Barra</th>
                    <th>DBL</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.teamComparisonRows.map((teamRow) => {
                    const isExpanded = !!expandedTeams[teamRow.teamName];

                    return (
                      <React.Fragment key={teamRow.teamName}>
                        <tr 
                          className={`team-row ${isExpanded ? 'expanded' : ''}`}
                          onClick={() => toggleTeam(teamRow.teamName)}
                        >
                          <td className="col-left">
                            <div className="team-name-cell">
                              <span className={`expander-arrow ${isExpanded ? 'expanded' : ''}`}>▶</span>
                              <span>Team {teamRow.teamName}</span>
                            </div>
                            <div className="server-cell-sub">{teamRow.servers.length} servers</div>
                          </td>

                          <td className="stat-cell-val">{teamRow.a.total}</td>
                          <td className="stat-cell-val clean">{teamRow.a.clean}</td>
                          <td className="stat-cell-val sbl">{teamRow.a.sbl}</td>
                          <td className="stat-cell-val css">{teamRow.a.css}</td>
                          <td className="stat-cell-val barracuda">{teamRow.a.barracuda}</td>
                          <td className="stat-cell-val dbl">{teamRow.a.dbl}</td>

                          <td className="stat-cell-val col-divider-left">{teamRow.b.total}</td>
                          <td className="stat-cell-val clean">{teamRow.b.clean}</td>
                          <td className="stat-cell-val sbl">{teamRow.b.sbl}</td>
                          <td className="stat-cell-val css">{teamRow.b.css}</td>
                          <td className="stat-cell-val barracuda">{teamRow.b.barracuda}</td>
                          <td className="stat-cell-val dbl">{teamRow.b.dbl}</td>

                          <td className="col-divider-left">
                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Clean:</span>
                              {renderDeltaBadge(teamRow.a.clean, teamRow.b.clean)}
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.2rem' }}>Listed:</span>
                              {renderDeltaBadge(teamRow.a.listed, teamRow.b.listed, true)}
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="details-row">
                            <td colSpan={14} className="details-cell">
                              <div className="details-container">
                                <div className="details-title">
                                  <span>🔍</span> Active listings / status changes for Team {teamRow.teamName}
                                </div>
                                
                                {teamRow.itemsDelta.length === 0 ? (
                                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                                    No status changes or listed IPs/domains found between these dates.
                                  </div>
                                ) : (
                                  <div className="details-grid">
                                    {teamRow.itemsDelta.map((item, idx) => {
                                      const classA = item.statusA === 'Clean' ? 'clean' : (item.statusA === 'Listed' ? 'listed' : 'pending');
                                      const classB = item.statusB === 'Clean' ? 'clean' : (item.statusB === 'Listed' ? 'listed' : 'pending');

                                      return (
                                        <div key={idx} className="detail-item-card">
                                          <span className="detail-item-name" title={item.name}>
                                            {item.name}
                                          </span>
                                          
                                          <div className="detail-item-status-wrapper">
                                            <span className={`detail-status-badge ${classA}`}>
                                              {item.statusA}
                                            </span>
                                            <span className="detail-status-arrow">➔</span>
                                            <span className={`detail-status-badge ${classB}`}>
                                              {item.statusB}
                                              {item.statusB === 'Listed' && (
                                                <span style={{ fontSize: '0.7rem', opacity: 0.8, marginLeft: '0.25rem' }}>
                                                  ({item.sblB ? 'SBL ' : ''}
                                                  {item.cssB ? 'CSS ' : ''}
                                                  {item.barracudaB ? 'Barra ' : ''}
                                                  {item.dblB ? 'DBL ' : ''})
                                                </span>
                                              )}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {totals && reportData.teamComparisonRows.length > 0 && (
                    <tr className="totals-row">
                      <td className="col-left">TOTAL</td>
                      
                      <td>{totals.totalA}</td>
                      <td className="clean">{totals.cleanA}</td>
                      <td>{totals.sblA}</td>
                      <td>{totals.cssA}</td>
                      <td>{totals.barracudaA}</td>
                      <td>{totals.dblA}</td>

                      <td className="col-divider-left">{totals.totalB}</td>
                      <td className="clean">{totals.cleanB}</td>
                      <td>{totals.sblB}</td>
                      <td>{totals.cssB}</td>
                      <td>{totals.barracudaB}</td>
                      <td>{totals.dblB}</td>

                      <td className="col-divider-left">
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Clean:</span>
                          {renderDeltaBadge(totals.cleanA, totals.cleanB)}
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.2rem' }}>Listed:</span>
                          {renderDeltaBadge(totals.listedA, totals.listedB, true)}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">📭</span>
              <h3>No Data Recorded</h3>
              <p>No blacklist check history matches the selected dates, check type, and team filter.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
