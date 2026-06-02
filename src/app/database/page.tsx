'use client';

import { useState, useEffect } from 'react';
import './Database.css';

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
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('/').map(Number);
  if (!year || !month) return null;
  return new Date(year, month - 1, day);
}

function getMonthYear(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return 'Unknown Date';
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function isCurrentMonth(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

// Auto-calculate class based on number of IPs
function getClassFromIps(nbrIps: number): string {
  if (nbrIps >= 19 && nbrIps <= 35) return '/27';
  if (nbrIps >= 6 && nbrIps <= 18) return '/28';
  if (nbrIps >= 3 && nbrIps <= 6) return '/29';
  if (nbrIps > 35) return '/26 or less';
  return '—';
}

interface Team {
  name: string;
  servers: Server[];
}

export default function DatabasePage() {
  const [teams, setTeams] = useState<Team[]>([
    { name: 'REDA', servers: [] },
    { name: 'AMINE', servers: [] },
  ]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on initial mount
  useEffect(() => {
    const saved = localStorage.getItem('gestiq_teams_data');
    if (saved) {
      try {
        setTeams(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved data");
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever teams change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('gestiq_teams_data', JSON.stringify(teams));
    }
  }, [teams, isLoaded]);

  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterField, setFilterField] = useState<'all' | 'ip' | 'provider' | 'asn'>('all');
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    serverName: '',
    mainIp: '',
    provider: '',
    asn: '',
    dateEntre: '',
    dateSortie: '',
    nbrIps: '',
    classType: '',
  });

  const currentTeam = teams.find(t => t.name === activeTeam);
  
  // All servers not deleted
  const activeServers = currentTeam?.servers.filter(s => s.status !== 'deleted') || [];
  
  // Filter search
  const filteredActiveServers = activeServers.filter(s => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    if (filterField === 'ip') return s.mainIp.toLowerCase().includes(term);
    if (filterField === 'provider') return s.provider.toLowerCase().includes(term);
    if (filterField === 'asn') return s.asn.toLowerCase().includes(term);
    return (
      s.mainIp.toLowerCase().includes(term) ||
      s.provider.toLowerCase().includes(term) ||
      s.asn.toLowerCase().includes(term)
    );
  });

  const deletedServers = currentTeam?.servers.filter(s => s.status === 'deleted') || [];
  
  const monthDelCount = activeServers.filter(s => s.dateSortie && isCurrentMonth(s.dateSortie)).length;

  const handleAddServer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.mainIp || !formData.dateEntre) return;

    const nbrIps = Number(formData.nbrIps) || 0;
    const newServer: Server = {
      id: Date.now(),
      serverName: formData.serverName,
      mainIp: formData.mainIp,
      provider: formData.provider,
      asn: formData.asn,
      dateEntre: formData.dateEntre,
      dateSortie: formData.dateSortie,
      nbrIps: nbrIps,
      classType: getClassFromIps(nbrIps),
      status: 'active',
    };

    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? { ...t, servers: [...t.servers, newServer] }
          : t
      )
    );

    setFormData({ serverName: '', mainIp: '', provider: '', asn: '', dateEntre: '', dateSortie: '', nbrIps: '', classType: '' });
    setShowForm(false);
  };

  const handleBulkImport = () => {
    const lines = bulkText.trim().split('\n').filter(l => l.trim());
    const newServers: Server[] = [];

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 2 && parts[1]) {
        const nbrIps = Number(parts[6]) || 0;
        const dateSortie = parts[5] || '';
        newServers.push({
          id: Date.now() + Math.random(),
          serverName: parts[0] || '',
          mainIp: parts[1] || '',
          provider: parts[2] || '',
          asn: parts[3] || '',
          dateEntre: parts[4] || '',
          dateSortie: dateSortie,
          nbrIps: nbrIps,
          classType: getClassFromIps(nbrIps),
          status: 'active',
        });
      }
    }

    if (newServers.length > 0) {
      setTeams(prev =>
        prev.map(t =>
          t.name === activeTeam
            ? { ...t, servers: [...t.servers, ...newServers] }
            : t
        )
      );
      setBulkText('');
      setShowBulk(false);
    }
  };

  const handleDeleteToHistory = (serverId: number) => {
    // If it doesn't have a dateSortie, ask for it so we know which month to put it in
    const serverToDel = currentTeam?.servers.find(s => s.id === serverId);
    let ds = serverToDel?.dateSortie;
    
    if (!ds) {
      const promptDate = window.prompt("Enter Date Sortie (DD/MM/YYYY) before deleting:");
      if (!promptDate) return;
      ds = promptDate;
    }

    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? {
              ...t,
              servers: t.servers.map(s => s.id === serverId ? { ...s, status: 'deleted', dateSortie: ds as string } : s)
            }
          : t
      )
    );
  };

  const handlePermanentDelete = (serverId: number) => {
    if(!window.confirm("Are you sure you want to permanently erase this server?")) return;
    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? { ...t, servers: t.servers.filter(s => s.id !== serverId) }
          : t
      )
    );
  };

  const handleClearAllHistory = () => {
    if(!window.confirm(`Clear all deleted history for ${activeTeam}? This cannot be undone.`)) return;
    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? { ...t, servers: t.servers.filter(s => s.status !== 'deleted') }
          : t
      )
    );
  };

  // Group deleted history by month
  const historyByMonth: Record<string, Server[]> = {};
  deletedServers.forEach(s => {
    const month = getMonthYear(s.dateSortie);
    if (!historyByMonth[month]) historyByMonth[month] = [];
    historyByMonth[month].push(s);
  });

  const sortedHistoryMonths = Object.keys(historyByMonth).sort((a, b) => {
    const da = new Date(a);
    const db = new Date(b);
    return (isNaN(db.getTime()) ? 0 : db.getTime()) - (isNaN(da.getTime()) ? 0 : da.getTime()); // Newest first
  });

  return (
    <div className="database-page animate-fade-in">
      <header className="db-header">
        <div>
          <h1>Database</h1>
          <p className="db-subtitle">Central data hub — Teams &amp; Servers</p>
        </div>
        <div className="db-toolbar-tabs">
          <div className="db-tabs">
            {teams.map(team => (
              <button
                key={team.name}
                className={`db-tab ${activeTeam === team.name ? 'active' : ''}`}
                onClick={() => { setActiveTeam(team.name); setSearchTerm(''); }}
              >
                <span>👥</span>
                <span>{team.name}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="db-toolbar">
        <div className="db-toolbar-right">
          <div className="db-filter">
            <select
              className="filter-select"
              value={filterField}
              onChange={(e) => setFilterField(e.target.value as 'all' | 'ip' | 'provider' | 'asn')}
            >
              <option value="all">All Fields</option>
              <option value="ip">IP</option>
              <option value="provider">Provider</option>
              <option value="asn">ASN</option>
            </select>
          </div>
          <div className="db-search">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder={`Search ${filterField === 'all' ? 'servers' : filterField}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button className="add-server-btn" onClick={() => { setShowForm(!showForm); setShowBulk(false); }}>
            {showForm ? '✕ Cancel' : '+ Add Server'}
          </button>
          <button className="bulk-import-btn" onClick={() => { setShowBulk(!showBulk); setShowForm(false); }}>
            {showBulk ? '✕ Cancel' : '📋 Bulk Import'}
          </button>
        </div>
      </div>

      {/* Bulk Import */}
      {showBulk && (
        <div className="bulk-form animate-fade-in">
          <h3>📋 Bulk Import Servers to {activeTeam}</h3>
          <p className="bulk-hint">Paste one server per line. Format: <code>ServerName , IP , Provider , ASN , DateEntre , DateSortie , NbrIPs , Class</code></p>
          <p className="bulk-example">Example: <code>SRV-01 , 192.168.1.1 , OVH , AS16276 , 01/03/2026 , , 256 , C</code></p>
          <textarea
            className="bulk-textarea"
            rows={10}
            placeholder={'SRV-01 , 192.168.1.1 , OVH , AS16276 , 01/03/2026 , , 256 , C\nSRV-02 , 10.0.0.1 , Hetzner , AS24940 , 15/02/2026 , , 512 , B'}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <div className="bulk-actions">
            <span className="bulk-count">{bulkText.trim().split('\n').filter(l => l.trim()).length} server(s) detected</span>
            <button className="submit-btn" onClick={handleBulkImport}>✓ Import All</button>
          </div>
        </div>
      )}

      {/* Add Server Form */}
      {showForm && (
        <form className="add-form animate-fade-in" onSubmit={handleAddServer}>
          <h3>➕ Add Server to {activeTeam}</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Server Name</label>
              <input
                type="text"
                placeholder="SRV-01"
                value={formData.serverName}
                onChange={(e) => setFormData({ ...formData, serverName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Main IP *</label>
              <input
                type="text"
                placeholder="192.168.1.1"
                value={formData.mainIp}
                onChange={(e) => setFormData({ ...formData, mainIp: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Provider</label>
              <input
                type="text"
                placeholder="OVH, Hetzner..."
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>ASN</label>
              <input
                type="text"
                placeholder="AS16276"
                value={formData.asn}
                onChange={(e) => setFormData({ ...formData, asn: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Date Entrée * (DD/MM/YYYY)</label>
              <input
                type="text"
                placeholder="01/03/2026"
                value={formData.dateEntre}
                onChange={(e) => setFormData({ ...formData, dateEntre: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Notice Date (Date Sortie)</label>
              <input
                type="text"
                placeholder="DD/MM/YYYY"
                value={formData.dateSortie}
                onChange={(e) => setFormData({ ...formData, dateSortie: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Nbr IPs</label>
              <input
                type="number"
                placeholder="6"
                value={formData.nbrIps}
                onChange={(e) => setFormData({ ...formData, nbrIps: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Class (auto)</label>
              <div className="auto-class-display">
                {formData.nbrIps ? getClassFromIps(Number(formData.nbrIps)) : '—'}
              </div>
            </div>
          </div>
          <button type="submit" className="submit-btn">✓ Add Server</button>
        </form>
      )}

      {/* --- Main Active Table --- */}
      <div className="team-board-container animate-fade-in">
        <div className="board-header">
          <div className="board-header-left">
            <h2>{activeTeam}</h2>
          </div>
          <div className="board-header-right">
            <span className="stat-active">ACTIVE: <strong>{activeServers.length} Servers</strong></span>
            <span className="stat-del">MONTH DEL: <strong>{monthDelCount}</strong></span>
          </div>
        </div>

        <div className="db-table-container no-border-radius-top">
          <table className="db-table clean-table">
            <thead>
              <tr>
                <th>Server</th>
                <th>Main IP</th>
                <th>DateEntre</th>
                <th>Notice Date</th>
                <th style={{textAlign: 'right'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredActiveServers.length > 0 ? (
                filteredActiveServers.map((s) => (
                  <tr key={s.id}>
                    <td className="td-name">{s.serverName || '—'}</td>
                    <td className="td-ip">{s.mainIp}</td>
                    <td className="td-date">{s.dateEntre}</td>
                    <td>
                      {s.dateSortie ? (
                        <span className="notice-date">⚠️ {s.dateSortie}</span>
                      ) : (
                        <span className="td-date">—</span>
                      )}
                    </td>
                    <td style={{textAlign: 'right'}}>
                      <div className="action-buttons-right">
                        <button className="minimal-btn" title="Edit">Edit</button>
                        <button className="minimal-btn danger" title="Delete to History" onClick={() => handleDeleteToHistory(s.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty-row">No active servers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Deleted History --- */}
      <div className="deleted-history-section animate-fade-in">
        <div className="history-header">
          <h2>{activeTeam} - DELETED HISTORY</h2>
          <div className="history-actions">
            <span className="history-count">{deletedServers.length} Records</span>
            <button className="clear-all-btn" onClick={handleClearAllHistory}>Clear All</button>
          </div>
        </div>
        
        {sortedHistoryMonths.length > 0 ? (
          <div className="history-months-container">
            {sortedHistoryMonths.map(month => (
              <div key={month} className="history-month-block">
                <h3 className="history-month-title">📅 {month}</h3>
                <table className="db-table clean-table history-table">
                  <thead>
                    <tr>
                      <th>Server</th>
                      <th>Main IP</th>
                      <th>DateSortie</th>
                      <th style={{textAlign: 'right'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyByMonth[month].map((s) => (
                      <tr key={s.id}>
                        <td className="td-name">{s.serverName || '—'}</td>
                        <td className="td-ip">{s.mainIp}</td>
                        <td className="notice-date">{s.dateSortie}</td>
                        <td style={{textAlign: 'right'}}>
                          <div className="action-buttons-right">
                            <button className="minimal-btn" onClick={() => handlePermanentDelete(s.id)}>Perm Del</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-history">
            <p>No deleted history for {activeTeam}.</p>
          </div>
        )}
      </div>

    </div>
  );
}
