'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadTeamsFromFirebase } from '@/lib/firebaseTeams';
import '../Database.css';

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
}

interface TeamData {
  name: string;
  servers: Server[];
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

function getYearMonthNumber(dateStr: string): number {
  const d = parseDate(dateStr);
  if (!d) return 0;
  return d.getFullYear() * 12 + d.getMonth();
}

function getMonthYear(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return 'Unknown Date';
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function getNoticeColorClass(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return 'normal';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffTime = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < -2) return 'kept';
  if (diffDays >= -2 && diffDays <= 3) return 'urgent';
  if (diffDays >= 4 && diffDays <= 7) return 'warning';
  return 'normal';
}

function getClassFromIps(nbrIps: number): string {
  if (nbrIps >= 19 && nbrIps <= 35) return '27';
  if (nbrIps >= 7 && nbrIps <= 18) return '28';
  if (nbrIps >= 3 && nbrIps <= 6) return '29';
  if (nbrIps > 35) return '26 or less';
  return '-';
}

export default function SummaryPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [activeReportTab, setActiveReportTab] = useState<string>('all');

  const [schedules, setSchedules] = useState<any[]>([]);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleFrequency, setNewScheduleFrequency] = useState<'time' | '1h' | '2h' | '6h' | '12h'>('time');
  const [newScheduleTime1, setNewScheduleTime1] = useState('08:00');
  const [newScheduleTime2, setNewScheduleTime2] = useState('');
  const [newScheduleTeam, setNewScheduleTeam] = useState('all');
  const [newScheduleDays, setNewScheduleDays] = useState<number[]>([1,2,3,4,5,6,0]);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/schedule')
      .then(r => r.json())
      .then(data => {
        if (data.schedules) setSchedules(data.schedules);
      })
      .catch(() => {});
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
      const name = newScheduleName || `Summary Report (Every ${interval}h)`;

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', name, type: 'summary_report', cronExpression: cronExpr, teamName: newScheduleTeam })
      });
      const data = await res.json();
      if (data.schedules) setSchedules(data.schedules);
    } else {
      const [h1, m1] = newScheduleTime1.split(':');
      let cronExpr = `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`;
      const name = newScheduleName || `Summary Report ${newScheduleTime1}`;

      if (newScheduleTime2) {
        const [h2, m2] = newScheduleTime2.split(':');
        await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: `${name} (1)`, type: 'summary_report', cronExpression: `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`, teamName: newScheduleTeam })
        });
        const res2 = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: `${name} (2)`, type: 'summary_report', cronExpression: `${parseInt(m2)} ${parseInt(h2)} * * ${dayStr}`, teamName: newScheduleTeam })
        });
        const data = await res2.json();
        if (data.schedules) setSchedules(data.schedules);
      } else {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name, type: 'summary_report', cronExpression: cronExpr, teamName: newScheduleTeam })
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
    setEditingScheduleId(null);
  };

  const handleUpdateSchedule = async () => {
    if (!editingScheduleId) return;
    await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: editingScheduleId })
    });
    await handleAddSchedule();
  };

  const handleToggleSchedule = async (id: string, enabled: boolean) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', id, enabled })
    });
    const data = await res.json();
    if (data.schedules) setSchedules(data.schedules);
  };

  const handleDeleteSchedule = async (id: string) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id })
    });
    const data = await res.json();
    if (data.schedules) setSchedules(data.schedules);
  };

  const handleEditClick = (sched: any) => {
    setEditingScheduleId(sched.id);
    setNewScheduleName(sched.name);
    setNewScheduleTeam(sched.teamName || 'all');
    
    const parts = sched.cronExpression.split(' ');
    if (parts.length === 5) {
      const [min, hour, dom, month, dow] = parts;
      if (hour.includes('*/')) {
        const interval = parseInt(hour.replace('*/', ''));
        setNewScheduleFrequency(interval === 1 ? '1h' : interval === 2 ? '2h' : interval === 6 ? '6h' : '12h');
      } else {
        setNewScheduleFrequency('time');
        setNewScheduleTime1(`${hour.padStart(2,'0')}:${min.padStart(2,'0')}`);
        setNewScheduleTime2('');
      }
      const days = dow === '*' ? [1,2,3,4,5,6,0] : dow.split(',').map(Number);
      setNewScheduleDays(days);
    }
  };

  const handleSendNow = async (teamName: string) => {
    try {
      const res = await fetch('/api/cron-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'summary_report', teamName })
      });
      if (res.ok) {
        alert('Summary Report sent to Telegram successfully!');
      } else {
        alert('Failed to send report.');
      }
    } catch (e) {
      alert('Error sending report.');
    }
  };

  const summarySchedules = schedules.filter(s => s.type === 'summary_report');

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const loadedTeams = await loadTeamsFromFirebase();
        setTeams(loadedTeams || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchTeams();
  }, []);

  const availableReportMonths = React.useMemo(() => {
    const monthsSet = new Set<string>();
    
    teams.forEach(team => {
      team.servers.forEach(s => {
        if (s.dateEntre) {
          const m = getMonthYear(s.dateEntre);
          if (m && m !== 'Unknown Date') monthsSet.add(m);
        }
        if (s.dateSortie) {
          const m = getMonthYear(s.dateSortie);
          if (m && m !== 'Unknown Date') monthsSet.add(m);
        }
      });
    });
    
    return Array.from(monthsSet).sort((a, b) => {
      const db = new Date(b);
      const da = new Date(a);
      return (isNaN(db.getTime()) ? 0 : db.getTime()) - (isNaN(da.getTime()) ? 0 : da.getTime());
    });
  }, [teams]);

  useEffect(() => {
    if (availableReportMonths.length > 0 && !selectedMonth) {
      const now = new Date();
      const currentMonthStr = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      if (availableReportMonths.includes(currentMonthStr)) {
        setSelectedMonth(currentMonthStr);
      } else {
        setSelectedMonth(availableReportMonths[0]);
      }
    }
  }, [availableReportMonths, selectedMonth]);

  if (loading) {
    return <div className="database-page" style={{ color: '#fff', padding: '2rem' }}>Loading summary...</div>;
  }

  // Get report month number from label like "June 2026"
  const getReportMonthNum = (month: string) => {
    const parts = month.split(' ');
    const monthName = parts[0].toLowerCase();
    const year = parseInt(parts[1]);
    const monthNamesArr = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthIdx = monthNamesArr.indexOf(monthName);
    return year * 12 + monthIdx;
  };

  // Get detailed report data for a specific team and month
  const getTeamMonthlyReport = (team: TeamData, reportMonthNum: number) => {
    const newServers: Server[] = [];
    const existingServers: Server[] = [];
    const toCancelServers: Server[] = [];
    const deletedServers: Server[] = [];

    team.servers.forEach(s => {
      const entryMonthNum = getYearMonthNumber(s.dateEntre);
      const exitMonthNum = s.dateSortie ? getYearMonthNumber(s.dateSortie) : 0;

      if (s.status === 'deleted') {
        if (exitMonthNum === reportMonthNum) {
          deletedServers.push(s);
        } else if (entryMonthNum === reportMonthNum && reportMonthNum < exitMonthNum) {
          newServers.push(s);
        } else if (entryMonthNum < reportMonthNum && reportMonthNum < exitMonthNum) {
          existingServers.push(s);
        }
      } else if (s.status === 'tocancel') {
        if (exitMonthNum === reportMonthNum) {
          toCancelServers.push(s);
        } else {
          if (entryMonthNum === reportMonthNum) {
            newServers.push(s);
          } else if (entryMonthNum < reportMonthNum) {
            existingServers.push(s);
          }
        }
      } else {
        if (entryMonthNum === reportMonthNum) {
          newServers.push(s);
        } else if (entryMonthNum < reportMonthNum) {
          existingServers.push(s);
        }
      }
    });

    return { newServers, existingServers, toCancelServers, deletedServers };
  };

  const renderMonthTable = (month: string) => {
    const reportMonthNum = getReportMonthNum(month);

    let totalProd = 0;
    let totalNew = 0;
    let totalToCancel = 0;
    let totalDeleted = 0;

    let hasDataInMonth = false;

    const rows = teams.map(team => {
      const report = getTeamMonthlyReport(team, reportMonthNum);
      const activeCount = report.existingServers.length;
      const newCount = report.newServers.length;
      const toCancelCount = report.toCancelServers.length;
      const cancelCount = report.deletedServers.length;

      if (activeCount === 0 && newCount === 0 && toCancelCount === 0 && cancelCount === 0) return null;
      hasDataInMonth = true;

      totalProd += activeCount;
      totalNew += newCount;
      totalToCancel += toCancelCount;
      totalDeleted += cancelCount;

      const isExpanded = expandedTeam === team.name;

      return (
        <React.Fragment key={team.name}>
          <tr 
            style={{ cursor: 'pointer', transition: 'background 0.2s', background: isExpanded ? 'rgba(99, 102, 241, 0.1)' : undefined }}
            onClick={() => {
              setExpandedTeam(isExpanded ? null : team.name);
              setActiveReportTab('all');
            }}
            title="Click to view detailed report"
          >
            <td style={{ fontWeight: 'bold', textAlign: 'left', paddingLeft: '1rem' }}>
              <span style={{ marginRight: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>{isExpanded ? '▼' : '▶'}</span>
              {team.name}
            </td>
            <td style={{ color: '#34d399', fontWeight: 600, textAlign: 'center' }}>{activeCount}</td>
            <td style={{ color: '#60a5fa', fontWeight: 600, textAlign: 'center' }}>{newCount}</td>
            <td style={{ color: '#f97316', fontWeight: 600, textAlign: 'center' }}>{toCancelCount}</td>
            <td style={{ color: '#f87171', fontWeight: 600, textAlign: 'center' }}>{cancelCount}</td>
            <td style={{ color: '#38bdf8', fontWeight: 'bold', textAlign: 'center', background: 'rgba(56, 189, 248, 0.04)' }}>{activeCount + newCount + toCancelCount + cancelCount}</td>
          </tr>
          {isExpanded && (
            <tr>
              <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                {renderTeamDetailedReport(team, reportMonthNum, month)}
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    });

    if (!hasDataInMonth) {
      return <p style={{ color: '#94a3b8', marginTop: '1rem' }}>No data available for this month.</p>;
    }

    return (
      <div className="team-board-container" style={{ padding: '1.5rem', background: 'rgba(30, 41, 59, 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.8rem' }}>
          <h2 style={{ color: '#e2e8f0', margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>📅 {month}</h2>
          <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.85rem' }}>Click on a team row for detailed report</span>
        </div>
        <div className="db-table-container no-border-radius-top" style={{ border: 'none' }}>
          <table className="db-table clean-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left', paddingLeft: '1rem' }}>Team</th>
                <th style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'center' }}>Prod Servers</th>
                <th style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'center' }}>New Servers</th>
                <th style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'center' }}>Cancel Declared</th>
                <th style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'center' }}>Cancelled Definitive</th>
                <th style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'center', fontWeight: 'bold', color: '#38bdf8' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {rows}
              {/* Total Row */}
              <tr style={{ background: 'rgba(255,255,255,0.06)', borderTop: '2px solid rgba(255,255,255,0.1)' }}>
                <td style={{ fontWeight: 'bold', color: '#fff', textAlign: 'left', paddingLeft: '1rem' }}>TOTAL</td>
                <td style={{ color: '#34d399', fontWeight: 'bold', textAlign: 'center' }}>{totalProd}</td>
                <td style={{ color: '#60a5fa', fontWeight: 'bold', textAlign: 'center' }}>{totalNew}</td>
                <td style={{ color: '#f97316', fontWeight: 'bold', textAlign: 'center' }}>{totalToCancel}</td>
                <td style={{ color: '#f87171', fontWeight: 'bold', textAlign: 'center' }}>{totalDeleted}</td>
                <td style={{ color: '#38bdf8', fontWeight: 'extrabold', textAlign: 'center', background: 'rgba(56, 189, 248, 0.06)' }}>{totalProd + totalNew + totalToCancel + totalDeleted}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTeamDetailedReport = (team: TeamData, reportMonthNum: number, month: string) => {
    const report = getTeamMonthlyReport(team, reportMonthNum);

    const mappedNew = report.newServers.map(s => ({ ...s, reportType: 'New' }));
    const mappedExisting = report.existingServers.map(s => ({ ...s, reportType: 'Existing' }));
    const mappedToCancel = report.toCancelServers.map(s => ({ ...s, reportType: 'To Cancel' }));
    const mappedDeleted = report.deletedServers.map(s => ({ ...s, reportType: 'Cancelled' }));

    let displayItems: (Server & { reportType: string })[] = [];

    if (activeReportTab === 'all') {
      displayItems = [...mappedNew, ...mappedExisting, ...mappedToCancel, ...mappedDeleted];
    } else if (activeReportTab === 'new') {
      displayItems = mappedNew;
    } else if (activeReportTab === 'existing') {
      displayItems = mappedExisting;
    } else if (activeReportTab === 'tocancel') {
      displayItems = mappedToCancel;
    } else if (activeReportTab === 'deleted') {
      displayItems = mappedDeleted;
    }

    return (
      <div style={{ padding: '1.5rem', background: 'rgba(15, 23, 42, 0.6)', borderTop: '1px solid rgba(99, 102, 241, 0.2)', borderBottom: '1px solid rgba(99, 102, 241, 0.2)' }}>
        <h3 style={{ color: '#c7d2fe', margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>
          📋 Monthly Report — {month} ({team.name})
        </h3>

        {/* Dashboard cards */}
        <div className="report-dashboard-grid">
          <div className="report-stat-card new">
            <span className="report-stat-label">🆕 New Servers</span>
            <span className="report-stat-value">{report.newServers.length}</span>
          </div>
          <div className="report-stat-card existing">
            <span className="report-stat-label">🖥️ Existing Servers</span>
            <span className="report-stat-value">{report.existingServers.length}</span>
          </div>
          <div className="report-stat-card tocancel">
            <span className="report-stat-label">⚠️ To Cancel</span>
            <span className="report-stat-value">{report.toCancelServers.length}</span>
          </div>
          <div className="report-stat-card deleted">
            <span className="report-stat-label">❌ Cancelled / Deleted</span>
            <span className="report-stat-value">{report.deletedServers.length}</span>
          </div>
        </div>

        {/* Tabs switcher */}
        <div className="report-tabs">
          <button 
            className={`report-tab-btn ${activeReportTab === 'all' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setActiveReportTab('all'); }}
          >
            All ({mappedNew.length + mappedExisting.length + mappedToCancel.length + mappedDeleted.length})
          </button>
          <button 
            className={`report-tab-btn ${activeReportTab === 'new' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setActiveReportTab('new'); }}
            style={{ color: '#38bdf8' }}
          >
            New ({mappedNew.length})
          </button>
          <button 
            className={`report-tab-btn ${activeReportTab === 'existing' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setActiveReportTab('existing'); }}
            style={{ color: '#34d399' }}
          >
            Already Existing ({mappedExisting.length})
          </button>
          <button 
            className={`report-tab-btn ${activeReportTab === 'tocancel' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setActiveReportTab('tocancel'); }}
            style={{ color: '#f59e0b' }}
          >
            To Cancel ({mappedToCancel.length})
          </button>
          <button 
            className={`report-tab-btn ${activeReportTab === 'deleted' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setActiveReportTab('deleted'); }}
            style={{ color: '#f87171' }}
          >
            Definitive Deleted ({mappedDeleted.length})
          </button>
        </div>

        {/* Server Table */}
        <div className="db-table-container" style={{ marginTop: '0.5rem' }}>
          <table className="db-table clean-table">
            <thead>
              <tr>
                <th>Server</th>
                <th>Main IP</th>
                <th>Provider</th>
                <th>ASN</th>
                <th>DateEntre</th>
                <th>Notice Date</th>
                <th>Type</th>
                <th>IPs</th>
                <th>Class</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.length > 0 ? (
                displayItems.map((item) => (
                  <tr key={item.id}>
                    <td className="td-name">{item.serverName || '—'}</td>
                    <td className="td-ip">{item.mainIp || '—'}</td>
                    <td>{item.provider || '—'}</td>
                    <td>{item.asn || '—'}</td>
                    <td className="td-date">{item.dateEntre || '—'}</td>
                    <td className="td-date">{item.dateSortie ? <span className={`notice-badge ${getNoticeColorClass(item.dateSortie)}`}>⚠️ {item.dateSortie}</span> : '—'}</td>
                    <td>
                      <span className={`notice-badge ${
                        item.reportType === 'New' ? 'warning' : 
                        item.reportType === 'Existing' ? 'normal' : 
                        item.reportType === 'To Cancel' ? 'warning' : 'urgent'
                      }`} style={{
                        borderColor: item.reportType === 'New' ? '#3b82f6' : item.reportType === 'Existing' ? '#10b981' : item.reportType === 'To Cancel' ? '#f59e0b' : '#ef4444',
                        color: item.reportType === 'New' ? '#3b82f6' : item.reportType === 'Existing' ? '#10b981' : item.reportType === 'To Cancel' ? '#f59e0b' : '#ef4444',
                        background: 'transparent',
                        border: '1px solid'
                      }}>
                        {item.reportType}
                      </span>
                    </td>
                    <td>{item.nbrIps || 0}</td>
                    <td>{item.classType || getClassFromIps(item.nbrIps)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="empty-row" style={{ textAlign: 'center', padding: '2rem' }}>
                    No servers in this category for this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="database-page animate-fade-in">
      <header className="db-header" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Link href="/database" className="minimal-btn" style={{ textDecoration: 'none', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '6px', fontWeight: 500, border: '1px solid rgba(255,255,255,0.1)' }}>
                ← Back
              </Link>
              <h1 style={{ margin: 0 }}>📊 Historical Teams Summary</h1>
            </div>
            <p className="db-subtitle" style={{ marginTop: '0.5rem' }}>Select a month to view its detailed breakdown</p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
            {/* Telegram manual trigger button */}
            <button 
              className="minimal-btn" 
              style={{ 
                background: 'rgba(59, 130, 246, 0.15)', 
                border: '1px solid rgba(59, 130, 246, 0.4)', 
                color: '#60a5fa', 
                padding: '0.6rem 1.2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '1.05rem',
                fontWeight: 600,
                cursor: 'pointer',
                borderRadius: '6px'
              }}
              onClick={() => handleSendNow('all')}
              title="Send the current month report to Telegram immediately"
            >
              ⚡ Send Now
            </button>

            {/* Auto Schedule configuration toggle */}
            <button 
              className="minimal-btn" 
              style={{ 
                background: isScheduleOpen ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.15)', 
                border: '1px solid rgba(16, 185, 129, 0.4)', 
                color: '#10b981', 
                padding: '0.6rem 1.2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '1.05rem',
                fontWeight: 600,
                cursor: 'pointer',
                borderRadius: '6px'
              }}
              onClick={() => setIsScheduleOpen(!isScheduleOpen)}
            >
              ⏰ Auto Schedule
            </button>

            {availableReportMonths.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ color: '#94a3b8', fontWeight: 600 }}>Select Month:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => { setSelectedMonth(e.target.value); setExpandedTeam(null); }}
                  style={{
                    padding: '0.6rem 1.2rem',
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {availableReportMonths.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </header>

      {isScheduleOpen && (
        <div className="animate-fade-in" style={{
          background: 'rgba(16, 185, 129, 0.04)',
          border: '1px solid rgba(16, 185, 129, 0.15)',
          borderRadius: '12px',
          padding: '1.2rem',
          margin: '0 2rem 1.5rem 2rem',
          display: 'flex', gap: '1.5rem', flexWrap: 'wrap'
        }}>
          {/* New Schedule Form */}
          <div style={{ flex: '1 1 280px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '1.2rem', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ margin: '0 0 1rem', color: '#10b981', fontWeight: 600, fontSize: '1.1rem' }}>➕ {editingScheduleId ? '✏️ Edit Schedule' : 'New Summary Schedule'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <input
                type="text"
                placeholder="Schedule Name"
                value={newScheduleName}
                onChange={e => setNewScheduleName(e.target.value)}
                style={{ gridColumn: '1 / -1', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '1rem' }}
              />
              <select
                value={newScheduleFrequency}
                onChange={e => setNewScheduleFrequency(e.target.value as any)}
                style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '1rem' }}
              >
                <option value="time" style={{ background: '#1e293b' }}>Specific Times</option>
                <option value="1h" style={{ background: '#1e293b' }}>Every 1 Hour</option>
                <option value="2h" style={{ background: '#1e293b' }}>Every 2 Hours</option>
                <option value="6h" style={{ background: '#1e293b' }}>Every 6 Hours</option>
                <option value="12h" style={{ background: '#1e293b' }}>Every 12 Hours</option>
              </select>
              <select
                value={newScheduleTeam}
                onChange={e => setNewScheduleTeam(e.target.value)}
                style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '1rem' }}
              >
                <option value="all" style={{ background: '#1e293b' }}>All Teams</option>
                {teams.map(t => <option key={t.name} value={t.name} style={{ background: '#1e293b' }}>{t.name}</option>)}
              </select>
              {newScheduleFrequency === 'time' && (
                <div style={{ display: 'flex', gap: '0.5rem', gridColumn: '1 / -1' }}>
                  <input 
                    type="time"
                    value={newScheduleTime1}
                    onChange={e => setNewScheduleTime1(e.target.value)}
                    style={{ flex: 1, padding: '0.6rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '1rem' }}
                  />
                  <input 
                    type="time"
                    value={newScheduleTime2}
                    onChange={e => setNewScheduleTime2(e.target.value)}
                    placeholder="Optional time 2"
                    style={{ flex: 1, padding: '0.6rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '1rem' }}
                  />
                </div>
              )}
              
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', justifyContent: 'center', margin: '0.4rem 0' }}>
                {[{l:'M',v:1}, {l:'T',v:2}, {l:'W',v:3}, {l:'T',v:4}, {l:'F',v:5}, {l:'S',v:6}, {l:'S',v:0}].map((day, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (newScheduleDays.includes(day.v)) {
                        setNewScheduleDays(newScheduleDays.filter(d => d !== day.v));
                      } else {
                        setNewScheduleDays([...newScheduleDays, day.v].sort());
                      }
                    }}
                    style={{
                      width: '36px', height: '36px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      background: newScheduleDays.includes(day.v) ? '#10b981' : 'rgba(255,255,255,0.08)',
                      color: newScheduleDays.includes(day.v) ? '#fff' : '#94a3b8',
                      fontWeight: '600', fontSize: '0.95rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    {day.l}
                  </button>
                ))}
              </div>

              <button 
                style={{ 
                  background: editingScheduleId ? '#f59e0b' : '#10b981', 
                  padding: '0.7rem', gridColumn: '1 / -1', fontSize: '1.05rem', fontWeight: 600, 
                  border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' 
                }}
                onClick={editingScheduleId ? handleUpdateSchedule : handleAddSchedule}
              >
                {editingScheduleId ? '💾 Update Schedule' : 'Add Schedule'}
              </button>
              {editingScheduleId && (
                <button
                  style={{ padding: '0.5rem', gridColumn: '1 / -1', fontSize: '0.95rem', fontWeight: 500, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', background: 'transparent' }}
                  onClick={() => {
                    setEditingScheduleId(null);
                    setNewScheduleName('');
                    setNewScheduleTime1('08:00');
                    setNewScheduleTime2('');
                    setNewScheduleTeam('all');
                    setNewScheduleFrequency('time');
                    setNewScheduleDays([1,2,3,4,5,6,0]);
                  }}
                >
                  ✕ Cancel Edit
                </button>
              )}
            </div>
          </div>

          {/* Existing Schedules */}
          <div style={{ flex: '1 1 280px' }}>
            <p style={{ margin: '0 0 0.8rem', color: '#10b981', fontWeight: 600, fontSize: '1.1rem' }}>📋 Active Summary Schedules</p>
            {summarySchedules.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '1rem', textAlign: 'center', padding: '1rem' }}>No summary report schedules configured yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {summarySchedules.map(s => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.8rem',
                    padding: '0.7rem 1rem', borderRadius: '8px',
                    background: s.enabled ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${s.enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                    <button
                      onClick={() => handleToggleSchedule(s.id, !s.enabled)}
                      style={{
                        width: '38px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                        background: s.enabled ? '#10b981' : '#475569',
                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: '3px',
                        left: s.enabled ? '19px' : '3px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#fff', transition: 'left 0.2s',
                      }} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#e2e8f0', fontSize: '1.05rem', fontWeight: 500 }}>{s.name}</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                        {s.cronExpression} • Team: {s.teamName || 'all'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                      <button 
                        onClick={() => handleEditClick(s)}
                        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#60a5fa', cursor: 'pointer', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDeleteSchedule(s.id)}
                        style={{ background: 'transparent', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '4px', color: '#f87171', cursor: 'pointer', padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '0 2rem 2rem 2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {availableReportMonths.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>No data available.</p>
        ) : (
          selectedMonth && renderMonthTable(selectedMonth)
        )}
      </div>
    </div>
  );
}
