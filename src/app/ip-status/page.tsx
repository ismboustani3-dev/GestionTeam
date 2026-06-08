'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import './IpStatus.css';
import { loadTeamsFromFirebase, loadIpStatusFromFirebase, saveIpStatusToFirebase, loadBlacklistResultsFromFirebase } from '@/lib/firebaseTeams';

const parseRdnsDate = (dateStr: string): string | null => {
  if (!dateStr || dateStr === '—') return null;
  
  // Try standard parsing first
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Custom parsing fallback if format is standard US locale "M/D/YYYY, H:MM:SS AM/PM"
  const datePart = dateStr.split(',')[0].trim();
  const parts = datePart.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    if (year.length === 4 && !isNaN(Number(year))) {
      return `${year}-${month}-${day}`;
    }
  }
  return null;
};

const syncRdnsToIpStatus = (fbTeams: any[], currentHistory: Record<string, Record<string, string>>) => {
  let updatedHistory = { ...currentHistory };
  let hasChanges = false;

  fbTeams.forEach((team: any) => {
    const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
    activeServers.forEach((server: any) => {
      if (!server.rdnsDetails || server.rdnsDetails.length === 0 || !server.rdnsDate) return;

      // Parse the rdnsDate to YYYY-MM-DD format
      const dateKey = parseRdnsDate(server.rdnsDate);
      if (!dateKey) return;

      const ipDomains = getUniqueIpDomains(server.ipDomains);
      if (ipDomains.length > 0) {
        ipDomains.forEach((mapping: any) => {
          const ip = mapping.ip;
          const domain = mapping.domain;
          if (!ip || !domain) return;

          const ptrQ = (server.rdnsDetails || []).find((q: any) => q.type === 'PTR' && q.query === ip);
          const aQ = (server.rdnsDetails || []).find((q: any) => q.type === 'A' && q.query === domain);

          if (!ptrQ) return; // No check details for this query yet

          const isOk = ptrQ.match === 'OK' && aQ?.match === 'OK';
          
          if (!updatedHistory[ip]) updatedHistory[ip] = {};
          const currentStatus = updatedHistory[ip][dateKey];

          if (isOk) {
            // If the check was successful (OK)
            // We only set it to 'RDNS' if it is empty/undefined or 'RDNS Not Active'
            if (!currentStatus || currentStatus === 'RDNS Not Active') {
              updatedHistory[ip][dateKey] = 'RDNS';
              hasChanges = true;
            }
          } else {
            // If the check failed
            // Overwrite with 'RDNS Not Active' unless it is a critical override status
            const protectStatuses = ['Change DOM', 'DOWN', 'BOUNCE', 'TO', 'PAUSED'];
            if (!currentStatus || (!protectStatuses.includes(currentStatus) && currentStatus !== 'RDNS Not Active')) {
              updatedHistory[ip][dateKey] = 'RDNS Not Active';
              hasChanges = true;
            }
          }
        });
      } else if (server.mainIp) {
        const ip = server.mainIp;
        const ptrQ = (server.rdnsDetails || []).find((q: any) => q.type === 'PTR' && q.query === ip);

        if (!ptrQ) return; // No check details for this query yet

        const isOk = ptrQ.match === 'OK';

        if (!updatedHistory[ip]) updatedHistory[ip] = {};
        const currentStatus = updatedHistory[ip][dateKey];

        if (isOk) {
          if (!currentStatus || currentStatus === 'RDNS Not Active') {
            updatedHistory[ip][dateKey] = 'RDNS';
            hasChanges = true;
          }
        } else {
          const protectStatuses = ['Change DOM', 'DOWN', 'BOUNCE', 'TO', 'PAUSED'];
          if (!currentStatus || (!protectStatuses.includes(currentStatus) && currentStatus !== 'RDNS Not Active')) {
            updatedHistory[ip][dateKey] = 'RDNS Not Active';
            hasChanges = true;
          }
        }
      }
    });
  });

  return { updatedHistory, hasChanges };
};

const STATUS_TYPES = [
  { id: 'RDNS', class: 'bg-rdns', label: 'RDNS' },
  { id: 'RP TEST', class: 'bg-rp-test', label: 'RP TEST' },
  { id: 'SPAM', class: 'bg-spam', label: 'SPAM' },
  { id: 'PAUSED', class: 'bg-paused', label: 'PAUSED' },
  { id: 'Change DOM', class: 'bg-change-dom', label: 'Change DOM' },
  { id: 'RDNS Not Active', class: 'bg-rdns-not-active', label: 'RDNS Not Active' },
  { id: 'BOUNCE', class: 'bg-bounce', label: 'BOUNCE' },
  { id: 'TO', class: 'bg-to', label: 'TO' },
  { id: 'DOWN', class: 'bg-down', label: 'DOWN' },
];

