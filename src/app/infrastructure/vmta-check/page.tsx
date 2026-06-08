'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loadTeamsFromFirebase, saveTeamsToFirebase } from '@/lib/firebaseTeams';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import './VmtaCheck.css';

interface VmtaRow {
  serverId: number;
  serverName: string;
  serverStatus?: string;
  ip: string;
  domain: string;
  vmta: string;
  status: 'OK' | 'FAIL' | 'Pending';
  date: string;
}

export default function VmtaCheckPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'fail' | 'pending'>('all');
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [totalToSync, setTotalToSync] = useState(0);

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
      const name = newScheduleName || `Auto VMTA Sync (Every ${interval}h)`;

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          name,
          type: 'vmta',
          cronExpression: cronExpr,
          teamName: newScheduleTeam
        })
      });
      const data = await res.json();
      if (data.schedules) setSchedules(data.schedules);
    } else {
      const [h1, m1] = newScheduleTime1.split(':');
      let cronExpr = `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`;
      const name = newScheduleName || `Auto VMTA Sync ${newScheduleTime1}`;

      if (newScheduleTime2) {
        const [h2, m2] = newScheduleTime2.split(':');
        await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: `${name} (1)`, type: 'vmta', cronExpression: `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`, teamName: newScheduleTeam })
        });
        const res2 = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: `${name} (2)`, type: 'vmta', cronExpression: `${parseInt(m2)} ${parseInt(h2)} * * ${dayStr}`, teamName: newScheduleTeam })
        });
        const data = await res2.json();
        if (data.schedules) setSchedules(data.schedules);
      } else {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name, type: 'vmta', cronExpression: cronExpr, teamName: newScheduleTeam })
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

  const vmtaRows = useMemo(() => {
    const activeTeamObj = teams.find(t => t.name === activeTeam);
    const dbServers = activeTeamObj?.servers?.filter((s: any) => s.status !== 'deleted') || [];
    
    const rows: VmtaRow[] = [];
    
    dbServers.forEach((server: any) => {
      const ipDomains = getUniqueIpDomains(server.ipDomains);
      
      if (ipDomains.length > 0) {
        ipDomains.forEach((d: any) => {
          if (!d.ip || !d.domain) return;
          
          const vmta = server.vmtaDetails?.[d.ip];
          let status: 'OK' | 'FAIL' | 'Pending' = 'Pending';
          if (vmta !== undefined) {
            status = (vmta && vmta !== '-' && vmta !== '—') ? 'OK' : 'FAIL';
          }
          
          rows.push({
            serverId: server.id,
            serverName: server.serverName,
            serverStatus: server.status,
            ip: d.ip,
            domain: d.domain,
            vmta: vmta || '—',
            status,
            date: server.rdnsDate || '—'
          });
        });
      } else if (server.mainIp) {
        const vmta = server.vmtaDetails?.[server.mainIp];
        let status: 'OK' | 'FAIL' | 'Pending' = 'Pending';
        if (vmta !== undefined) {
          status = (vmta && vmta !== '-' && vmta !== '—') ? 'OK' : 'FAIL';
        }
        
        rows.push({
          serverId: server.id,
          serverName: server.serverName,
          serverStatus: server.status,
          ip: server.mainIp,
          domain: 'No Domain Mapped',
          vmta: vmta || '—',
          status,
          date: server.rdnsDate || '—'
        });
      }
    });

    return rows;
  }, [teams, activeTeam]);

  const filteredRows = useMemo(() => {
    let result = vmtaRows;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        r => r.serverName.toLowerCase().includes(q) || 
             r.ip.toLowerCase().includes(q) || 
             r.domain.toLowerCase().includes(q) ||
             r.vmta.toLowerCase().includes(q)
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
  }, [vmtaRows, searchQuery, statusFilter]);

  const handleSyncVmta = async () => {
    if (vmtaRows.length === 0) return;

    setIsSyncing(true);
    setSyncProgress(0);
    setTotalToSync(vmtaRows.length);

    try {
      const activeTeamObj = teams.find(t => t.name === activeTeam);
      const activeServers = activeTeamObj?.servers?.filter((s: any) => s.status !== 'deleted') || [];

      setSyncProgress(Math.floor(vmtaRows.length * 0.1));

      const response = await fetch('/api/vmta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: activeServers })
      });
      const data = await response.json();

      setSyncProgress(vmtaRows.length);

      if (data.mapping) {
        const todayStr = new Date().toLocaleString('en-US');
        const changedAlerts: string[] = [];
        const emptyAlerts: string[] = [];

        const updatedTeams = teams.map(t => {
          if (t.name !== activeTeam) return t;
          return {
            ...t,
            servers: t.servers.map((s: any) => {
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
                return {
                  ...s,
                  vmtaDetails: newVmtaDetails,
                  rdnsDate: todayStr
                };
              }
              return s;
            })
          };
        });

        await triggerSave(updatedTeams);

        // Build Telegram report
        let telegramMsg = `📥 <b>VMTA SYNC REPORT - Team ${activeTeam}</b>\n📅 ${todayStr}\n\n`;
        let sentReport = false;

        if (changedAlerts.length > 0) {
          telegramMsg += `<b>⚠️ CHANGED VMTAs:</b>\n${changedAlerts.join('\n')}\n\n`;
          sentReport = true;
        }

        if (emptyAlerts.length > 0) {
          telegramMsg += `<b>❌ MISSING VMTAs (Empty):</b>\n${emptyAlerts.join('\n')}\n`;
          sentReport = true;
        }

        if (!sentReport) {
          telegramMsg += `✅ All VMTAs are synced and matching successfully!`;
        }

        fetch('/api/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: telegramMsg,
            chatId: '-1003727951074',
            threadId: 9
          })
        }).catch(err => console.error('Telegram notification error:', err));

        alert('VMTA Sync complete!');
      }
    } catch (err) {
      console.error(err);
      alert('Error occurred syncing VMTA');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncAllTeamsVmta = async () => {
    setIsSyncing(true);
    setSyncProgress(0);

    let totalRowsCount = 0;
    teams.forEach(t => {
      const dbServers = t.servers?.filter((s: any) => s.status !== 'deleted') || [];
      dbServers.forEach((server: any) => {
        const ipDomains = getUniqueIpDomains(server.ipDomains);
        totalRowsCount += ipDomains.length > 0 ? ipDomains.length : (server.mainIp ? 1 : 0);
      });
    });

    setTotalToSync(totalRowsCount);

    try {
      let resolvedCount = 0;
      const allTeamReports: string[] = [];
      const nowStr = new Date().toLocaleString('en-US');

      const updatedTeams = await Promise.all(teams.map(async (team) => {
        const activeServers = team.servers?.filter((s: any) => s.status !== 'deleted') || [];
        if (activeServers.length === 0) return team;

        const response = await fetch('/api/vmta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servers: activeServers })
        });
        const data = await response.json();

        resolvedCount += activeServers.length;
        setSyncProgress(Math.min(resolvedCount, totalRowsCount));

        if (data.mapping) {
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
              return {
                ...s,
                vmtaDetails: newVmtaDetails,
                rdnsDate: nowStr
              };
            }
            return s;
          });

          let teamMsg = `👥 <b>Team ${team.name}</b>\n`;
          let reportContent = false;

          if (changedAlerts.length > 0) {
            teamMsg += `<b>⚠️ CHANGED VMTAs:</b>\n${changedAlerts.join('\n')}\n\n`;
            reportContent = true;
          }
          if (emptyAlerts.length > 0) {
            teamMsg += `<b>❌ MISSING VMTAs:</b>\n${emptyAlerts.join('\n')}\n`;
            reportContent = true;
          }

          if (!reportContent) {
            teamMsg += `✅ All VMTAs OK!\n`;
          }

          allTeamReports.push(teamMsg);

          return { ...team, servers: updatedServers };
        }
        return team;
      }));

      await triggerSave(updatedTeams);

      // Send telegram notifications
      let finalMsg = `📥 <b>VMTA SYNC - ALL TEAMS</b>\n📅 ${nowStr}\n${'━'.repeat(25)}\n\n`;
      finalMsg += allTeamReports.join('\n');

      fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: finalMsg,
          chatId: '-1003727951074',
          threadId: 9
        })
      }).catch(err => console.error('Telegram notification error:', err));

      alert('All Teams VMTA Sync complete!');
    } catch (e) {
      console.error(e);
      alert('Error running checks for all teams.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyFilteredResults = () => {
    if (filteredRows.length === 0) return;
    
    let header = 'Server Name\tIP Address\tMapped Domain\tVMTA Name\tCheck Date\tStatus\n';
    let body = filteredRows.map(r => 
      `${r.serverName}\t${r.ip}\t${r.domain}\t${r.vmta}\t${r.date}\t${r.status}`
    ).join('\n');
    
    navigator.clipboard.writeText(header + body).then(() => {
      showToast(`Copied ${filteredRows.length} results to clipboard!`);
    }).catch(err => {
      console.error(err);
      alert('Failed to copy');
    });
  };

  const handleCopyMissingVmtaIps = () => {
    const missingIps: string[] = [];
    vmtaRows.forEach(r => {
      if (!r.vmta || r.vmta === '—' || r.vmta === '-') {
        missingIps.push(r.ip);
      }
    });

    if (missingIps.length === 0) {
      alert('All VMs have a valid VMTA assigned!');
      return;
    }

    navigator.clipboard.writeText(missingIps.join('\n')).then(() => {
      showToast(`Copied ${missingIps.length} missing VMTA IPs!`);
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
    return schedules.filter(s => s.type === 'vmta').length;
  };

  return (
    <div className="vmta-check-container animate-fade-in">
      {/* Header section */}
      <header className="vmta-check-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <Link href="/infrastructure" className="back-link-vmta">
              ⇠ Back
            </Link>
            <h1>VMTA Sync Auditing</h1>
          </div>
          <p>Sync virtual mail transfer agent mappings (VMTA) from target email configurations in real-time.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button 
            className={`btn-vmta-action secondary ${isScheduleOpen ? 'active' : ''}`}
            onClick={() => setIsScheduleOpen(!isScheduleOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            ⏰ Auto Schedule ({getSchedulesCount()})
          </button>
          <button 
            className="btn-vmta-action secondary-orange"
            onClick={handleSyncAllTeamsVmta}
            disabled={isSyncing}
          >
            ⚡ Sync All Teams
          </button>
          <button 
            className="btn-vmta-action primary"
            onClick={handleSyncVmta}
            disabled={isSyncing}
          >
            🔄 Sync VMTAs
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
              <p className="schedule-title">➕ New VMTA Schedule</p>
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
                  className="btn-vmta-action primary" 
                  style={{ background: '#10b981', padding: '0.7rem', gridColumn: '1 / -1', fontSize: '1.05rem', fontWeight: 600, border: 'none', justifyContent: 'center' }}
                  onClick={handleAddSchedule}
                >
                  Save Schedule
                </button>
              </div>
            </div>

            {/* Existing Schedules */}
            <div className="active-schedules-list">
              <p className="schedule-title" style={{ color: '#10b981' }}>📋 Active VMTA Schedules</p>
              {schedules.filter(s => s.type === 'vmta').length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '1rem', textAlign: 'center', padding: '1rem' }}>No VMTA schedules configured yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {schedules.filter(s => s.type === 'vmta').map(s => (
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
      <div className="vmta-tabs">
        {teams.map(t => (
          <button
            key={t.name}
            className={`vmta-tab ${activeTeam === t.name ? 'active' : ''}`}
            onClick={() => handleTeamChange(t.name)}
          >
            👥 {t.name}
            <span className="tab-count-badge">{getTeamServerCount(t.name)}</span>
          </button>
        ))}
      </div>

      {/* Progress Sync Panel */}
      {isSyncing && (
        <div className="progress-checking-container">
          <div className="progress-checking-text">
            <span>SYNCING VMTA MAPPINGS FROM GMAIL LOGS IN PROGRESS...</span>
            <span>{syncProgress} / {totalToSync}</span>
          </div>
          <div className="progress-checking-bar">
            <div 
              className="progress-checking-fill" 
              style={{ width: `${(syncProgress / (totalToSync || 1)) * 100}%` }}
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
            placeholder="Search by server, IP, domain, or VMTA..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="filter-select-vmta"
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
          >
            <option value="all">🔍 All Statuses</option>
            <option value="ok">✅ OK (VMTA Present)</option>
            <option value="fail">❌ FAIL (VMTA Missing)</option>
            <option value="pending">⏳ Pending</option>
          </select>
          <button
            className="btn-vmta-action secondary"
            onClick={handleCopyFilteredResults}
            disabled={filteredRows.length === 0}
            style={{ padding: '0.45rem 0.8rem', height: '38px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            📋 Copy Results ({filteredRows.length})
          </button>
          <button
            className="btn-vmta-action secondary-red"
            onClick={handleCopyMissingVmtaIps}
            style={{ padding: '0.45rem 0.8rem', height: '38px', display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}
          >
            ⚠️ Copy Missing IPs
          </button>
        </div>
        
        <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>
          Showing {filteredRows.length} mappings
        </div>
      </div>

      {/* Results table */}
      <div className="vmta-table-container">
        {!isLoaded ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading teams server inventory...
          </div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No servers or VMTA mappings found matching your criteria.
          </div>
        ) : (
          <table className="vmta-table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Server Name</th>
                <th style={{ width: '160px' }}>IP Address</th>
                <th style={{ width: '220px' }}>Domain Name</th>
                <th>Synced VMTA Mapping</th>
                <th style={{ width: '180px' }}>Last Synced</th>
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
                    <td className="vmta-val-cell" style={{ fontFamily: 'monospace', color: r.vmta === '—' || r.vmta === '-' ? '#ef4444' : '#e2e8f0', fontWeight: r.vmta === '—' || r.vmta === '-' ? 400 : 600 }} title={r.vmta}>{r.vmta}</td>
                    <td className="date-cell">{r.date}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`badge-vmta ${r.status.toLowerCase()}`}>
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
      {toastMessage && <div className="toast-vmta">{toastMessage}</div>}
    </div>
  );
}
