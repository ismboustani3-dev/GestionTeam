'use client';

import React, { useState, useEffect } from 'react';
import './Infrastructure.css';

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
  status?: 'active' | 'deleted';
  ipDomains?: { ip: string, domain: string }[];
  rdnsStatus?: 'OK' | 'FAIL';
  rdnsDate?: string;
  rdnsDetails?: any[];
  vmtaDetails?: Record<string, string>; // mapping from IP to VMTA string
}

interface Team {
  name: string;
  servers: Server[];
}

interface InfraIp {
  ip: string;
  ptr: string;
  vmta: string;
  status: string;
}

interface InfraServerRow {
  serverId: number;
  serverName: string;
  ips: InfraIp[];
}

export default function InfrastructurePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [isAuditing, setIsAuditing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('gestiq_teams_data');
    if (saved) {
      try {
        setTeams(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved data");
      }
    }
  }, []);

  // Save to localStorage whenever teams change
  useEffect(() => {
    if (teams.length > 0) {
      localStorage.setItem('gestiq_teams_data', JSON.stringify(teams));
    }
  }, [teams]);

  const handleCheckRdns = async () => {
    setIsAuditing(true);
    try {
      // Gather all active servers for the active team
      const currentTeam = teams.find(t => t.name === activeTeam);
      const activeServers = currentTeam?.servers.filter(s => s.status !== 'deleted') || [];
      
      const response = await fetch('/api/rdns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: activeServers })
      });
      const data = await response.json();
      
      if (data.results) {
        setTeams(prev => prev.map(t => ({
          ...t,
          servers: t.servers.map(s => {
            const result = data.results.find((r: any) => r.serverId === s.id);
            if (result) {
              return {
                ...s,
                rdnsStatus: result.overallMatch ? 'OK' : 'FAIL',
                rdnsDate: new Date().toLocaleString('en-US'),
                rdnsDetails: result.queries
              };
            }
            return s;
          })
        })));
      }
    } catch (e) {
      console.error(e);
      alert('Failed to check RDNS');
    }
    setIsAuditing(false);
  };

  const generateRandomVmta = (domain: string) => {
    // Generate a random 3-5 character string prefix
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let prefix = '';
    const len = Math.floor(Math.random() * 3) + 3;
    for (let i = 0; i < len; i++) {
      prefix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Extract base domain if possible
    const parts = domain.split('.');
    const base = parts.length >= 2 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : domain;
    return `${prefix}.${base}`;
  };

  const handleSyncVmta = () => {
    setIsSyncing(true);
    // Simulate API delay
    setTimeout(() => {
      setTeams(prev => prev.map(t => {
        if (t.name !== activeTeam) return t;
        
        return {
          ...t,
          servers: t.servers.map(s => {
            const vmtas: Record<string, string> = {};
            
            if (s.mainIp) {
               const ptrQuery = s.rdnsDetails?.find(d => d.query === s.mainIp && d.type === 'PTR');
               const ptr = ptrQuery?.result && ptrQuery.result !== 'FAIL' ? ptrQuery.result.split(',')[0].trim() : 'unknown.com';
               vmtas[s.mainIp] = generateRandomVmta(ptr);
            }
            if (s.ipDomains) {
              s.ipDomains.forEach(d => {
                 if (d.ip !== s.mainIp) {
                   vmtas[d.ip] = generateRandomVmta(d.domain);
                 }
              });
            }
            
            return {
              ...s,
              vmtaDetails: vmtas
            };
          })
        };
      }));
      setIsSyncing(false);
    }, 1500);
  };

  // Build the flattened structure for the table
  const rows: InfraServerRow[] = [];
  const currentTeamData = teams.find(t => t.name === activeTeam);
  if (currentTeamData) {
    currentTeamData.servers.filter(s => s.status !== 'deleted').forEach(s => {
      const ipsMap = new Map<string, InfraIp>();
      
      const addIp = (ip: string) => {
        if (!ipsMap.has(ip)) {
          // Find PTR from rdnsDetails
          const ptrQuery = s.rdnsDetails?.find(d => d.query === ip && d.type === 'PTR');
          const ptrStr = ptrQuery ? (ptrQuery.result === 'FAIL' ? 'No Record' : ptrQuery.result) : '—';
          
          let status = 'Pending';
          if (ptrQuery) {
            status = ptrQuery.match === 'OK' ? 'OK' : 'FAIL';
          }
          
          const vmta = s.vmtaDetails && s.vmtaDetails[ip] ? s.vmtaDetails[ip] : '—';

          ipsMap.set(ip, {
            ip,
            ptr: ptrStr,
            vmta,
            status
          });
        }
      };

      if (s.mainIp) addIp(s.mainIp);
      if (s.ipDomains) {
        s.ipDomains.forEach(d => addIp(d.ip));
      }

      if (ipsMap.size > 0) {
        rows.push({
          serverId: s.id,
          serverName: s.serverName,
          ips: Array.from(ipsMap.values())
        });
      }
    });
  }

  return (
    <div className="infra-page animate-fade-in">
      <div className="infra-header">
        <div className="infra-title">
          <h1>Infrastructure Check</h1>
          <p>Verify PTR records and Sync VMTA mappings from Gmail.</p>
        </div>
        <div className="infra-actions">
          <button 
            className="btn-blue" 
            onClick={handleCheckRdns}
            disabled={isAuditing}
          >
            {isAuditing ? 'Checking...' : '🛡️ Check RDNS'}
          </button>
          <button 
            className="btn-red" 
            onClick={handleSyncVmta}
            disabled={isSyncing}
          >
            {isSyncing ? 'Syncing...' : '✉️ Sync VMTA from Gmail'}
          </button>
        </div>
      </div>

      <div className="infra-tabs">
        {teams.map(team => {
          const count = team.servers.filter(s => s.status !== 'deleted').length;
          return (
            <button
              key={team.name}
              className={`infra-tab ${activeTeam === team.name ? 'active' : ''}`}
              onClick={() => setActiveTeam(team.name)}
            >
              <span className="tab-name">👥 {team.name}</span>
              <span className="infra-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="infra-table-container">
        <table className="infra-table">
          <thead>
            <tr>
              <th>Server</th>
              <th>IP Address</th>
              <th>Reverse DNS (PTR)</th>
              <th>VMTA</th>
              <th style={{ textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <React.Fragment key={row.serverId}>
                  {row.ips.map((ipInfo, idx) => (
                    <tr key={`${row.serverId}-${ipInfo.ip}`}>
                      {idx === 0 && (
                        <td 
                          rowSpan={row.ips.length} 
                          className="server-cell"
                        >
                          {row.serverName || '—'}
                        </td>
                      )}
                      <td className="ip-cell">{ipInfo.ip}</td>
                      <td className="rdns-val">{ipInfo.ptr}</td>
                      <td className="vmta-val">{ipInfo.vmta}</td>
                      <td style={{ textAlign: 'right' }} className={`status-${ipInfo.status.toLowerCase()}`}>
                        {ipInfo.status}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>No active servers found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
