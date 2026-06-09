'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { loadTeamsFromFirebase } from '@/lib/firebaseTeams';
import './BlacklistReports.css';

interface BlacklistIp {
  ip: string;
  domain: string;
  sbl: boolean;
  css: boolean;
  barracuda: boolean;
  dbl: boolean;
  status: 'Pending' | 'Clean' | 'Listed' | 'Error';
  errorMsg?: string;
}

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

export default function BlacklistReportsPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [historicalData, setHistoricalData] = useState<Record<string, Record<string, BlacklistIp>>>({});
  const [dateA, setDateA] = useState('');
  const [dateB, setDateB] = useState('');
  const [checkType, setCheckType] = useState<'ips' | 'domains'>('ips');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [loading, setLoading] = useState(true);
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const teamsData = await loadTeamsFromFirebase() || [];
        setTeams(teamsData);

        const res = await fetch('/api/blacklist-history');
        const d = await res.json();
        if (d.history) {
          setHistoricalData(d.history);

          // Get sorted dates to set defaults
          const dates = Object.keys(d.history).sort();
          if (dates.length >= 2) {
            setDateA(dates[dates.length - 2]); // second to last
            setDateB(dates[dates.length - 1]); // latest date
          } else {
            // Defaults to yesterday and today
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            setDateA(yesterday.toLocaleDateString('en-CA'));
            setDateB(today.toLocaleDateString('en-CA'));
          }
        }
      } catch (e) {
        console.error('Failed to load blacklist report data:', e);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  const toggleTeam = (teamName: string) => {
    setExpandedTeams(prev => ({
      ...prev,
      [teamName]: !prev[teamName]
    }));
  };

  // Helper to extract statistics for a single date
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
      
      const dashIdx = key.indexOf('-');
      const serverName = dashIdx > -1 ? key.substring(0, dashIdx) : key;
      
      let stats = serverStatsMap[serverName];
      if (!stats) {
        // Find if server belongs to a team (even if not currently active/initialized)
        const foundTeam = teams.find(t => (t.servers || []).some((s: any) => s.serverName === serverName));
        const teamName = foundTeam ? foundTeam.name : 'Unknown';
        
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
      const isListed = entry.sbl || entry.css || entry.barracuda || entry.dbl;
      const status = entry.status || (isListed ? 'Listed' : 'Clean');
      
      stats.total++;
      totalChecked++;
      
      if (status === 'Clean') {
        stats.clean++;
        cleanCount++;
      } else if (status === 'Listed') {
        stats.listed++;
        listedCount++;
        if (entry.sbl) { stats.sbl++; sblCount++; }
        if (entry.css) { stats.css++; cssCount++; }
        if (entry.barracuda) { stats.barracuda++; barraCount++; }
        if (entry.dbl) { stats.dbl++; dblCount++; }
      }
      
      stats.items.push({
        name,
        status,
        sbl: !!entry.sbl,
        css: !!entry.css,
        barracuda: !!entry.barracuda,
        dbl: !!entry.dbl
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

  // Compile calculations
  const reportData = useMemo(() => {
    if (!dateA || !dateB) return null;

    const statsA = getStatsForDate(dateA, checkType, selectedTeam);
    const statsB = getStatsForDate(dateB, checkType, selectedTeam);

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
    ])).filter(name => selectedTeam === 'all' || name === selectedTeam);

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

        // We show it in details if it was listed on either date OR if status changed
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
  }, [teams, historicalData, dateA, dateB, checkType, selectedTeam]);

  // Calculate totals across everything
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

  // Helper formatting for deltas
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

  if (loading) {
    return <div style={{ color: '#fff', padding: '2rem' }}>Loading Blacklist Reports...</div>;
  }

  const globalA = reportData?.statsA;
  const globalB = reportData?.statsB;

  const globalCleanPercentA = globalA && globalA.totalChecked > 0 ? ((globalA.cleanCount / globalA.totalChecked) * 100).toFixed(1) : '0.0';
  const globalCleanPercentB = globalB && globalB.totalChecked > 0 ? ((globalB.cleanCount / globalB.totalChecked) * 100).toFixed(1) : '0.0';
  
  const globalListedPercentA = globalA && globalA.totalChecked > 0 ? ((globalA.listedCount / globalA.totalChecked) * 100).toFixed(1) : '0.0';
  const globalListedPercentB = globalB && globalB.totalChecked > 0 ? ((globalB.listedCount / globalB.totalChecked) * 100).toFixed(1) : '0.0';

  return (
    <div className="reports-container">
      <div className="reports-header animate-fade-in">
        <div>
          <h1>📊 Blacklist Comparison Reports</h1>
          <p>Compare historical blacklist checks for IPs and Domains across any two dates.</p>
        </div>
        <Link href="/blacklist" className="back-btn">
          ⬅ Back to Blacklist
        </Link>
      </div>

      <div className="filters-bar animate-fade-in">
        <div className="filter-group">
          <label>Check Type</label>
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
          <label>Team</label>
          <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
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

      {reportData && globalA && globalB && (
        <div className="comparison-dashboard animate-fade-in">
          {/* Checked Metric */}
          <div className="comparison-card checked-metric">
            <div className="card-title">
              <span>📋</span> Total Checked
            </div>
            <div className="comparison-values">
              <div className="date-value-box past">
                <span className="date-value-label">{formatDateDisplay(dateA)}</span>
                <span className="date-value-num">{globalA.totalChecked}</span>
              </div>
              <div className="date-value-box recent">
                <span className="date-value-label">{formatDateDisplay(dateB)}</span>
                <span className="date-value-num">{globalB.totalChecked}</span>
              </div>
              <div>
                {renderDeltaBadge(globalA.totalChecked, globalB.totalChecked)}
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
                <span className="date-value-num">{globalA.cleanCount}</span>
                <span className="date-value-sub">{globalCleanPercentA}%</span>
              </div>
              <div className="date-value-box recent">
                <span className="date-value-label">{formatDateDisplay(dateB)}</span>
                <span className="date-value-num">{globalB.cleanCount}</span>
                <span className="date-value-sub">{globalCleanPercentB}%</span>
              </div>
              <div>
                {renderDeltaBadge(globalA.cleanCount, globalB.cleanCount)}
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
                <span className="date-value-num">{globalA.listedCount}</span>
                <span className="date-value-sub">{globalListedPercentA}%</span>
              </div>
              <div className="date-value-box recent">
                <span className="date-value-label">{formatDateDisplay(dateB)}</span>
                <span className="date-value-num">{globalB.listedCount}</span>
                <span className="date-value-sub">{globalListedPercentB}%</span>
              </div>
              <div>
                {renderDeltaBadge(globalA.listedCount, globalB.listedCount, true)}
              </div>
            </div>
          </div>
        </div>
      )}

      {reportData && reportData.teamComparisonRows.length > 0 ? (
        <div className="report-table-container animate-fade-in">
          <table className="report-table">
            <thead>
              {/* Double Header row */}
              <tr>
                <th rowSpan={2} className="col-left" style={{ width: '25%' }}>Team</th>
                <th colSpan={6} className="col-date-header">Date A ({formatDateDisplay(dateA)})</th>
                <th colSpan={6} className="col-date-header col-divider-left">Date B ({formatDateDisplay(dateB)})</th>
                <th rowSpan={2} className="col-divider-left">Delta</th>
              </tr>
              <tr>
                {/* Date A Columns */}
                <th>Total</th>
                <th>Clean</th>
                <th>SBL</th>
                <th>CSS</th>
                <th>Barra</th>
                <th>DBL</th>
                
                {/* Date B Columns */}
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
                const deltaClean = teamRow.b.clean - teamRow.a.clean;
                const deltaListed = teamRow.b.listed - teamRow.a.listed;

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

                      {/* Date A stats */}
                      <td className="stat-cell-val">{teamRow.a.total}</td>
                      <td className="stat-cell-val clean">{teamRow.a.clean}</td>
                      <td className="stat-cell-val sbl">{teamRow.a.sbl}</td>
                      <td className="stat-cell-val css">{teamRow.a.css}</td>
                      <td className="stat-cell-val barracuda">{teamRow.a.barracuda}</td>
                      <td className="stat-cell-val dbl">{teamRow.a.dbl}</td>

                      {/* Date B stats */}
                      <td className="stat-cell-val col-divider-left">{teamRow.b.total}</td>
                      <td className="stat-cell-val clean">{teamRow.b.clean}</td>
                      <td className="stat-cell-val sbl">{teamRow.b.sbl}</td>
                      <td className="stat-cell-val css">{teamRow.b.css}</td>
                      <td className="stat-cell-val barracuda">{teamRow.b.barracuda}</td>
                      <td className="stat-cell-val dbl">{teamRow.b.dbl}</td>

                      {/* Delta Column */}
                      <td className="col-divider-left">
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Clean:</span>
                          {renderDeltaBadge(teamRow.a.clean, teamRow.b.clean)}
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.2rem' }}>Listed:</span>
                          {renderDeltaBadge(teamRow.a.listed, teamRow.b.listed, true)}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded details */}
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
                                  // Determine clean or listed classes
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

              {/* Grand Totals Row */}
              {totals && reportData.teamComparisonRows.length > 0 && (
                <tr className="totals-row">
                  <td className="col-left">TOTAL</td>
                  
                  {/* Date A Grand Totals */}
                  <td>{totals.totalA}</td>
                  <td className="clean">{totals.cleanA}</td>
                  <td>{totals.sblA}</td>
                  <td>{totals.cssA}</td>
                  <td>{totals.barracudaA}</td>
                  <td>{totals.dblA}</td>

                  {/* Date B Grand Totals */}
                  <td className="col-divider-left">{totals.totalB}</td>
                  <td className="clean">{totals.cleanB}</td>
                  <td>{totals.sblB}</td>
                  <td>{totals.cssB}</td>
                  <td>{totals.barracudaB}</td>
                  <td>{totals.dblB}</td>

                  {/* Grand Totals Delta */}
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
        <div className="empty-state animate-fade-in">
          <span className="empty-icon">📭</span>
          <h3>No Data Recorded</h3>
          <p>No blacklist check history matches the selected dates, check type, and team filter.</p>
        </div>
      )}
    </div>
  );
}
