'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { loadTeamsFromFirebase, saveTeamsToFirebase, loadIpStatusFromFirebase, saveIpStatusToFirebase } from '@/lib/firebaseTeams';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import './Infrastructure.css';

interface TeamStats {
  teamName: string;
  totalServers: number;
  totalIps: number;
  spfOk: number;
  spfFail: number;
  spfPending: number;
  rdnsOk: number;
  rdnsFail: number;
  rdnsPending: number;
  vmtaOk: number;
  vmtaFail: number;
  vmtaPending: number;
}

interface ScheduleItem {
  id: string;
  name: string;
  type: 'rdns' | 'vmta' | 'both' | 'spf' | 'blacklist_ips' | 'blacklist_domains' | 'blacklist_both' | 'payment_notice' | 'imap_sync';
  cronExpression: string;
  enabled: boolean;
  lastRun?: string;
  teamName?: string;
}

export default function InfrastructurePage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');

  // Scheduler States
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleType, setNewScheduleType] = useState<'rdns' | 'vmta' | 'both' | 'spf'>('both');
  const [newScheduleTime1, setNewScheduleTime1] = useState('08:00');
  const [newScheduleTime2, setNewScheduleTime2] = useState('');
  const [newScheduleTeam, setNewScheduleTeam] = useState('all');
  const [newScheduleFrequency, setNewScheduleFrequency] = useState<'time' | '1h' | '2h' | '6h' | '12h'>('time');
  const [newScheduleDays, setNewScheduleDays] = useState<number[]>([1,2,3,4,5,6,0]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Load teams & schedules
  const loadSchedules = () => {
    fetch('/api/schedule')
      .then(r => r.json())
      .then(data => {
        if (data.schedules) setSchedules(data.schedules);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await loadTeamsFromFirebase();
        if (data) {
          setTeams(data);
        }
      } catch (e) {
        console.error('Failed to load teams stats:', e);
      } finally {
        setIsLoaded(true);
      }
    };
    load();
    loadSchedules();
  }, []);

  const statsList = useMemo<TeamStats[]>(() => {
    return teams.map(t => {
      const dbServers = t.servers?.filter((s: any) => s.status !== 'deleted') || [];
      let totalIps = 0;
      let spfOk = 0, spfFail = 0, spfPending = 0;
      let rdnsOk = 0, rdnsFail = 0, rdnsPending = 0;
      let vmtaOk = 0, vmtaFail = 0, vmtaPending = 0;

      dbServers.forEach((server: any) => {
        const ipDomains = getUniqueIpDomains(server.ipDomains);
        
        const processIp = (ip: string, domain: string) => {
          totalIps++;

          // SPF status
          const spfDetail = server.spfDetails?.[ip];
          if (spfDetail) {
            if (spfDetail.status === 'OK') spfOk++;
            else if (spfDetail.status === 'FAIL') spfFail++;
            else spfPending++;
          } else {
            spfPending++;
          }

          // rDNS status
          const ptrQuery = (server.rdnsDetails || []).find((q: any) => q.type === 'PTR' && q.query === ip);
          if (domain && domain !== 'No Domain Mapped') {
            const aQuery = (server.rdnsDetails || []).find((q: any) => q.type === 'A' && q.query === domain);
            if (ptrQuery && aQuery) {
              if (ptrQuery.match === 'OK' && aQuery.match === 'OK') rdnsOk++;
              else rdnsFail++;
            } else {
              rdnsPending++;
            }
          } else {
            if (ptrQuery) {
              if (ptrQuery.match === 'OK') rdnsOk++;
              else rdnsFail++;
            } else {
              rdnsPending++;
            }
          }

          // VMTA status
          const vmta = server.vmtaDetails?.[ip];
          if (vmta !== undefined) {
            if (vmta && vmta !== '-' && vmta !== '—') vmtaOk++;
            else vmtaFail++;
          } else {
            vmtaPending++;
          }
        };

        if (ipDomains.length > 0) {
          ipDomains.forEach((d: any) => {
            if (d.ip) processIp(d.ip, d.domain);
          });
        } else if (server.mainIp) {
          processIp(server.mainIp, 'No Domain Mapped');
        }
      });

      return {
        teamName: t.name,
        totalServers: dbServers.length,
        totalIps,
        spfOk,
        spfFail,
        spfPending,
        rdnsOk,
        rdnsFail,
        rdnsPending,
        vmtaOk,
        vmtaFail,
        vmtaPending
      };
    });
  }, [teams]);

  // Copy helpers
  const copySpfData = (teamName: string, status: 'OK' | 'FAIL' | 'Pending') => {
    const team = teams.find(t => t.name === teamName);
    const dbServers = team?.servers?.filter((s: any) => s.status !== 'deleted') || [];
    const items: string[] = [];
    
    dbServers.forEach((server: any) => {
      const ipDomains = getUniqueIpDomains(server.ipDomains);
      const processIp = (ip: string, domain: string) => {
        const spfDetail = server.spfDetails?.[ip];
        const itemStatus = spfDetail ? spfDetail.status : 'Pending';
        if (itemStatus === status) {
          items.push(`${ip}\t${domain}\t${spfDetail?.record || '—'}\t${spfDetail?.reason || '—'}`);
        }
      };
      if (ipDomains.length > 0) {
        ipDomains.forEach((d: any) => { if (d.ip) processIp(d.ip, d.domain); });
      } else if (server.mainIp) {
        processIp(server.mainIp, 'No Domain Mapped');
      }
    });

    if (items.length > 0) {
      const header = 'IP Address\tDomain\tSPF Record\tDetails';
      const text = `${header}\n${items.join('\n')}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`📋 Copied ${items.length} SPF (${status}) items for ${teamName}!`);
      });
    } else {
      showToast(`No SPF (${status}) items found for ${teamName}.`);
    }
  };

  const copyRdnsData = (teamName: string, status: 'OK' | 'FAIL' | 'Pending') => {
    const team = teams.find(t => t.name === teamName);
    const dbServers = team?.servers?.filter((s: any) => s.status !== 'deleted') || [];
    const items: string[] = [];

    dbServers.forEach((server: any) => {
      const ipDomains = getUniqueIpDomains(server.ipDomains);
      const processIp = (ip: string, domain: string) => {
        const ptrQuery = (server.rdnsDetails || []).find((q: any) => q.type === 'PTR' && q.query === ip);
        const aQuery = (server.rdnsDetails || []).find((q: any) => q.type === 'A' && q.query === domain);
        let itemStatus: 'OK' | 'FAIL' | 'Pending' = 'Pending';
        let detail = 'Pending check';

        if (domain && domain !== 'No Domain Mapped') {
          if (ptrQuery && aQuery) {
            itemStatus = (ptrQuery.match === 'OK' && aQuery.match === 'OK') ? 'OK' : 'FAIL';
            detail = `PTR: ${ptrQuery.result || 'No PTR'}, A: ${aQuery.result || 'No A'}`;
          } else if (ptrQuery) {
            if (ptrQuery.match !== 'OK') {
              itemStatus = 'FAIL';
              detail = `PTR: ${ptrQuery.result || 'No PTR'}, A: Pending`;
            }
          }
        } else {
          if (ptrQuery) {
            itemStatus = ptrQuery.match === 'OK' ? 'OK' : 'FAIL';
            detail = `PTR: ${ptrQuery.result || 'No PTR'}`;
          }
        }

        if (itemStatus === status) {
          items.push(`${ip}\t${domain}\t${detail}`);
        }
      };

      if (ipDomains.length > 0) {
        ipDomains.forEach((d: any) => { if (d.ip) processIp(d.ip, d.domain); });
      } else if (server.mainIp) {
        processIp(server.mainIp, 'No Domain Mapped');
      }
    });

    if (items.length > 0) {
      const header = 'IP Address\tDomain\tDetails';
      const text = `${header}\n${items.join('\n')}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`📋 Copied ${items.length} rDNS (${status}) items for ${teamName}!`);
      });
    } else {
      showToast(`No rDNS (${status}) items found for ${teamName}.`);
    }
  };

  const copyVmtaData = (teamName: string, status: 'OK' | 'FAIL' | 'Pending') => {
    const team = teams.find(t => t.name === teamName);
    const dbServers = team?.servers?.filter((s: any) => s.status !== 'deleted') || [];
    const items: string[] = [];

    dbServers.forEach((server: any) => {
      const ipDomains = getUniqueIpDomains(server.ipDomains);
      const processIp = (ip: string, domain: string) => {
        const vmta = server.vmtaDetails?.[ip];
        let itemStatus: 'OK' | 'FAIL' | 'Pending' = 'Pending';
        if (vmta !== undefined) {
          itemStatus = (vmta && vmta !== '-' && vmta !== '—') ? 'OK' : 'FAIL';
        }

        if (itemStatus === status) {
          items.push(`${ip}\t${domain}\t${vmta || '—'}`);
        }
      };

      if (ipDomains.length > 0) {
        ipDomains.forEach((d: any) => { if (d.ip) processIp(d.ip, d.domain); });
      } else if (server.mainIp) {
        processIp(server.mainIp, 'No Domain Mapped');
      }
    });

    if (items.length > 0) {
      const header = 'IP Address\tDomain\tVMTA';
      const text = `${header}\n${items.join('\n')}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`📋 Copied ${items.length} VMTA (${status}) items for ${teamName}!`);
      });
    } else {
      showToast(`No VMTA (${status}) items found for ${teamName}.`);
    }
  };

  // Schedule Management Actions
  const handleAddSchedule = async () => {
    if (newScheduleFrequency === 'time' && !newScheduleTime1) return;
    if (newScheduleDays.length === 0) {
      alert('Please select at least one day.');
      return;
    }

    const dayStr = newScheduleDays.length === 7 ? '*' : newScheduleDays.join(',');
    
    if (newScheduleFrequency !== 'time') {
      let interval = 1;
      if (newScheduleFrequency === '2h') interval = 2;
      if (newScheduleFrequency === '6h') interval = 6;
      if (newScheduleFrequency === '12h') interval = 12;
      
      const cronExpr = interval === 1 ? `0 * * * ${dayStr}` : `0 */${interval} * * ${dayStr}`;
      const name = newScheduleName || `Auto ${newScheduleType.toUpperCase()} (Every ${interval}h)`;

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          name,
          type: newScheduleType,
          cronExpression: cronExpr,
          teamName: newScheduleTeam
        })
      });
      const data = await res.json();
      if (data.schedules) setSchedules(data.schedules);
    } else {
      const [h1, m1] = newScheduleTime1.split(':');
      let cronExpr = `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`;
      const name = newScheduleName || `Auto ${newScheduleType.toUpperCase()} ${newScheduleTime1}`;

      if (newScheduleTime2) {
        const [h2, m2] = newScheduleTime2.split(':');
        await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: `${name} (1)`, type: newScheduleType, cronExpression: `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`, teamName: newScheduleTeam })
        });
        const res2 = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: `${name} (2)`, type: newScheduleType, cronExpression: `${parseInt(m2)} ${parseInt(h2)} * * ${dayStr}`, teamName: newScheduleTeam })
        });
        const data = await res2.json();
        if (data.schedules) setSchedules(data.schedules);
      } else {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name, type: newScheduleType, cronExpression: cronExpr, teamName: newScheduleTeam })
        });
        const data = await res.json();
        if (data.schedules) setSchedules(data.schedules);
      }
    }

    setNewScheduleName('');
    setNewScheduleTime1('08:00');
    setNewScheduleTime2('');
    setNewScheduleType('both');
    setNewScheduleTeam('all');
    setNewScheduleFrequency('time');
    setNewScheduleDays([1,2,3,4,5,6,0]);
    showToast('Schedule added successfully!');
  };

  const handleToggleSchedule = async (id: string, enabled: boolean) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', id, enabled })
    });
    const data = await res.json();
    if (data.schedules) setSchedules(data.schedules);
    showToast(`Schedule ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleDeleteSchedule = async (id: string) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id })
    });
    const data = await res.json();
    if (data.schedules) setSchedules(data.schedules);
    showToast('Schedule deleted successfully');
  };

  const handleRunAllChecks = async () => {
    setIsCheckingAll(true);
    try {
      setProgressMessage('🔄 Loading teams...');
      const freshTeams = await loadTeamsFromFirebase();
      let currentTeams = freshTeams && freshTeams.length > 0 ? freshTeams : [...teams];

      // 1. SPF CHECK
      setProgressMessage('⚡ Checking SPF...');
      const allSpfRows: any[] = [];
      currentTeams.forEach(t => {
        const dbServers = t.servers?.filter((s: any) => s.status !== 'deleted') || [];
        dbServers.forEach((server: any) => {
          const ipDomains = getUniqueIpDomains(server.ipDomains);
          if (ipDomains.length > 0) {
            ipDomains.forEach((d: any) => {
              if (!d.ip || !d.domain) return;
              allSpfRows.push({ serverId: server.id, teamName: t.name, serverName: server.serverName, ip: d.ip, domain: d.domain });
            });
          } else if (server.mainIp) {
            allSpfRows.push({ serverId: server.id, teamName: t.name, serverName: server.serverName, ip: server.mainIp, domain: 'No Domain Mapped' });
          }
        });
      });

      if (allSpfRows.length > 0) {
        const itemsToRequest = allSpfRows.map(r => ({ domain: r.domain, ip: r.ip }));
        const allSpfResults: Record<string, { status: 'OK' | 'FAIL', record: string, reason?: string }> = {};
        const batchSize = 15;
        for (let i = 0; i < itemsToRequest.length; i += batchSize) {
          const batch = itemsToRequest.slice(i, i + batchSize);
          setProgressMessage(`⚡ Checking SPF (${Math.min(i + batch.length, itemsToRequest.length)}/${itemsToRequest.length})...`);
          const response = await fetch('/api/infrastructure/spf-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: batch })
          });
          const data = await response.json();
          if (data.results) {
            Object.assign(allSpfResults, data.results);
          }
        }

        // Merge SPF results
        const todayStr = new Date().toLocaleDateString('fr-FR');
        currentTeams = currentTeams.map(t => {
          return {
            ...t,
            servers: (t.servers || []).map((s: any) => {
              if (s.status === 'deleted') return s;
              const newSpfDetails = { ...(s.spfDetails || {}) };
              let hasUpdates = false;
              const serverIps: string[] = [];
              const uniqueDomains = getUniqueIpDomains(s.ipDomains);
              if (uniqueDomains.length > 0) uniqueDomains.forEach((d: any) => serverIps.push(d.ip));
              else if (s.mainIp) serverIps.push(s.mainIp);

              serverIps.forEach(ip => {
                const matchingDomain = uniqueDomains.find((d: any) => d.ip === ip)?.domain || 'No Domain Mapped';
                const resultKey = `${matchingDomain}_${ip}`;
                const lookupResult = allSpfResults[resultKey];
                if (lookupResult) {
                  newSpfDetails[ip] = {
                    status: lookupResult.status,
                    record: lookupResult.record,
                    reason: lookupResult.reason || '',
                    date: todayStr
                  };
                  hasUpdates = true;
                }
              });
              if (hasUpdates) return { ...s, spfDetails: newSpfDetails };
              return s;
            })
          };
        });

        // Send Telegram SPF Report
        const failedByTeamSpf: Record<string, any[]> = {};
        allSpfRows.forEach(r => {
          const matchingDomain = r.domain;
          const lookup = allSpfResults[`${matchingDomain}_${r.ip}`];
          if (lookup && lookup.status === 'FAIL') {
            const tName = r.teamName;
            if (!failedByTeamSpf[tName]) failedByTeamSpf[tName] = [];
            failedByTeamSpf[tName].push({ ...r, reason: lookup.reason || 'Failed' });
          }
        });

        const nowStr = new Date().toLocaleString('en-US');
        let telegramSpfMessage = '';
        if (Object.keys(failedByTeamSpf).length > 0) {
          telegramSpfMessage = `🔍 <b>SPF check Failures — ALL TEAMS</b>\nStatus: ⚠️ ISSUES DETECTED\n📅 ${nowStr}\n\n`;
          Object.entries(failedByTeamSpf).forEach(([team, items]) => {
            telegramSpfMessage += `🏢 <b>Team ${team}</b>\n`;
            items.forEach((f: any) => {
              telegramSpfMessage += `• <b>${f.serverName}</b>\n  IP: ${f.ip}\n  Domain: <code>${f.domain}</code>\n  Reason: <i>${f.reason}</i>\n\n`;
            });
          });
        } else {
          telegramSpfMessage = `✅ <b>SPF check PASSED — ALL TEAMS</b>\n📅 ${nowStr}\n\nAll domains SPF check successfully validated across all teams! 🎉`;
        }

        fetch('/api/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: telegramSpfMessage,
            chatId: '-1003727951074',
            threadId: 7
          })
        }).catch(err => console.error('Failed to send Telegram notice:', err));
      }

      // 2. rDNS CHECK
      setProgressMessage('🛰️ Checking rDNS...');
      currentTeams = await Promise.all(currentTeams.map(async (team) => {
        const activeServers = team.servers?.filter((s: any) => s.status !== 'deleted') || [];
        if (activeServers.length === 0) return team;

        setProgressMessage(`🛰️ Checking rDNS (${team.name} Team)...`);
        const response = await fetch('/api/rdns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servers: activeServers })
        });
        const data = await response.json();

        if (data.results) {
          const todayStrRdns = new Date().toLocaleString('en-US');
          return {
            ...team,
            servers: team.servers.map((s: any) => {
              const result = data.results.find((r: any) => r.serverId === s.id);
              if (result) {
                return {
                  ...s,
                  rdnsStatus: result.overallMatch ? 'OK' : 'FAIL',
                  rdnsDate: todayStrRdns,
                  rdnsDetails: result.queries
                };
              }
              return s;
            })
          };
        }
        return team;
      }));

      // Update IP Status tracker from rDNS check
      try {
        const ipHistory = await loadIpStatusFromFirebase() || {};
        const todayKey = new Date().toISOString().split('T')[0];
        let ipHistoryChanged = false;

        currentTeams.forEach((team: any) => {
          const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
          activeServers.forEach((server: any) => {
            if (!server.rdnsDetails) return;
            const uniqueDomains = getUniqueIpDomains(server.ipDomains);
            if (uniqueDomains.length > 0) {
              uniqueDomains.forEach((mapping: any) => {
                const ip = mapping.ip;
                const domain = mapping.domain;

                const ptrQ = (server.rdnsDetails || []).find((q: any) => q.type === 'PTR' && q.query === ip);
                const aQ = (server.rdnsDetails || []).find((q: any) => q.type === 'A' && q.query === domain);

                const isOk = ptrQ?.match === 'OK' && aQ?.match === 'OK';
                if (!ipHistory[ip]) ipHistory[ip] = {};

                const current = ipHistory[ip][todayKey];
                const protectStatuses = ['Change DOM', 'DOWN', 'BOUNCE', 'TO', 'PAUSED'];
                if (isOk) {
                  if (!current || current === 'RDNS Not Active') {
                    ipHistory[ip][todayKey] = 'RDNS';
                    ipHistoryChanged = true;
                  }
                } else {
                  if (!current || (!protectStatuses.includes(current) && current !== 'RDNS Not Active')) {
                    ipHistory[ip][todayKey] = 'RDNS Not Active';
                    ipHistoryChanged = true;
                  }
                }
              });
            } else if (server.mainIp) {
              const ip = server.mainIp;
              const ptrQ = (server.rdnsDetails || []).find((q: any) => q.type === 'PTR' && q.query === ip);
              const isOk = ptrQ?.match === 'OK';
              if (!ipHistory[ip]) ipHistory[ip] = {};

              const current = ipHistory[ip][todayKey];
              const protectStatuses = ['Change DOM', 'DOWN', 'BOUNCE', 'TO', 'PAUSED'];
              if (isOk) {
                if (!current || current === 'RDNS Not Active') {
                  ipHistory[ip][todayKey] = 'RDNS';
                  ipHistoryChanged = true;
                }
              } else {
                if (!current || (!protectStatuses.includes(current) && current !== 'RDNS Not Active')) {
                  ipHistory[ip][todayKey] = 'RDNS Not Active';
                  ipHistoryChanged = true;
                }
              }
            }
          });
        });

        if (ipHistoryChanged) {
          await saveIpStatusToFirebase(ipHistory);
        }
      } catch (ipErr) {
        console.error('Failed to update IP Status Tracker from rDNS check:', ipErr);
      }

      // Send Telegram rDNS report
      const failedRdnsItems: any[] = [];
      currentTeams.forEach(team => {
        const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
        activeServers.forEach((server: any) => {
          if (server.rdnsStatus === 'FAIL' && server.rdnsDetails) {
            failedRdnsItems.push({ teamName: team.name, serverName: server.serverName, queries: server.rdnsDetails });
          }
        });
      });

      let telegramRdnsMessage = '';
      const nowStrRdns = new Date().toLocaleString('en-US');
      if (failedRdnsItems.length > 0) {
        telegramRdnsMessage = `🔍 <b>rDNS check Failures — ALL TEAMS</b>\nStatus: ⚠️ ISSUES DETECTED\n📅 ${nowStrRdns}\n\n`;
        const groupedByTeamRdns = failedRdnsItems.reduce((acc, item) => {
          if (!acc[item.teamName]) acc[item.teamName] = [];
          acc[item.teamName].push(item);
          return acc;
        }, {} as Record<string, any[]>);

        Object.entries(groupedByTeamRdns).forEach(([teamName, items]) => {
          telegramRdnsMessage += `🏢 <b>Team ${teamName}</b>\n`;
          (items as any[]).forEach((f: any) => {
            telegramRdnsMessage += `• <b>${f.serverName}</b>\n`;
            const failedQueries = (f.queries || []).filter((q: any) => q.match !== 'OK');
            failedQueries.forEach((q: any) => {
              telegramRdnsMessage += `  ${q.type} Query: <code>${q.query}</code>\n  Result: <code>${q.result}</code>\n`;
            });
            telegramRdnsMessage += `\n`;
          });
        });
      } else {
        telegramRdnsMessage = `✅ <b>rDNS check PASSED — ALL TEAMS</b>\n📅 ${nowStrRdns}\n\nAll reverse and forward records checked successfully validated across all teams! 🎉`;
      }

      fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: telegramRdnsMessage,
          chatId: '-1003727951074',
          threadId: 5
        })
      }).catch(err => console.error('Failed to send Telegram notice:', err));

      // 3. VMTA SYNC
      setProgressMessage('✉️ Syncing VMTA...');
      let allTeamReportsVmta: string[] = [];
      currentTeams = await Promise.all(currentTeams.map(async (team) => {
        const activeServers = team.servers?.filter((s: any) => s.status !== 'deleted') || [];
        if (activeServers.length === 0) return team;

        setProgressMessage(`✉️ Syncing VMTA (${team.name} Team)...`);
        const response = await fetch('/api/vmta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servers: activeServers })
        });
        const data = await response.json();
        if (data.mapping) {
          const todayStrVmta = new Date().toLocaleString('en-US');
          const changedAlerts: string[] = [];
          const emptyAlerts: string[] = [];

          const updatedServers = team.servers.map((s: any) => {
            if (s.status === 'deleted') return s;
            const newVmtaDetails = { ...(s.vmtaDetails || {}) };
            let hasUpdates = false;
            const serverIps: string[] = [];
            const uniqueDomains = getUniqueIpDomains(s.ipDomains);
            if (uniqueDomains.length > 0) uniqueDomains.forEach((d: any) => serverIps.push(d.ip));
            else if (s.mainIp) serverIps.push(s.mainIp);

            serverIps.forEach(ip => {
              const oldVmta = s.vmtaDetails?.[ip];
              const newVmta = data.mapping[ip];
              if (newVmta) {
                newVmtaDetails[ip] = newVmta;
                hasUpdates = true;
                if (oldVmta && oldVmta !== newVmta) {
                  changedAlerts.push(`⚠️ <b>${s.serverName}</b> - <code>${ip}</code>:\n   <i>${oldVmta}</i> ➔ <i>${newVmta}</i>`);
                }
              } else {
                newVmtaDetails[ip] = '-';
                hasUpdates = true;
                if (!oldVmta || oldVmta !== '-') {
                  emptyAlerts.push(`❌ <b>${s.serverName}</b> - <code>${ip}</code>`);
                }
              }
            });
            if (hasUpdates) {
              return { ...s, vmtaDetails: newVmtaDetails, rdnsDate: todayStrVmta };
            }
            return s;
          });

          if (changedAlerts.length > 0 || emptyAlerts.length > 0) {
            let teamMsg = `🏢 <b>Team ${team.name}</b>\n`;
            if (changedAlerts.length > 0) teamMsg += `<b>⚠️ CHANGED:</b>\n${changedAlerts.join('\n')}\n`;
            if (emptyAlerts.length > 0) teamMsg += `<b>❌ MISSING:</b>\n${emptyAlerts.join('\n')}\n`;
            allTeamReportsVmta.push(teamMsg);
          }

          return { ...team, servers: updatedServers };
        }
        return team;
      }));

      // Send Telegram VMTA report
      let telegramMsgVmta = `📥 <b>VMTA SYNC REPORT - ALL TEAMS</b>\n📅 ${new Date().toLocaleString('en-US')}\n\n`;
      if (allTeamReportsVmta.length > 0) {
        telegramMsgVmta += allTeamReportsVmta.join('\n\n');
      } else {
        telegramMsgVmta += `✅ All VMTAs are synced and matching successfully across all teams!`;
      }

      fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: telegramMsgVmta,
          chatId: '-1003727951074',
          threadId: 9
        })
      }).catch(err => console.error('Telegram notification error:', err));

      // 4. SAVE RESULTS TO FIREBASE & STATE
      setProgressMessage('💾 Saving results...');
      await saveTeamsToFirebase(currentTeams);
      setTeams(currentTeams);

      // Sync to cron backend
      fetch('/api/cron-check', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teams: currentTeams })
      }).catch(() => {});

      showToast('✅ All infrastructure checks completed and stats updated!');
    } catch (err) {
      console.error(err);
      alert('Error occurred running all checks');
    } finally {
      setIsCheckingAll(false);
      setProgressMessage('');
    }
  };

  // Filter schedules to display only infrastructure checks
  const infraSchedules = schedules.filter(s => 
    s.type === 'rdns' || s.type === 'vmta' || s.type === 'both' || s.type === 'spf'
  );

  return (
    <div className="infra-page animate-fade-in">
      {/* Header */}
      <div className="infra-header" style={{ marginBottom: '2.5rem' }}>
        <div className="infra-title">
          <h1 style={{ fontSize: '2.2rem', background: 'linear-gradient(135deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Infrastructure Check Center
          </h1>
          <p style={{ fontSize: '1rem', marginTop: '0.5rem' }}>
            Verify PTR records, check SPF domains, and track virtual MTA syncing status.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button 
            className="btn-orange" 
            style={{ 
              background: '#f97316', 
              borderColor: '#ea580c',
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.15)',
              padding: '0.6rem 1.2rem',
              fontSize: '0.9rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#fff',
              border: '1px solid #ea580c',
              borderRadius: '6px',
              cursor: isCheckingAll ? 'not-allowed' : 'pointer'
            }}
            onClick={handleRunAllChecks}
            disabled={isCheckingAll}
          >
            {isCheckingAll ? (
              <>
                <span className="spinner-infra" />
                <span>{progressMessage}</span>
              </>
            ) : (
              <>⚡ Run All Checks</>
            )}
          </button>
          <button 
            className="btn-blue" 
            style={{ 
              background: isScheduleOpen ? '#059669' : '#10b981', 
              borderColor: isScheduleOpen ? '#047857' : '#059669',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
              padding: '0.6rem 1.2rem',
              fontSize: '0.9rem',
              fontWeight: 700
            }}
            onClick={() => setIsScheduleOpen(!isScheduleOpen)}
          >
            {isScheduleOpen ? '✕ Close Scheduler' : '⏰ Auto Schedule'}
          </button>
        </div>
      </div>

      {/* Inline Schedule Panel */}
      {isScheduleOpen && (
        <div className="animate-fade-in" style={{
          background: 'rgba(16, 185, 129, 0.04)',
          border: '1px solid rgba(16, 185, 129, 0.15)',
          borderRadius: '12px',
          padding: '1.2rem',
          marginBottom: '2rem',
        }}>
          <div className="schedules-grid">
            {/* New Schedule Form */}
            <div className="new-schedule-card">
              <p className="schedule-title" style={{ color: '#10b981' }}>➕ Create Schedule</p>
              <div className="schedule-inputs">
                <input
                  type="text"
                  placeholder="Schedule Name"
                  value={newScheduleName}
                  onChange={e => setNewScheduleName(e.target.value)}
                />
                
                <select
                  value={newScheduleType}
                  onChange={e => setNewScheduleType(e.target.value as any)}
                >
                  <option value="both">RDNS & VMTA (DKIM)</option>
                  <option value="rdns">RDNS Only</option>
                  <option value="vmta">VMTA (DKIM) Only</option>
                  <option value="spf">SPF Check Only</option>
                </select>

                <select
                  value={newScheduleTeam}
                  onChange={e => setNewScheduleTeam(e.target.value)}
                >
                  <option value="all">All Teams</option>
                  {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>

                <select
                  value={newScheduleFrequency}
                  onChange={e => setNewScheduleFrequency(e.target.value as any)}
                >
                  <option value="time">Specific Times</option>
                  <option value="1h">Every 1 Hour</option>
                  <option value="2h">Every 2 Hours</option>
                  <option value="6h">Every 6 Hours</option>
                  <option value="12h">Every 12 Hours</option>
                </select>

                {newScheduleFrequency === 'time' && (
                  <input 
                    type="time"
                    value={newScheduleTime1}
                    onChange={e => setNewScheduleTime1(e.target.value)}
                  />
                )}
                {newScheduleFrequency === 'time' && (
                  <input 
                    type="time"
                    value={newScheduleTime2}
                    onChange={e => setNewScheduleTime2(e.target.value)}
                    placeholder="Time 2 (Optional)"
                  />
                )}
                
                <div className="schedule-days-row">
                  {[{l:'M',v:1}, {l:'T',v:2}, {l:'W',v:3}, {l:'T',v:4}, {l:'F',v:5}, {l:'S',v:6}, {l:'S',v:0}].map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`day-btn ${newScheduleDays.includes(day.v) ? 'active' : ''}`}
                      style={{ padding: '0.3rem 0', background: newScheduleDays.includes(day.v) ? '#10b981' : 'rgba(255,255,255,0.04)', color: newScheduleDays.includes(day.v) ? '#fff' : '#94a3b8' }}
                      onClick={() => {
                        if (newScheduleDays.includes(day.v)) {
                          setNewScheduleDays(newScheduleDays.filter(d => d !== day.v));
                        } else {
                          setNewScheduleDays([...newScheduleDays, day.v].sort());
                        }
                      }}
                    >
                      {day.l}
                    </button>
                  ))}
                </div>

                <button 
                  className="btn-blue" 
                  style={{ background: '#10b981', padding: '0.7rem', gridColumn: '1 / -1', fontSize: '1.05rem', fontWeight: 600, border: 'none', justifyContent: 'center' }}
                  onClick={handleAddSchedule}
                >
                  Save Schedule
                </button>
              </div>
            </div>

            {/* Existing Schedules */}
            <div className="active-schedules-list">
              <p className="schedule-title" style={{ color: '#10b981' }}>📋 Active Schedules</p>
              {infraSchedules.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '1rem', textAlign: 'center', padding: '1rem' }}>No automated schedules configured yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {infraSchedules.map(s => (
                    <div key={s.id} className={`schedule-item-row ${s.enabled ? 'enabled' : ''}`} style={{ background: s.enabled ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.4)', borderColor: s.enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.06)', borderStyle: 'solid', borderWidth: '1px' }}>
                      <button
                        className={`toggle-switch-btn ${s.enabled ? 'active' : ''}`}
                        style={{ background: s.enabled ? '#10b981' : '#475569' }}
                        onClick={() => handleToggleSchedule(s.id, !s.enabled)}
                      >
                        <span className="toggle-switch-dot" style={{ left: s.enabled ? '19px' : '3px' }} />
                      </button>
                      <div className="schedule-info-pane">
                        <div className="schedule-info-name">{s.name}</div>
                        <div className="schedule-info-details">
                          {s.type.toUpperCase()} • {s.cronExpression} • Team: {s.teamName || 'all'}
                          {s.lastRun && ` • Last: ${new Date(s.lastRun).toLocaleString()}`}
                        </div>
                      </div>
                      <button
                        className="btn-delete-schedule"
                        onClick={() => handleDeleteSchedule(s.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grid of Launcher Cards */}
      <div className="infra-hub-grid">
        {/* SPF Card */}
        <div className="infra-hub-card spf">
          <div>
            <div className="infra-hub-icon-wrapper">
              🛡️
            </div>
            <h3>SPF Record Auditor</h3>
            <p>
              Verify that server IPs are authorized in their PTR domains' SPF TXT records to prevent spoofing, resolve errors, and monitor domain security status.
            </p>
          </div>
          <Link href="/infrastructure/spf-check" className="infra-hub-btn">
            Open SPF Dashboard ➔
          </Link>
        </div>

        {/* rDNS Card */}
        <div className="infra-hub-card rdns">
          <div>
            <div className="infra-hub-icon-wrapper">
              🛰️
            </div>
            <h3>Reverse DNS (rDNS) Auditor</h3>
            <p>
              Run parallel PTR pointer checks and forward address validations in real-time to guarantee seamless delivery routing configurations across all servers.
            </p>
          </div>
          <Link href="/infrastructure/rdns-check" className="infra-hub-btn">
            Open rDNS Dashboard ➔
          </Link>
        </div>

        {/* VMTA Card */}
        <div className="infra-hub-card vmta">
          <div>
            <div className="infra-hub-icon-wrapper">
              ✉️
            </div>
            <h3>VMTA Mapping Sync</h3>
            <p>
              Synchronize virtual mail transfer agent mappings from test inbox delivery logs to track active configurations and pinpoint missing server VMTAs.
            </p>
          </div>
          <Link href="/infrastructure/vmta-check" className="infra-hub-btn">
            Open VMTA Dashboard ➔
          </Link>
        </div>
      </div>

      {/* Summary stats dashboard table */}
      <div className="infra-summary-section animate-fade-in">
        <div className="infra-summary-title">
          📊 Audit Statistics Summary
        </div>
        
        <div className="infra-summary-table-container">
          {!isLoaded ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              Loading team stats summary...
            </div>
          ) : statsList.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              No team servers loaded in database.
            </div>
          ) : (
            <table className="infra-summary-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Servers</th>
                  <th>Total IPs</th>
                  <th>SPF Checks</th>
                  <th>rDNS Checks</th>
                  <th>VMTA / DKIM</th>
                </tr>
              </thead>
              <tbody>
                {statsList.map(s => (
                  <tr key={s.teamName}>
                    <td className="team-badge-cell">👥 {s.teamName}</td>
                    <td><b>{s.totalServers}</b> srv</td>
                    <td><b>{s.totalIps}</b> ips</td>
                    
                    {/* SPF stats */}
                    <td>
                      <div className="stat-pill-group">
                        <span 
                          className="stat-pill ok" 
                          title="Click to copy OK SPF checks"
                          onClick={() => copySpfData(s.teamName, 'OK')}
                        >
                          ✓ {s.spfOk}
                        </span>
                        {s.spfFail > 0 ? (
                          <span 
                            className="stat-pill fail" 
                            title="Click to copy Failed SPF checks"
                            onClick={() => copySpfData(s.teamName, 'FAIL')}
                          >
                            ✗ {s.spfFail}
                          </span>
                        ) : null}
                        {s.spfPending > 0 ? (
                          <span 
                            className="stat-pill pending" 
                            title="Click to copy Pending SPF checks"
                            onClick={() => copySpfData(s.teamName, 'Pending')}
                          >
                            ⏳ {s.spfPending}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* rDNS stats */}
                    <td>
                      <div className="stat-pill-group">
                        <span 
                          className="stat-pill ok" 
                          title="Click to copy OK rDNS checks"
                          onClick={() => copyRdnsData(s.teamName, 'OK')}
                        >
                          ✓ {s.rdnsOk}
                        </span>
                        {s.rdnsFail > 0 ? (
                          <span 
                            className="stat-pill fail" 
                            title="Click to copy Failed rDNS checks"
                            onClick={() => copyRdnsData(s.teamName, 'FAIL')}
                          >
                            ✗ {s.rdnsFail}
                          </span>
                        ) : null}
                        {s.rdnsPending > 0 ? (
                          <span 
                            className="stat-pill pending" 
                            title="Click to copy Pending rDNS checks"
                            onClick={() => copyRdnsData(s.teamName, 'Pending')}
                          >
                            ⏳ {s.rdnsPending}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* VMTA stats */}
                    <td>
                      <div className="stat-pill-group">
                        <span 
                          className="stat-pill ok" 
                          title="Click to copy OK VMTA checks"
                          onClick={() => copyVmtaData(s.teamName, 'OK')}
                        >
                          ✓ {s.vmtaOk}
                        </span>
                        {s.vmtaFail > 0 ? (
                          <span 
                            className="stat-pill fail" 
                            title="Click to copy Failed VMTA checks"
                            onClick={() => copyVmtaData(s.teamName, 'FAIL')}
                          >
                            ✗ {s.vmtaFail}
                          </span>
                        ) : null}
                        {s.vmtaPending > 0 ? (
                          <span 
                            className="stat-pill pending" 
                            title="Click to copy Pending VMTA checks"
                            onClick={() => copyVmtaData(s.teamName, 'Pending')}
                          >
                            ⏳ {s.vmtaPending}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="toast-infra">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