export default function IpStatusPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [ipStatus, setIpStatus] = useState<Record<string, Record<string, string>>>({});
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Manual Pause state
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [pauseIpsText, setPauseIpsText] = useState('');
  const [blacklistResults, setBlacklistResults] = useState<Record<string, any>>({});
  
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [dateRange, setDateRange] = useState<number>(7);
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [selectedHeaderDate, setSelectedHeaderDate] = useState<string | null>(null);

  const [imapEmail, setImapEmail] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [inboxLabel, setInboxLabel] = useState('RP TEST');
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Schedule state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newScheduleType, setNewScheduleType] = useState<'imap_sync' | 'ip_status_report'>('imap_sync');
  const [newScheduleTime, setNewScheduleTime] = useState('08:00');
  const [newScheduleDays, setNewScheduleDays] = useState([1, 2, 3, 4, 5, 6, 0]);
  const [newScheduleTeam, setNewScheduleTeam] = useState('all');
  const [newScheduleLabel, setNewScheduleLabel] = useState('RP TEST');
  const [schedules, setSchedules] = useState<any[]>([]);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<{ ip: string, date: string } | null>(null);

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
    const fetchData = async () => {
      const fbTeams = await loadTeamsFromFirebase() || [];
      if (fbTeams.length > 0) setTeams(fbTeams);
      
      const history = await loadIpStatusFromFirebase() || {};
      
      const { updatedHistory, hasChanges } = syncRdnsToIpStatus(fbTeams, history);
      if (hasChanges) {
        setIpStatus(updatedHistory);
        await saveIpStatusToFirebase(updatedHistory);
      } else {
        setIpStatus(history);
      }

      const blResults = await loadBlacklistResultsFromFirebase();
      if (blResults) setBlacklistResults(blResults);

      const savedEmail = window.localStorage.getItem('gestiq_imap_email');
      const savedPassword = window.localStorage.getItem('gestiq_imap_password');
      if (savedEmail) setImapEmail(savedEmail);
      if (savedPassword) setImapPassword(savedPassword);
    };
    fetchData();
    loadSchedules();
  }, []);

  const handleSendIpReport = async () => {
    try {
      await fetch('/api/cron-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ip_status_report' })
      });
      showToast('✅ IP Status Report sent to Telegram!');
    } catch (e) {
      showToast('Error sending report');
    }
  };

  const handleScheduleIpReport = async () => {
    const time = prompt('Enter report time (HH:MM):', '08:00');
    if (!time) return;
    const [h, m] = time.split(':');
    if (!h || !m) {
      showToast('Invalid time');
      return;
    }
    const cronExpression = `${parseInt(m)} ${parseInt(h)} * * *`;
    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          name: `IP Status Report (${time})`,
          type: 'ip_status_report',
          cronExpression,
          teamName: 'all'
        })
      });
      showToast(`✅ IP Status Report scheduled every day at ${time}!`);
      loadSchedules();
    } catch (e) {
      showToast('Failed to schedule report');
    }
  };

  const handleDeclarePaused = async () => {
    if (!pauseIpsText.trim()) {
      showToast('Please enter at least one IP address.');
      return;
    }

    const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
    const matchedIps = pauseIpsText.match(ipRegex) || [];
    
    if (matchedIps.length === 0) {
      showToast('No valid IP addresses found.');
      return;
    }

    let updatedStatus = { ...ipStatus };

    matchedIps.forEach(ip => {
      if (!updatedStatus[ip]) {
        updatedStatus[ip] = {};
      }
      updatedStatus[ip][today] = 'PAUSED';
    });

    setIpStatus(updatedStatus);
    await saveIpStatusToFirebase(updatedStatus);
    showToast(`Successfully set ${matchedIps.length} IPs to PAUSED for today (${today})!`);
    setPauseIpsText('');
    setShowPauseForm(false);
  };

  // Generate visible days based on range and end date
  const visibleDays = useMemo(() => {
    const days = [];
    const end = new Date(endDate);
    for (let i = 0; i < dateRange; i++) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const displayStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      days.push({ id: dayStr, display: displayStr });
    }
    return days;
  }, [dateRange, endDate]);

  // Reset selectedHeaderDate if it is no longer in the visible days range
  useEffect(() => {
    if (selectedHeaderDate && !visibleDays.some(day => day.id === selectedHeaderDate)) {
      setSelectedHeaderDate(null);
    }
  }, [visibleDays, selectedHeaderDate]);

  // Clean up filters for dates that are no longer visible
  useEffect(() => {
    const visibleSet = new Set(visibleDays.map(day => day.id));
    let cleaned = false;
    const updated = { ...activeFilters };
    Object.keys(updated).forEach(date => {
      if (!visibleSet.has(date)) {
        delete updated[date];
        cleaned = true;
      }
    });
    if (cleaned) {
      setActiveFilters(updated);
    }
  }, [visibleDays]);

  // Extract IPs and apply filters
  const rows = useMemo(() => {
    let result: any[] = [];
    teams.forEach(team => {
      if (selectedTeam !== 'all' && team.name !== selectedTeam) return;
      const servers = team.servers || [];
      servers.forEach((s: any) => {
        if (s.status === 'deleted') return;
        const ips = getUniqueIpDomains(s.ipDomains);
        ips.forEach((ipObj: any) => {
          if (!ipObj.ip) return;
          result.push({
            teamName: team.name,
            serverName: s.serverName,
            serverStatus: s.status,
            ip: ipObj.ip
          });
        });
      });
    });

    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      result = result.filter(r => 
        r.serverName.toLowerCase().includes(lower) || 
        r.ip.toLowerCase().includes(lower)
      );
    }
    
    // Apply active filters for each configured date
    const filterKeys = Object.keys(activeFilters).filter(date => activeFilters[date]);
    if (filterKeys.length > 0) {
      result = result.filter(r => {
        const data = ipStatus[r.ip];
        return filterKeys.every(date => {
          const filterStatus = activeFilters[date];
          if (filterStatus === 'EMPTY') {
            return !data || !data[date];
          }
          return data && data[date] === filterStatus;
        });
      });
    }

    return result;
  }, [teams, selectedTeam, searchQuery, activeFilters, visibleDays, ipStatus]);

  const handleSync = async () => {
    if (!imapEmail || !imapPassword) {
      showToast("Please enter email and app password");
      return;
    }
    
    // Save credentials to local storage for next time
    window.localStorage.setItem('gestiq_imap_email', imapEmail);
    window.localStorage.setItem('gestiq_imap_password', imapPassword);

    setIsSyncing(true);
    try {
      const res = await fetch('/api/imap-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: imapEmail, password: imapPassword, inboxLabel })
      });
      const data = await res.json();
      
      if (data.success && data.results) {
        const today = new Date().toISOString().split('T')[0];
        let updatedStatus = { ...ipStatus };
        
        // Gather active IPs of the selected team(s)
        const allActiveIps = new Set<string>();
        const targetTeams = (selectedTeam === 'all') ? teams : teams.filter(t => t.name === selectedTeam);
        targetTeams.forEach(team => {
          const servers = team.servers || [];
          servers.forEach((s: any) => {
            if (s.status === 'deleted') return;
            const ips = getUniqueIpDomains(s.ipDomains);
            ips.forEach((ipObj: any) => {
              if (ipObj.ip) allActiveIps.add(ipObj.ip);
            });
            if (s.mainIp) allActiveIps.add(s.mainIp);
          });
        });

        const protectStatuses = ['Change DOM', 'RDNS Not Active', 'DOWN', 'BOUNCE', 'TO', 'PAUSED'];

        allActiveIps.forEach(ip => {
          if (!updatedStatus[ip]) updatedStatus[ip] = {};
          const currentVal = updatedStatus[ip][today];
          
          if (data.results[ip]) {
            if (!protectStatuses.includes(currentVal)) {
              updatedStatus[ip][today] = data.results[ip]; // SPAM or RP TEST / RDNS
            }
          } else {
            // Not found in IMAP -> clear/set to empty if not protected
            if (currentVal && !protectStatuses.includes(currentVal)) {
              delete updatedStatus[ip][today];
            }
          }
        });
        
        setIpStatus(updatedStatus);
        await saveIpStatusToFirebase(updatedStatus);
        showToast(`Sync complete! Found ${Object.keys(data.results).length} IP records.`);
      } else {
        showToast(data.error || "Failed to sync from IMAP");
      }
    } catch (e: any) {
      showToast("Error: " + e.message);
    }
    setIsSyncing(false);
  };

  const handleAddSchedule = async () => {
    const [hour, min] = newScheduleTime.split(':');
    const daysStr = newScheduleDays.length === 7 ? '*' : newScheduleDays.join(',');
    const cronExpression = `${min} ${hour} * * ${daysStr}`;

    if (newScheduleType === 'ip_status_report') {
      try {
        await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add',
            name: `IP Status Report (${newScheduleTime})`,
            type: 'ip_status_report',
            cronExpression,
            teamName: 'all'
          })
        });
        showToast('✅ IP Status Report scheduled!');
        loadSchedules();
      } catch (e) {
        showToast('Failed to schedule report');
      }
      return;
    }

    // IMAP Sync
    if (!imapEmail || !imapPassword) {
      showToast('Please enter email and app password first before scheduling.');
      return;
    }

    try {
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          name: `IMAP Sync: ${imapEmail} (${newScheduleLabel})`,
          type: 'imap_sync',
          cronExpression,
          teamName: newScheduleTeam,
          imapEmail: imapEmail,
          imapPassword: imapPassword,
          inboxLabel: newScheduleLabel
        })
      });
      
      // Save credentials locally as well just in case
      window.localStorage.setItem('gestiq_imap_email', imapEmail);
      window.localStorage.setItem('gestiq_imap_password', imapPassword);

      showToast('Auto Sync Scheduled successfully!');
      loadSchedules();
    } catch (e) {
      console.error(e);
      showToast('Failed to add schedule');
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

  const handleCellClick = (ip: string, date: string) => {
    setModalTarget({ ip, date });
    setModalOpen(true);
  };

  const handleStatusFilterClick = (statusId: string) => {
    const focusDate = selectedHeaderDate || endDate;
    setActiveFilters(prev => {
      const updated = { ...prev };
      if (updated[focusDate] === statusId) {
        delete updated[focusDate];
      } else {
        updated[focusDate] = statusId;
      }
      return updated;
    });
  };

  const handleCopyIps = () => {
    if (rows.length === 0) {
      return;
    }
    const ips = rows.map(r => r.ip).join('\n');
    navigator.clipboard.writeText(ips);
  };

  const copyServerName = (serverName: string) => {
    navigator.clipboard.writeText(serverName);
  };

  const copyServerIps = (serverName: string) => {
    const serverRows = rows.filter(r => r.serverName === serverName);
    const ips = serverRows.map(r => r.ip).join('\n');
    navigator.clipboard.writeText(ips);
  };

  const updateStatus = async (statusId: string) => {
    if (!modalTarget) return;
    const { ip, date } = modalTarget;
    
    let updated = { ...ipStatus };
    if (!updated[ip]) updated[ip] = {};
    updated[ip][date] = statusId;
    
    setIpStatus(updated);
    setModalOpen(false);
    
    // Save to Firebase
    await saveIpStatusToFirebase(updated);
  };

  // Calculate top totals
  const totalsByDay: Record<string, Record<string, number>> = {};
  visibleDays.forEach(day => {
    totalsByDay[day.id] = {
      'RP TEST': 0, 'SPAM': 0, 'PAUSED': 0, 'Change DOM': 0, 'RDNS': 0, 'RDNS Not Active': 0, 'DOWN': 0, 'BOUNCE': 0, 'TO': 0, 'EMPTY': 0
    };
    rows.forEach(r => {
      const data = ipStatus ? ipStatus[r.ip] : null;
      if (data && data[day.id]) {
        const st = data[day.id];
        if (totalsByDay[day.id][st] !== undefined) {
          totalsByDay[day.id][st]++;
        }
      } else {
        totalsByDay[day.id]['EMPTY']++;
      }
    });
  });

  const allIpSchedules = schedules.filter(s => s.type === 'imap_sync' || s.type === 'ip_status_report');

  return (
    <div className="ip-status-container">
      <div className="ip-status-header">
        <h1>🌐 IP Status Tracker</h1>
        
        <div className="imap-sync-panel">
          <span style={{ fontSize: '1.5rem' }}>📧</span>
          <input 
            type="email" 
            placeholder="IMAP Email (e.g., alert@domain.com)" 
            value={imapEmail}
            onChange={e => setImapEmail(e.target.value)}
            style={{ width: '290px' }}
          />
          <input 
            type="password" 
            placeholder="App Password" 
            value={imapPassword}
            onChange={e => setImapPassword(e.target.value)}
            style={{ width: '200px' }}
          />
          <select
            value={inboxLabel}
            onChange={e => setInboxLabel(e.target.value)}
          >
            <option value="RP TEST">Inbox = RP TEST</option>
            <option value="RDNS">Inbox = RDNS</option>
          </select>
          <button 
            className="sync-btn" 
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button 
            className="sync-btn" 
            style={{ background: '#10b981' }}
            onClick={() => {
              setShowScheduleForm(!showScheduleForm);
              setShowPauseForm(false);
            }}
          >
            🕒 {showScheduleForm ? 'Close' : 'Auto'}
          </button>
          <button 
            className="sync-btn" 
            style={{ background: '#3b82f6' }}
            onClick={() => {
              setShowPauseForm(!showPauseForm);
              setShowScheduleForm(false);
            }}
          >
            ⏸️ {showPauseForm ? 'Close' : 'Pause IPs'}
          </button>
          <button
            className="sync-btn"
            style={{ background: '#f59e0b' }}
            onClick={handleSendIpReport}
            title="Send IP Status Report to Telegram now"
          >
            📊 Send Report
          </button>
          <button
            className="sync-btn"
            style={{ background: '#6366f1' }}
            onClick={handleScheduleIpReport}
            title="Schedule automatic IP Status Report"
          >
            ⏰ Schedule Report
          </button>
          <Link href="/ip-status-reports" style={{ textDecoration: 'none' }}>
            <button className="sync-btn" style={{ background: '#8b5cf6' }}>
              📊 Reports
            </button>
          </Link>
        </div>
      </div>

      {showScheduleForm && (
        <div className="schedules-grid">
          {/* New Schedule Card */}
          <div className="schedule-card" style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem', height: 'fit-content' }}>
            <h3 style={{ color: '#10b981', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🤖</span> Auto Schedule
            </h3>

            {/* Type selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Schedule Type:</label>
              <select
                value={newScheduleType}
                onChange={e => setNewScheduleType(e.target.value as any)}
                style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem', borderRadius: '8px', color: '#fff', width: '100%' }}
              >
                <option value="imap_sync">📧 IMAP Sync</option>
                <option value="ip_status_report">📊 IP Status Report</option>
              </select>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Time:</label>
                <input 
                  type="time" 
                  value={newScheduleTime}
                  onChange={e => setNewScheduleTime(e.target.value)}
                  style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem', borderRadius: '8px', color: '#fff', width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Team:</label>
                <select 
                  value={newScheduleTeam} 
                  onChange={e => setNewScheduleTeam(e.target.value)}
                  style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem', borderRadius: '8px', color: '#fff', width: '100%' }}
                >
                  <option value="all">All Teams</option>
                  {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            </div>

            {/* IMAP-specific fields — only shown for imap_sync */}
            {newScheduleType === 'imap_sync' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Apply Status:</label>
                <select 
                  value={newScheduleLabel} 
                  onChange={e => setNewScheduleLabel(e.target.value)}
                  style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem', borderRadius: '8px', color: '#fff', width: '100%' }}
                >
                  <option value="RP TEST">RP TEST</option>
                  <option value="RDNS">RDNS</option>
                </select>
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Days of Week:</label>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', margin: '0.2rem 0' }}>
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
            </div>

            <button 
              className="execute-btn"
              onClick={handleAddSchedule}
              style={{ width: '100%', padding: '1rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}
            >
              Save Schedule
            </button>
            <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0, textAlign: 'center', lineHeight: '1.3' }}>
              * Automatically connects to IMAP email, syncs status, and alerts Telegram.
            </p>
          </div>

          {/* Active Schedules Card */}
          <div className="schedule-card" style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ color: '#38bdf8', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🕒</span> Active Schedules ({allIpSchedules.length})
            </h3>
            
            {allIpSchedules.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', padding: '3.5rem 2rem' }}>
                No active schedules configured. Use the form on the left to add one.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '315px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '0.5rem', color: '#94a3b8' }}>Email</th>
                      <th style={{ padding: '0.5rem', color: '#94a3b8' }}>Label</th>
                      <th style={{ padding: '0.5rem', color: '#94a3b8' }}>Team</th>
                      <th style={{ padding: '0.5rem', color: '#94a3b8' }}>Time Details</th>
                      <th style={{ padding: '0.5rem', color: '#94a3b8', textAlign: 'center' }}>Active</th>
                      <th style={{ padding: '0.5rem', color: '#94a3b8', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allIpSchedules.map((s: any) => {
                      const isImap = s.type === 'imap_sync';
                      let displayName = s.name;
                      if (isImap) {
                        displayName = s.imapEmail || s.name.replace('IMAP Sync:', '').split('(')[0].trim();
                      }
                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: '#fff', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={displayName}>
                            {isImap ? '📧' : '📊'} {displayName}
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem', color: '#e2e8f0' }}>{isImap ? (s.inboxLabel || 'RP TEST') : 'Report'}</td>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showPauseForm && (
        <div className="schedules-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="schedule-card" style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '1.5rem', borderRadius: '12px', width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ color: '#3b82f6', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>⏸️</span> Declare PAUSED for Today ({today})
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
              Paste IP addresses (one per line, spaces, or commas). They will be set to <b>PAUSED</b> in the database for today.
            </p>
            <textarea
              rows={5}
              placeholder="Paste IPs here..."
              value={pauseIpsText}
              onChange={e => setPauseIpsText(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0.8rem',
                borderRadius: '8px',
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: '1.15rem',
                outline: 'none',
                resize: 'vertical'
              }}
            />
            <button
              onClick={handleDeclarePaused}
              style={{
                width: '100%',
                padding: '1rem',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '1.15rem'
              }}
            >
              Declare PAUSED for Today
            </button>
          </div>
        </div>
      )}

      <div className="controls-bar" style={{ flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="Search Server or IP..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: '250px' }}
        />
        <select value={dateRange} onChange={e => setDateRange(Number(e.target.value))}>
          <option value={7}>Week (7 Days)</option>
          <option value={30}>Month (30 Days)</option>
          <option value={60}>2 Months (60 Days)</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(15, 23, 42, 0.5)', padding: '0 0.8rem', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Filter Date:</span>
          <input 
            type="date" 
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: '0.6rem 0' }}
          />
        </div>
        <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
          <option value="all">All Teams</option>
          {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </div>

      <div className="status-filter-bar" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', background: 'rgba(30, 41, 59, 0.4)', padding: '0.8rem', borderRadius: '8px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#94a3b8', fontSize: '1.1rem', fontWeight: 600 }}>Filter by Status:</span>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {STATUS_TYPES.map(st => {
              const isCurrentActive = activeFilters[selectedHeaderDate || endDate] === st.id;
              return (
                <button
                  key={st.id}
                  onClick={() => handleStatusFilterClick(st.id)}
                  className={`legend-item ${st.class}`}
                  style={{
                    cursor: 'pointer',
                    border: isCurrentActive ? '2px solid #fff' : '2px solid transparent',
                    opacity: Object.values(activeFilters).length === 0 || isCurrentActive ? 1 : 0.4,
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ width: '12px', height: '12px', background: 'currentColor', display: 'inline-block', borderRadius: '2px', marginRight: '4px' }}></span>
                  {st.label}
                </button>
              );
            })}
            
            <button
              onClick={() => handleStatusFilterClick('EMPTY')}
              className="legend-item"
              style={{
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: activeFilters[selectedHeaderDate || endDate] === 'EMPTY' ? '2px solid #fff' : '2px solid transparent',
                opacity: Object.values(activeFilters).length === 0 || activeFilters[selectedHeaderDate || endDate] === 'EMPTY' ? 1 : 0.4,
                transition: 'all 0.2s',
                padding: '0.45rem 0.9rem',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <span style={{ width: '12px', height: '12px', background: 'transparent', border: '1px solid #fff', display: 'inline-block', borderRadius: '2px', marginRight: '4px' }}></span>
              EMPTY (No Status)
            </button>
          </div>
          {Object.keys(activeFilters).length > 0 && (
            <button 
              onClick={() => { setActiveFilters({}); setSelectedHeaderDate(null); }}
              style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Clear All Filters
            </button>
          )}
          {selectedHeaderDate && (
            <button 
              onClick={() => setSelectedHeaderDate(null)}
              style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', marginLeft: '0.5rem' }}
            >
              Reset Focus Date ({visibleDays.find(d => d.id === selectedHeaderDate)?.display || selectedHeaderDate})
            </button>
          )}
        </div>
        
        <button 
          onClick={handleCopyIps}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          📋 Copy IPs ({rows.length})
        </button>
      </div>

      <div className="matrix-container">
        <table className="matrix-table">
          <thead>
            {/* Totals Rows */}
            {STATUS_TYPES.map(st => {
              let labelColor = '#fff';
              if (st.id === 'RP TEST') labelColor = '#22c55e';
              if (st.id === 'SPAM') labelColor = '#ef4444';
              if (st.id === 'PAUSED') labelColor = '#3b82f6';
              if (st.id === 'Change DOM') labelColor = '#eab308';
              if (st.id === 'RDNS') labelColor = '#15803d';
              if (st.id === 'DOWN') labelColor = '#f97316';
              if (st.id === 'BOUNCE') labelColor = '#ec4899';
              if (st.id === 'TO') labelColor = '#64748b';
              
              const isBlackText = ['Change DOM', 'RP TEST', 'DOWN'].includes(st.id);

              return (
                <tr key={`total-${st.id}`} style={{ background: '#1e293b' }}>
                  <th colSpan={2} style={{ textAlign: 'right', padding: '0.1rem 0.5rem', color: labelColor, fontSize: '0.9rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {st.label}
                  </th>
                  {visibleDays.map(day => (
                    <th key={day.id} className={st.class} style={{ textAlign: 'center', padding: '0.1rem 0', border: '1px solid rgba(255,255,255,0.1)', color: isBlackText ? '#000' : '#fff', fontSize: '0.9rem' }}>
                      {totalsByDay[day.id][st.id] || 0}
                    </th>
                  ))}
                </tr>
              );
            })}

            {/* EMPTY Row */}
            <tr key="total-empty" style={{ background: '#1e293b' }}>
              <th colSpan={2} style={{ textAlign: 'right', padding: '0.1rem 0.5rem', color: '#fff', fontSize: '0.9rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                EMPTY (No Status)
              </th>
              {visibleDays.map(day => (
                <th key={day.id} style={{ textAlign: 'center', padding: '0.1rem 0', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', background: 'rgba(255,255,255,0.05)', fontSize: '0.9rem' }}>
                  {totalsByDay[day.id]['EMPTY'] || 0}
                </th>
              ))}
            </tr>

            {/* Dates Row */}
            <tr style={{ background: '#0f172a' }}>
              <th style={{ width: '15%', padding: '0.5rem', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>Server ({[...new Set(rows.map(r => r.serverName))].length})</th>
              <th style={{ width: '25%', padding: '0.5rem', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>IP Address ({rows.length})</th>
              {visibleDays.map(day => {
                const isFocused = (selectedHeaderDate || endDate) === day.id;
                const activeFilterStatus = activeFilters[day.id];
                const statusObj = STATUS_TYPES.find(st => st.id === activeFilterStatus);
                let badgeClass = '';
                if (activeFilterStatus === 'EMPTY') badgeClass = 'bg-none';
                else if (statusObj) badgeClass = statusObj.class;

                return (
                  <th 
                    key={`date-${day.id}`} 
                    onClick={() => {
                      if (selectedHeaderDate === day.id) {
                        setSelectedHeaderDate(null);
                      } else {
                        setSelectedHeaderDate(day.id);
                      }
                    }}
                    style={{ 
                      borderBottom: isFocused ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.1)',
                      background: isFocused ? 'rgba(59, 130, 246, 0.15)' : undefined,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      position: 'relative',
                      padding: '0.4rem 0.2rem'
                    }}
                    title={`Click to filter statuses on ${day.display}`}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        {isFocused && <span style={{ color: '#3b82f6', fontSize: '0.65rem' }}>🎯</span>}
                        <span>{day.display}</span>
                      </div>
                      {activeFilterStatus && (
                        <div 
                          className={`legend-item ${badgeClass}`} 
                          style={{ 
                            fontSize: '0.52rem', 
                            padding: '0.05rem 0.25rem', 
                            borderRadius: '3px', 
                            marginTop: '2px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            border: activeFilterStatus === 'EMPTY' ? '1px solid #fff' : 'none'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveFilters(prev => {
                              const updated = { ...prev };
                              delete updated[day.id];
                              return updated;
                            });
                          }}
                        >
                          <span>{activeFilterStatus === 'EMPTY' ? 'EMPTY' : activeFilterStatus}</span>
                          <span style={{ fontSize: '0.6rem', fontWeight: 'bold', cursor: 'pointer' }}>✕</span>
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isFirstOfServer = i === 0 || rows[i - 1].serverName !== row.serverName;
              const isLastOfServer = i === rows.length - 1 || rows[i + 1].serverName !== row.serverName;
              
              let rowSpan = 1;
              if (isFirstOfServer) {
                for (let j = i + 1; j < rows.length; j++) {
                  if (rows[j].serverName === row.serverName) rowSpan++;
                  else break;
                }
              }

              const bottomBorder = isLastOfServer ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.05)';

              return (
                <tr key={`${row.serverName}_${row.ip}_${i}`} style={row.serverStatus === 'tocancel' ? { background: 'rgba(249, 115, 22, 0.08)' } : undefined}>
                  {isFirstOfServer && (
                    <td 
                      className="server-cell" 
                      rowSpan={rowSpan}
                      style={{ 
                        verticalAlign: 'middle', 
                        color: row.serverStatus === 'tocancel' ? '#f97316' : '#38bdf8', 
                        borderBottom: '1px solid rgba(255,255,255,0.2)',
                        background: row.serverStatus === 'tocancel' ? 'rgba(249, 115, 22, 0.15)' : undefined
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start' }}>
                        <span>{row.serverName}</span>
                        {row.serverStatus === 'tocancel' && <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 'bold' }}>tocancel</span>}
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button onClick={() => copyServerName(row.serverName)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '0.6rem', padding: '0.2rem 0.4rem', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' }} title="Copy Server Name">📋 Name</button>
                          <button onClick={() => copyServerIps(row.serverName)} style={{ background: 'rgba(59, 130, 246, 0.4)', border: 'none', color: '#fff', fontSize: '0.6rem', padding: '0.2rem 0.4rem', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' }} title="Copy Server IPs">📋 IPs</button>
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="ip-cell" style={{ borderBottom: bottomBorder }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.08)', padding: '0.1rem 0.3rem', borderRadius: '4px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>{row.teamName}</span>
                        <span>{row.ip}</span>
                      </div>
                      {(() => {
                         const blData = blacklistResults[`${row.serverName}-${row.ip}`];
                         if (!blData) return null;
                         if (blData.css) return <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid #ef4444', padding: '0.1rem 0.3rem', borderRadius: '12px', fontSize: '0.55rem', fontWeight: 600 }}>CSS</span>;
                         if (blData.sbl) return <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid #ef4444', padding: '0.1rem 0.3rem', borderRadius: '12px', fontSize: '0.55rem', fontWeight: 600 }}>SBL</span>;
                         if (blData.barracuda) return <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7', border: '1px solid #a855f7', padding: '0.1rem 0.3rem', borderRadius: '12px', fontSize: '0.55rem', fontWeight: 600 }}>BARRACUDA</span>;
                         if (blData.status === 'Clean') return <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', border: '1px solid #22c55e', padding: '0.1rem 0.3rem', borderRadius: '12px', fontSize: '0.55rem', fontWeight: 600 }}>CLEAN</span>;
                         if (blData.status === 'Listed') return <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid #ef4444', padding: '0.1rem 0.3rem', borderRadius: '12px', fontSize: '0.55rem', fontWeight: 600 }}>LISTED</span>;
                         return null;
                      })()}
                    </div>
                  </td>
                  {visibleDays.map(day => {
                    const status = ipStatus[row.ip]?.[day.id];
                    const statusObj = STATUS_TYPES.find(st => st.id === status);
                    const cellClass = statusObj ? statusObj.class : 'bg-none';
                    
                    return (
                      <td 
                        key={day.id} 
                        className={`status-cell ${cellClass}`}
                        onClick={() => handleCellClick(row.ip, day.id)}
                        style={{ borderBottom: bottomBorder }}
                      >
                        {status || ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2 + visibleDays.length} style={{ padding: '2rem', color: '#64748b' }}>
                  No IPs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="status-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="status-modal" onClick={e => e.stopPropagation()}>
            <h3>Set Status</h3>
            <div className="status-modal-grid">
              {STATUS_TYPES.map(st => (
                <button 
                  key={st.id} 
                  className={`status-btn ${st.class}`}
                  onClick={() => updateStatus(st.id)}
                >
                  {st.label}
                </button>
              ))}
              <button 
                className="status-btn" 
                style={{ background: 'transparent', border: '1px solid #fff', color: '#fff' }}
                onClick={() => updateStatus('')}
              >
                CLEAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating toast notification */}
      {toastMessage && (
        <div className="toast-rp animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
