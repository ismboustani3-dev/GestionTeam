'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loadTeamsFromFirebase, saveTeamsToFirebase, loadIpStatusFromFirebase, saveIpStatusToFirebase } from '@/lib/firebaseTeams';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import './RdnsCheck.css';

interface RdnsRow {
  serverId: number;
  serverName: string;
  serverStatus?: string;
  ip: string;
  domain: string;
  ptrRecord: string;
  aRecord: string;
  status: 'OK' | 'FAIL' | 'Pending';
  date: string;
}

export default function RdnsCheckPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'fail' | 'pending'>('all');
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);
  const [totalToCheck, setTotalToCheck] = useState(0);

  // Schedule state
  const [schedules, setSchedules] = useState<any[]>([]);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleTime1, setNewScheduleTime1] = useState('08:00');
  const [newScheduleTime2, setNewScheduleTime2] = useState('');
  const [newScheduleTeam, setNewScheduleTeam] = useState('all');
  const [newScheduleFrequency, setNewScheduleFrequency] = useState<'time' | '1h' | '2h' | '6h' | '12h'>('time');
  const [newScheduleDays, setNewScheduleDays] = useState<number[]>([1,2,3,4,5,6,0]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Load schedules
  const loadSchedules = () => {
    fetch('/api/schedule')
      .then(r => r.json())
      .then(data => {
        if (data.schedules) setSchedules(data.schedules);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadSchedules();
  }, []);

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
      const name = newScheduleName || `Auto rDNS Check (Every ${interval}h)`;

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          name,
          type: 'rdns',
          cronExpression: cronExpr,
          teamName: newScheduleTeam
        })
      });
      const data = await res.json();
      if (data.schedules) setSchedules(data.schedules);
    } else {
      const [h1, m1] = newScheduleTime1.split(':');
      let cronExpr = `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`;
      const name = newScheduleName || `Auto rDNS Check ${newScheduleTime1}`;

      if (newScheduleTime2) {
        const [h2, m2] = newScheduleTime2.split(':');
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add',
            schedules: [
              { name: `${name} (1)`, type: 'rdns', cronExpression: `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`, teamName: newScheduleTeam },
              { name: `${name} (2)`, type: 'rdns', cronExpression: `${parseInt(m2)} ${parseInt(h2)} * * ${dayStr}`, teamName: newScheduleTeam }
            ]
          })
        });
        const data = await res.json();
        if (data.schedules) setSchedules(data.schedules);
      } else {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name, type: 'rdns', cronExpression: cronExpr, teamName: newScheduleTeam })
        });
        const data = await res.json();
        if (data.schedules) setSchedules(data.schedules);
      }
    }

    setNewScheduleName('');
    setNewScheduleTime1('08:00');
    setNewScheduleTime2('');
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

  // Load teams on mount
  useEffect(() => {
    const load = async () => {
      try {
        const data = await loadTeamsFromFirebase();
        if (data && data.length > 0) {
          setTeams(data);
          setActiveTeam(data[0].name || 'REDA');
        } else {
          setTeams([{ name: 'REDA', servers: [] }, { name: 'AMINE', servers: [] }]);
        }
      } catch (err) {
        console.error('Failed to load teams:', err);
      } finally {
        setIsLoaded(true);
      }
    };
    load();
  }, []);

  const triggerSave = async (updatedTeams: any[]) => {
    setTeams(updatedTeams);
    await saveTeamsToFirebase(updatedTeams);
    fetch('/api/cron-check', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teams: updatedTeams })
    }).catch(() => {});
  };

  const handleTeamChange = (name: string) => {
    setActiveTeam(name);
  };

  const rdnsRows = useMemo(() => {
    const activeTeamObj = teams.find(t => t.name === activeTeam);
    const dbServers = activeTeamObj?.servers?.filter((s: any) => s.status !== 'deleted') || [];
    
    const rows: RdnsRow[] = [];
    
    dbServers.forEach((server: any) => {
      const ipDomains = getUniqueIpDomains(server.ipDomains);
      
      if (ipDomains.length > 0) {
        ipDomains.forEach((d: any) => {
          if (!d.ip || !d.domain) return;
          
          const ptrQuery = (server.rdnsDetails || []).find((q: any) => q.type === 'PTR' && q.query === d.ip);
          const aQuery = (server.rdnsDetails || []).find((q: any) => q.type === 'A' && q.query === d.domain);
          
          let status: 'OK' | 'FAIL' | 'Pending' = 'Pending';
          if (ptrQuery && aQuery) {
            status = (ptrQuery.match === 'OK' && aQuery.match === 'OK') ? 'OK' : 'FAIL';
          }
          
          rows.push({
            serverId: server.id,
            serverName: server.serverName,
            serverStatus: server.status,
            ip: d.ip,
            domain: d.domain,
            ptrRecord: ptrQuery?.result || '—',
            aRecord: aQuery?.result || '—',
            status,
            date: server.rdnsDate || '—'
          });
        });
      } else if (server.mainIp) {
        const ptrQuery = (server.rdnsDetails || []).find((q: any) => q.type === 'PTR' && q.query === server.mainIp);
        let status: 'OK' | 'FAIL' | 'Pending' = 'Pending';
        if (ptrQuery) {
          status = ptrQuery.match === 'OK' ? 'OK' : 'FAIL';
        }
        
        rows.push({
          serverId: server.id,
          serverName: server.serverName,
          serverStatus: server.status,
          ip: server.mainIp,
          domain: 'No Domain Mapped',
          ptrRecord: ptrQuery?.result || '—',
          aRecord: '—',
          status,
          date: server.rdnsDate || '—'
        });
      }
    });

    return rows;
  }, [teams, activeTeam]);

  const filteredRows = useMemo(() => {
    let result = rdnsRows;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        r => r.serverName.toLowerCase().includes(q) || 
             r.ip.toLowerCase().includes(q) || 
             r.domain.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'ok') {
        result = result.filter(r => r.status === 'OK');
      } else if (statusFilter === 'fail') {
        result = result.filter(r => r.status === 'FAIL');
      } else if (statusFilter === 'pending') {
        result = result.filter(r => r.status === 'Pending');
      }
    }

    return result;
  }, [rdnsRows, searchQuery, statusFilter]);

  const handleCheckAllRdns = async () => {
    if (rdnsRows.length === 0) return;

    setIsChecking(true);
    setCheckProgress(0);
    setTotalToCheck(rdnsRows.length);

    try {
      const activeTeamObj = teams.find(t => t.name === activeTeam);
      const activeServers = activeTeamObj?.servers?.filter((s: any) => s.status !== 'deleted') || [];

      setCheckProgress(Math.floor(rdnsRows.length * 0.1));

      const response = await fetch('/api/rdns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: activeServers })
      });
      const data = await response.json();

      setCheckProgress(rdnsRows.length);

      if (data.results) {
        const todayStr = new Date().toLocaleString('en-US');
        const updatedTeams = teams.map(t => {
          if (t.name !== activeTeam) return t;
          return {
            ...t,
            servers: t.servers.map((s: any) => {
              const result = data.results.find((r: any) => r.serverId === s.id);
              if (result) {
                return {
                  ...s,
                  rdnsStatus: result.overallMatch ? 'OK' : 'FAIL',
                  rdnsDate: todayStr,
                  rdnsDetails: result.queries
                };
              }
              return s;
            })
          };
        });

        await triggerSave(updatedTeams);

        // Update IP Status tracker
        try {
          const ipHistory = await loadIpStatusFromFirebase() || {};
          const todayKey = new Date().toISOString().split('T')[0];
          let ipHistoryChanged = false;

          updatedTeams.forEach((team: any) => {
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

        // Build Telegram Alert for failures
        const failedItems = data.results.filter((r: any) => !r.overallMatch);
        let telegramMessage = '';
        const nowStr = new Date().toLocaleString('en-US');

        if (failedItems.length > 0) {
          telegramMessage = `🔍 <b>rDNS check Failures — Team ${activeTeam}</b>\nStatus: ⚠️ ISSUES DETECTED\n📅 ${nowStr}\n\n`;
          failedItems.forEach((f: any) => {
            const server = activeServers.find((s: any) => s.id === f.serverId);
            if (!server) return;
            const failedQueries = (f.queries || []).filter((q: any) => q.match !== 'OK');
            telegramMessage += `• <b>${server.serverName}</b>\n`;
            failedQueries.forEach((q: any) => {
              let ipText = '';
              if (q.type === 'A') {
                const ipDomain = (server.ipDomains || []).find((d: any) => d.domain === q.query);
                if (ipDomain) {
                  ipText = ` (<code>${ipDomain.ip}</code>)`;
                }
              }
              telegramMessage += `  ${q.type} Query: <code>${q.query}</code>${ipText}\n  Result: <code>${q.result}</code>\n`;
            });
            telegramMessage += `\n`;
          });
        } else {
          telegramMessage = `✅ <b>rDNS check PASSED — Team ${activeTeam}</b>\n📅 ${nowStr}\n\nAll reverse and forward records checked successfully validated! 🎉`;
        }

        fetch('/api/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: telegramMessage,
            chatId: '-1003727951074',
            threadId: 5
          })
        }).catch(err => console.error('Failed to send Telegram notice:', err));

        alert('rDNS check completed and results saved!');
      }
    } catch (err) {
      console.error(err);
      alert('Error occurred running rDNS check');
    } finally {
      setIsChecking(false);
    }
  };

  const handleCheckAllTeamsRdns = async () => {
    setIsChecking(true);
    setCheckProgress(0);
    
    let totalRowsCount = 0;
    teams.forEach(t => {
      const dbServers = t.servers?.filter((s: any) => s.status !== 'deleted') || [];
      dbServers.forEach((server: any) => {
        const ipDomains = getUniqueIpDomains(server.ipDomains);
        totalRowsCount += ipDomains.length > 0 ? ipDomains.length : (server.mainIp ? 1 : 0);
      });
    });

    setTotalToCheck(totalRowsCount);

    try {
      let resolvedCount = 0;
      const updatedTeams = await Promise.all(teams.map(async (team) => {
        const activeServers = team.servers?.filter((s: any) => s.status !== 'deleted') || [];
        if (activeServers.length === 0) return team;

        const response = await fetch('/api/rdns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servers: activeServers })
        });
        const data = await response.json();

        resolvedCount += activeServers.length;
        setCheckProgress(Math.min(resolvedCount, totalRowsCount));

        if (data.results) {
          const todayStr = new Date().toLocaleString('en-US');
          return {
            ...team,
            servers: team.servers.map((s: any) => {
              const result = data.results.find((r: any) => r.serverId === s.id);
              if (result) {
                return {
                  ...s,
                  rdnsStatus: result.overallMatch ? 'OK' : 'FAIL',
                  rdnsDate: todayStr,
                  rdnsDetails: result.queries
                };
              }
              return s;
            })
          };
        }
        return team;
      }));

      await triggerSave(updatedTeams);

      // Update IP Status tracker
      try {
        const ipHistory = await loadIpStatusFromFirebase() || {};
        const todayKey = new Date().toISOString().split('T')[0];
        let ipHistoryChanged = false;

        updatedTeams.forEach((team: any) => {
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

      // Build overall Telegram report
      let telegramMessage = '';
      const nowStr = new Date().toLocaleString('en-US');
      let totalFailed = 0;

      updatedTeams.forEach(team => {
        const failedServers = (team.servers || []).filter((s: any) => s.status !== 'deleted' && s.rdnsStatus === 'FAIL');
        if (failedServers.length > 0) {
          totalFailed += failedServers.length;
          if (!telegramMessage) {
            telegramMessage = `🔍 <b>rDNS check Failures — ALL TEAMS</b>\n📅 ${nowStr}\n\n`;
          }
          telegramMessage += `👥 <b>Team ${team.name}</b>\n`;
          failedServers.forEach((s: any) => {
            telegramMessage += `• Server: <b>${s.serverName}</b>\n`;
            const failedQueries = (s.rdnsDetails || []).filter((q: any) => q.match !== 'OK');
            failedQueries.forEach((q: any) => {
              let ipText = '';
              if (q.type === 'A') {
                const ipDomain = (s.ipDomains || []).find((d: any) => d.domain === q.query);
                if (ipDomain) {
                  ipText = ` (<code>${ipDomain.ip}</code>)`;
                }
              }
              telegramMessage += `  ${q.type}: <code>${q.query}</code>${ipText} ➔ <code>${q.result}</code>\n`;
            });
          });
          telegramMessage += `\n`;
        }
      });

      if (!telegramMessage) {
        telegramMessage = `✅ <b>rDNS Check PASSED — ALL TEAMS</b>\n📅 ${nowStr}\n\nAll server records successfully resolved!`;
      }

      fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: telegramMessage,
          chatId: '-1003727951074',
          threadId: 5
        })
      }).catch(err => console.error('Telegram notification error:', err));

      alert('All Teams rDNS check completed!');
    } catch (e) {
      console.error(e);
      alert('Error running checks for all teams.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleCopyFilteredResults = () => {
    if (filteredRows.length === 0) return;
    
    let header = 'Server Name\tIP Address\tMapped Domain\tPTR Record\tA Record\tCheck Date\tStatus\n';
    let body = filteredRows.map(r => 
      `${r.serverName}\t${r.ip}\t${r.domain}\t${r.ptrRecord}\t${r.aRecord}\t${r.date}\t${r.status}`
    ).join('\n');
    
    navigator.clipboard.writeText(header + body).then(() => {
      showToast(`Copied ${filteredRows.length} results to clipboard!`);
    }).catch(err => {
      console.error(err);
      alert('Failed to copy');
    });
  };

  const getTeamServerCount = (teamName: string) => {
    const t = teams.find(team => team.name === teamName);
    const dbServers = t?.servers?.filter((s: any) => s.status !== 'deleted') || [];
    let count = 0;
    dbServers.forEach((server: any) => {
      const ipDomains = getUniqueIpDomains(server.ipDomains);
      count += ipDomains.length > 0 ? ipDomains.length : (server.mainIp ? 1 : 0);
    });
    return count;
  };

  const getSchedulesCount = () => {
    return schedules.filter(s => s.type === 'rdns').length;
  };

  return (
    <div className="rdns-check-container animate-fade-in">
      {/* Header section */}
      <header className="rdns-check-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <Link href="/infrastructure" className="back-link-rdns">
              ⇠ Back
            </Link>
            <h1>rDNS Infrastructure Check</h1>
          </div>
          <p>Verify Reverse PTR mappings (IP ➔ Hostname) and Forward resolver mappings (Hostname ➔ IP) in real-time.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button 
            className={`btn-rdns-action secondary ${isScheduleOpen ? 'active' : ''}`}
            onClick={() => setIsScheduleOpen(!isScheduleOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            ⏰ Auto Schedule ({getSchedulesCount()})
          </button>
          <button 
            className="btn-rdns-action secondary-orange"
            onClick={handleCheckAllTeamsRdns}
            disabled={isChecking}
          >
            ⚡ Check All Teams
          </button>
          <button 
            className="btn-rdns-action primary"
            onClick={handleCheckAllRdns}
            disabled={isChecking}
          >
            🛡️ Run Check
          </button>
        </div>
      </header>

      {/* Inline Schedule Panel */}
      {isScheduleOpen && (
        <div className="animate-fade-in" style={{
          background: 'rgba(16, 185, 129, 0.04)',
          border: '1px solid rgba(16, 185, 129, 0.15)',
          borderRadius: '12px',
          padding: '1.2rem',
          marginBottom: '1.5rem',
        }}>
          <div className="schedules-grid">
            {/* New Schedule Form */}
            <div className="new-schedule-card">
              <p className="schedule-title">➕ New rDNS Schedule</p>
              <div className="schedule-inputs">
                <input
                  type="text"
                  placeholder="Schedule Name"
                  value={newScheduleName}
                  onChange={e => setNewScheduleName(e.target.value)}
                />
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
                  className="btn-rdns-action primary" 
                  style={{ background: '#10b981', padding: '0.7rem', gridColumn: '1 / -1', fontSize: '1.05rem', fontWeight: 600, border: 'none', justifyContent: 'center' }}
                  onClick={handleAddSchedule}
                >
                  Save Schedule
                </button>
              </div>
            </div>

            {/* Existing Schedules */}
            <div className="active-schedules-list">
              <p className="schedule-title" style={{ color: '#10b981' }}>📋 Active rDNS Schedules</p>
              {schedules.filter(s => s.type === 'rdns').length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '1rem', textAlign: 'center', padding: '1rem' }}>No rDNS schedules configured yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {schedules.filter(s => s.type === 'rdns').map(s => (
                    <div key={s.id} className={`schedule-item-row ${s.enabled ? 'enabled' : ''}`}>
                      <button
                        className={`toggle-switch-btn ${s.enabled ? 'active' : ''}`}
                        onClick={() => handleToggleSchedule(s.id, !s.enabled)}
                      >
                        <span className="toggle-switch-dot" />
                      </button>
                      <div className="schedule-info-pane">
                        <div className="schedule-info-name">{s.name}</div>
                        <div className="schedule-info-details">
                          {s.cronExpression} • Team: {s.teamName || 'all'}
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

      {/* Tabs Switcher */}
      <div className="rdns-tabs">
        {teams.map(t => (
          <button
            key={t.name}
            className={`rdns-tab ${activeTeam === t.name ? 'active' : ''}`}
            onClick={() => handleTeamChange(t.name)}
          >
            👥 {t.name}
            <span className="tab-count-badge">{getTeamServerCount(t.name)}</span>
          </button>
        ))}
      </div>

      {/* Progress Checking Panel */}
      {isChecking && (
        <div className="progress-checking-container">
          <div className="progress-checking-text">
            <span>AUDITING SERVER RDNS AND PTR RECORDS IN PROGRESS...</span>
            <span>{checkProgress} / {totalToCheck}</span>
          </div>
          <div className="progress-checking-bar">
            <div 
              className="progress-checking-fill" 
              style={{ width: `${(checkProgress / (totalToCheck || 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Filters Pane */}
      <div className="filters-actions-row">
        <div className="search-filters-pane">
          <input
            type="text"
            className="search"
            placeholder="Search by server, IP, or domain..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="filter-select-rdns"
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
          >
            <option value="all">🔍 All Statuses</option>
            <option value="ok">✅ OK</option>
            <option value="fail">❌ FAIL</option>
            <option value="pending">⏳ Pending</option>
          </select>
          <button
            className="btn-rdns-action secondary"
            onClick={handleCopyFilteredResults}
            disabled={filteredRows.length === 0}
            style={{ padding: '0.45rem 0.8rem', height: '38px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            📋 Copy Results ({filteredRows.length})
          </button>
        </div>
        
        <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>
          Showing {filteredRows.length} mappings
        </div>
      </div>

      {/* Results table */}
      <div className="rdns-table-container">
        {!isLoaded ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading teams server inventory...
          </div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No servers or domain mappings found matching your criteria.
          </div>
        ) : (
          <table className="rdns-table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Server Name</th>
                <th style={{ width: '160px' }}>IP Address</th>
                <th style={{ width: '220px' }}>Domain Name</th>
                <th>Resolved PTR (Reverse)</th>
                <th>Resolved A (Forward)</th>
                <th style={{ width: '180px' }}>Last Checked</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, index) => {
                const isFirstForServer = index === 0 || filteredRows[index - 1].serverId !== r.serverId;
                const isLastForServer = index === filteredRows.length - 1 || filteredRows[index + 1].serverId !== r.serverId;
                let rowSpan = 1;
                if (isFirstForServer) {
                  let nextIdx = index + 1;
                  while (nextIdx < filteredRows.length && filteredRows[nextIdx].serverId === r.serverId) {
                    rowSpan++;
                    nextIdx++;
                  }
                }

                return (
                  <tr 
                    key={`${r.serverId}-${r.ip}-${index}`}
                    className={isLastForServer ? 'server-group-end' : 'server-group-inner'}
                    style={r.serverStatus === 'tocancel' ? { background: 'rgba(249, 115, 22, 0.08)' } : undefined}
                  >
                    {isFirstForServer && (
                      <td className="server-cell" rowSpan={rowSpan}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ color: r.serverStatus === 'tocancel' ? '#f97316' : undefined, fontWeight: 600 }}>{r.serverName}</span>
                          {r.serverStatus === 'tocancel' && <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 'bold' }}>tocancel</span>}
                        </div>
                      </td>
                    )}
                    <td className="ip-cell">{r.ip}</td>
                    <td className="domain-cell">{r.domain}</td>
                    <td className="record-cell" title={r.ptrRecord}>{r.ptrRecord}</td>
                    <td className="record-cell" title={r.aRecord}>{r.aRecord}</td>
                    <td className="date-cell">{r.date}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`badge-rdns ${r.status.toLowerCase()}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Floating Status Toast */}
      {toastMessage && <div className="toast-rdns">{toastMessage}</div>}
    </div>
  );
}
