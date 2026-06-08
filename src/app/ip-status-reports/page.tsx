'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getUniqueIpDomains } from '@/lib/ipUtils';
import './Reports.css';
import { loadTeamsFromFirebase, loadIpStatusFromFirebase } from '@/lib/firebaseTeams';

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
  if (parts.length !== 3) return null;
  
  if (dateStr.includes('/')) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  } else {
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
}

function getNoticeColorClass(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return 'normal';
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  
  const diffTime = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays >= 1 && diffDays <= 3) return 'urgent';
  if (diffDays >= 4 && diffDays <= 7) return 'warning';
  return 'normal';
}

export default function IpStatusReportsPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [ipStatus, setIpStatus] = useState<any>({});
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [teamsData, statusData] = await Promise.all([
        loadTeamsFromFirebase(),
        loadIpStatusFromFirebase()
      ]);
      setTeams(teamsData || []);
      setIpStatus(statusData || {});
      
      // Default to today's date
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(today);
      
      setLoading(false);
    };
    fetchData();
  }, []);

  // Format date to DD/MM
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return dateStr;
  };

  // Calculate aggregated stats per server
  const serverStats = useMemo(() => {
    if (!teams || teams.length === 0 || !selectedDate) return [];

    let targetTeams = teams;
    if (selectedTeam !== 'all') {
      targetTeams = teams.filter(t => t.name === selectedTeam);
    }

    const stats: any[] = [];

    targetTeams.forEach(team => {
      const activeServers = (team.servers || []).filter((s: any) => s.status !== 'deleted');
      activeServers.forEach((server: any) => {
        let total = 0;
        let inbox = 0;
        let spam = 0;
        let bounce = 0;
        let down = 0;
        let empty = 0;

        const allIps: string[] = [];
        if (server.mainIp) allIps.push(server.mainIp);
        const uniqueDomains = getUniqueIpDomains(server.ipDomains);
        uniqueDomains.forEach((d: any) => allIps.push(d.ip));

        total = allIps.length;

        allIps.forEach(ip => {
          const ipData = ipStatus[ip];
          if (ipData && ipData[selectedDate]) {
            const st = ipData[selectedDate];
            if (st === 'RP TEST' || st === 'RDNS') inbox++;
            else if (st === 'SPAM') spam++;
            else if (st === 'BOUNCE') bounce++;
            else if (st === 'DOWN') down++;
            else empty++; // other statuses count as empty/other for this report
          } else {
            empty++;
          }
        });

        stats.push({
          serverName: server.serverName,
          teamName: team.name,
          serverStatus: server.status,
          dateSortie: server.dateSortie,
          total,
          inbox,
          spam,
          bounce,
          down,
          empty
        });
      });
    });

    return stats.sort((a, b) => a.serverName.localeCompare(b.serverName));
  }, [teams, ipStatus, selectedTeam, selectedDate]);

  // Calculate totals
  const totals = useMemo(() => {
    return serverStats.reduce((acc, curr) => ({
      total: acc.total + curr.total,
      inbox: acc.inbox + curr.inbox,
      spam: acc.spam + curr.spam,
      bounce: acc.bounce + curr.bounce,
      down: acc.down + curr.down,
      empty: acc.empty + curr.empty
    }), { total: 0, inbox: 0, spam: 0, bounce: 0, down: 0, empty: 0 });
  }, [serverStats]);

  if (loading) {
    return <div style={{ color: '#fff', padding: '2rem' }}>Loading Reports...</div>;
  }

  return (
    <div className="reports-container">
      <div className="reports-header">
        <h1>📊 IP Status Reports</h1>
        <Link href="/ip-status" className="back-btn">
          ⬅ Back to IP Status
        </Link>
      </div>

      <div className="filters-bar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Filter by Team</label>
          <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
            <option value="all">All Teams</option>
            {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Report Date</label>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={e => setSelectedDate(e.target.value)} 
          />
        </div>
      </div>

      <div className="report-table-container">
        <table className="report-table">
          <thead>
            <tr>
              <th className="col-server" style={{ width: '25%' }}>Server Name</th>
              <th>Notice Date</th>
              <th>Total IPs</th>
              <th>INBOX (RP TEST / RDNS)</th>
              <th>SPAM</th>
              <th>BOUNCE</th>
              <th>DOWN</th>
              <th>EMPTY (No Status)</th>
            </tr>
          </thead>
          <tbody>
            {serverStats.map((row, idx) => (
              <tr key={idx} style={row.serverStatus === 'tocancel' ? { background: 'rgba(249, 115, 22, 0.08)' } : undefined}>
                <td className="col-server">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: row.serverStatus === 'tocancel' ? '#f97316' : undefined, fontWeight: 600 }}>{row.serverName}</span>
                    {row.serverStatus === 'tocancel' && <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 'bold' }}>tocancel</span>}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.2rem' }}>Team {row.teamName}</div>
                </td>
                <td>
                  {row.dateSortie ? (
                    <span className={`notice-badge ${getNoticeColorClass(row.dateSortie)}`}>
                      ⚠️ {row.dateSortie}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="col-total">{row.total}</td>
                <td className="col-inbox">{row.inbox}</td>
                <td className="col-spam">{row.spam}</td>
                <td className="col-bounce">{row.bounce}</td>
                <td className="col-down">{row.down}</td>
                <td className="col-empty">{row.empty}</td>
              </tr>
            ))}
            
            {serverStats.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '2rem', color: '#94a3b8' }}>
                  No servers found for the selected criteria.
                </td>
              </tr>
            )}

            {serverStats.length > 0 && (
              <tr className="totals-row">
                <td className="col-server" style={{ textAlign: 'right' }}>TOTAL</td>
                <td></td>
                <td className="col-total">{totals.total}</td>
                <td className="col-inbox">{totals.inbox}</td>
                <td className="col-spam">{totals.spam}</td>
                <td className="col-bounce">{totals.bounce}</td>
                <td className="col-down">{totals.down}</td>
                <td className="col-empty">{totals.empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
