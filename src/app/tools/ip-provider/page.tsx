'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { loadTeamsFromFirebase } from '@/lib/firebaseTeams';
import './IpProvider.css';

interface IpResult {
  ip: string;
  status: 'Success' | 'Failed';
  isp: string;
  org: string;
  as: string;
  country: string;
  region: string;
  city: string;
}

export default function IpProviderPage() {
  const [ipsInput, setIpsInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<IpResult[]>([]);
  const [teams, setTeams] = useState<any[]>([]);

  // Load teams on mount
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const teamsData = await loadTeamsFromFirebase();
        if (teamsData) {
          setTeams(teamsData);
        }
      } catch (err) {
        console.error('Failed to load teams:', err);
      }
    };
    fetchTeams();
  }, []);

  // Collect IPs helper
  const collectIpsFromTeam = (team: any): string[] => {
    const ips: string[] = [];
    if (!team || !team.servers) return ips;
    
    team.servers.forEach((server: any) => {
      if (server.status !== 'deleted') {
        if (server.mainIp) {
          ips.push(server.mainIp);
        }
        if (server.ipDomains) {
          server.ipDomains.forEach((ipDom: any) => {
            if (ipDom.ip) {
              ips.push(ipDom.ip);
            }
          });
        }
      }
    });
    return Array.from(new Set(ips));
  };

  // Button Load Handlers
  const handleLoadTeam = (teamIdx: number) => {
    if (teams.length <= teamIdx) return;
    const teamIps = collectIpsFromTeam(teams[teamIdx]);
    setIpsInput(teamIps.join('\n'));
  };

  const handleLoadAll = () => {
    const allIps: string[] = [];
    teams.forEach(t => {
      allIps.push(...collectIpsFromTeam(t));
    });
    setIpsInput(Array.from(new Set(allIps)).join('\n'));
  };

  // Check IPs
  const handleCheckIps = async () => {
    const ipLines = ipsInput.split('\n').map(l => l.trim()).filter(Boolean);
    if (ipLines.length === 0) return;

    setScanning(true);
    setProgress(0);
    setResults([]);

    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    const queryList: string[] = [];
    const localResults: IpResult[] = [];

    // Separate valid/invalid IPs early to avoid sending garbage to API
    ipLines.forEach(ip => {
      if (ipRegex.test(ip)) {
        queryList.push(ip);
      } else {
        localResults.push({
          ip,
          status: 'Failed',
          isp: '—',
          org: '—',
          as: '—',
          country: '—',
          region: '—',
          city: '—'
        });
      }
    });

    if (queryList.length === 0) {
      setResults(localResults);
      setScanning(false);
      setProgress(100);
      return;
    }

    try {
      const chunkSize = 15; // smaller batch sizes for smooth progress reporting
      const resolvedResults: IpResult[] = [];

      for (let i = 0; i < queryList.length; i += chunkSize) {
        const chunk = queryList.slice(i, i + chunkSize);

        const response = await fetch('/api/ip-provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ips: chunk })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.results) {
            const mapped = data.results.map((r: any) => ({
              ip: r.query,
              status: r.status === 'success' ? 'Success' : 'Failed',
              isp: r.isp || '—',
              org: r.org || '—',
              as: r.as || '—',
              country: r.country || '—',
              region: r.regionName || '—',
              city: r.city || '—'
            }));
            resolvedResults.push(...mapped);
          }
        } else {
          chunk.forEach(ip => {
            resolvedResults.push({
              ip,
              status: 'Failed',
              isp: '—',
              org: '—',
              as: '—',
              country: '—',
              region: '—',
              city: '—'
            });
          });
        }

        const currentAll = [...resolvedResults, ...localResults];
        setResults(currentAll);

        const completed = Math.min(i + chunkSize, queryList.length);
        setProgress(Math.round((completed / queryList.length) * 100));
      }
    } catch (err) {
      console.error('IP query failure:', err);
      alert('Error occurred during scanning.');
    }
    setScanning(false);
  };

  // Filtered Table Rows
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return results;
    const query = searchQuery.toLowerCase().trim();
    return results.filter(r => 
      r.ip.toLowerCase().includes(query) ||
      r.isp.toLowerCase().includes(query) ||
      r.org.toLowerCase().includes(query) ||
      r.country.toLowerCase().includes(query) ||
      r.region.toLowerCase().includes(query) ||
      r.city.toLowerCase().includes(query)
    );
  }, [results, searchQuery]);

  // Statistics computations
  const totalCount = results.length;
  const successCount = results.filter(r => r.status === 'Success').length;
  const failedCount = results.filter(r => r.status === 'Failed').length;

  const orgStats = useMemo(() => {
    const counts: { [key: string]: number } = {};
    const successRes = results.filter(r => r.status === 'Success');
    successRes.forEach(r => {
      const key = r.isp || 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: successRes.length > 0 ? Math.round((count / successRes.length) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [results]);

  const regionStats = useMemo(() => {
    const counts: { [key: string]: number } = {};
    const successRes = results.filter(r => r.status === 'Success');
    successRes.forEach(r => {
      const key = r.region || 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: successRes.length > 0 ? Math.round((count / successRes.length) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [results]);

  // CSV download utility
  const handleDownloadCsv = () => {
    if (results.length === 0) return;
    const headers = ['IP', 'STATUS', 'ISP', 'ORGANIZATION', 'ASN', 'COUNTRY', 'REGION', 'CITY'];
    const rows = results.map(r => [
      r.ip,
      r.status,
      r.isp,
      r.org,
      r.as,
      r.country,
      r.region,
      r.city
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ip_provider_check_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="ip-provider-container animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <header className="page-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        padding: '1.25rem 1.75rem',
        borderRadius: '16px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="header-icon" style={{
            fontSize: '1.8rem',
            padding: '0.5rem',
            background: 'rgba(56, 189, 248, 0.1)',
            borderRadius: '12px'
          }}>🌐</span>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', margin: '0 0 0.2rem 0', letterSpacing: '0.5px' }}>
              ULTRA IP Provider Checker
            </h1>
            <p className="subtitle" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Bulk check IP addresses geolocations, providers, Autonomous Systems (ASNs), and regions distribution
            </p>
          </div>
        </div>
      </header>

      <div className="checker-top-layout">
        {/* Left Side Input Box */}
        <div className="checker-input-section">
          <textarea
            className="ips-textarea"
            placeholder="Enter IP addresses (one per line)&#10;e.g.&#10;8.8.8.8&#10;1.1.1.1"
            value={ipsInput}
            onChange={(e) => setIpsInput(e.target.value)}
            disabled={scanning}
          />
          <div className="actions-button-row">
            <button 
              className="check-ips-btn"
              onClick={handleCheckIps}
              disabled={scanning || !ipsInput.trim()}
            >
              {scanning ? 'Checking...' : 'Check IPs'}
            </button>
            <button
              className="load-team-btn team-1-btn"
              onClick={() => handleLoadTeam(0)}
              disabled={scanning || teams.length < 1}
            >
              Load {teams[0]?.name || 'Team 1'}
            </button>
            <button
              className="load-team-btn team-2-btn"
              onClick={() => handleLoadTeam(1)}
              disabled={scanning || teams.length < 2}
            >
              Load {teams[1]?.name || 'Team 2'}
            </button>
            <button
              className="load-team-btn load-all-btn"
              onClick={handleLoadAll}
              disabled={scanning || teams.length === 0}
            >
              Load All
            </button>
          </div>
        </div>

        {/* Right Side Search and Download options */}
        <div className="checker-options-section">
          <div className="search-box-wrapper">
            <label className="search-label">Filter results table:</label>
            <input
              type="text"
              className="search-input"
              placeholder="Search IP / Provider / Country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            className="csv-download-btn"
            onClick={handleDownloadCsv}
            disabled={results.length === 0}
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Numerical Stats Panels */}
      <div className="stats-row">
        <div className="stat-panel">
          <div className="stat-num">{totalCount}</div>
          <div className="stat-label">TOTAL IPS</div>
        </div>
        <div className="stat-panel success-border">
          <div className="stat-num success-text">{successCount}</div>
          <div className="stat-label">SUCCESS</div>
        </div>
        <div className="stat-panel failed-border">
          <div className="stat-num failed-text">{failedCount}</div>
          <div className="stat-label">FAILED</div>
        </div>
      </div>

      {/* Progress Bar */}
      {(scanning || progress > 0) && (
        <div className="scan-progress-wrapper">
          <div className="progress-details">
            <span>SCAN PROGRESS</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      )}

      {/* Charts / Distribution Section */}
      {successCount > 0 && (
        <div className="charts-grid">
          <div className="chart-card">
            <h3>🏢 ORGANIZATION STAT</h3>
            <div className="chart-list">
              {orgStats.map((item, idx) => (
                <div key={idx} className="chart-item">
                  <div className="item-label-row">
                    <span className="item-name" title={item.name}>{item.name}</span>
                    <span className="item-value">{item.count} IPs ({item.percentage}%)</span>
                  </div>
                  <div className="item-progress-bg">
                    <div className="item-progress-fill" style={{ width: `${item.percentage}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-card">
            <h3>📍 REGIONS DISTRIBUTION</h3>
            <div className="chart-list">
              {regionStats.map((item, idx) => (
                <div key={idx} className="chart-item">
                  <div className="item-label-row">
                    <span className="item-name" title={item.name}>{item.name}</span>
                    <span className="item-value">{item.count} IPs ({item.percentage}%)</span>
                  </div>
                  <div className="item-progress-bg">
                    <div className="item-progress-fill purple-fill" style={{ width: `${item.percentage}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detailed Datatable */}
      <div className="results-table-wrapper">
        <h3 className="table-title">Results Details</h3>
        <table className="results-table">
          <thead>
            <tr>
              <th>IP</th>
              <th>STATUS</th>
              <th>ISP</th>
              <th>ORGANIZATION</th>
              <th>ASN</th>
              <th>COUNTRY</th>
              <th>REGION</th>
              <th>CITY</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.map((row, idx) => (
              <tr key={idx}>
                <td className="ip-cell">{row.ip}</td>
                <td>
                  <span className={`status-badge ${row.status.toLowerCase()}`}>
                    {row.status}
                  </span>
                </td>
                <td className="text-truncate" title={row.isp}>{row.isp}</td>
                <td className="text-truncate" title={row.org}>{row.org}</td>
                <td>{row.as}</td>
                <td>{row.country}</td>
                <td>{row.region}</td>
                <td>{row.city}</td>
              </tr>
            ))}

            {filteredResults.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-table">
                  {results.length === 0 
                    ? 'Enter IP addresses above and click "Check IPs" to retrieve details.'
                    : 'No results matched your search filter query.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
