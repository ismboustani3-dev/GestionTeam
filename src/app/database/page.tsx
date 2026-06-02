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
  status?: 'active' | 'deleted';
  dateDeclaration?: string;
  ipDomains?: { ip: string, domain: string }[];
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

function getNoticeColorClass(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return 'normal';
  
  const now = new Date();
  // reset time to midnight for accurate day diff
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  
  const diffTime = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 3) return 'urgent';
  if (diffDays <= 7) return 'warning';
  return 'normal';
}

// Auto-calculate class based on number of IPs
function getClassFromIps(nbrIps: number): string {
  if (nbrIps >= 19 && nbrIps <= 35) return '27';
  if (nbrIps >= 7 && nbrIps <= 18) return '28';
  if (nbrIps >= 3 && nbrIps <= 6) return '29';
  if (nbrIps > 35) return '26 or less';
  return '—';
}

function getServerAge(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return '—';
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  
  const diffTime = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'Future';
  if (diffDays === 0) return 'Today';
  return `${diffDays} days`;
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
  const [showBulkCancel, setShowBulkCancel] = useState(false);
  const [editingServerId, setEditingServerId] = useState<number | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [bulkCancelText, setBulkCancelText] = useState('');
  const [showBulkIpDomain, setShowBulkIpDomain] = useState(false);
  const [bulkIpDomainText, setBulkIpDomainText] = useState('');
  const [sortIp, setSortIp] = useState<'default' | 'min' | 'max'>('default');

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
  
  const monthDelCount = deletedServers.filter(s => s.dateSortie && isCurrentMonth(s.dateSortie)).length;
  const monthNewCount = activeServers.filter(s => s.dateEntre && isCurrentMonth(s.dateEntre)).length;
  const currentMonthName = new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase();

  const ipToNumber = (ip: string) => {
    if (!ip) return 0;
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  };

  const sortedServers = [...filteredActiveServers].sort((a, b) => {
    if (sortIp === 'default') return 0;
    const ipA = ipToNumber(a.mainIp);
    const ipB = ipToNumber(b.mainIp);
    return sortIp === 'min' ? ipA - ipB : ipB - ipA;
  });

  const handleAddServer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.mainIp || !formData.dateEntre) return;

    // Duplicate Check Function
    const isDuplicate = (name: string, ip: string, excludeId?: number) => {
      for (const t of teams) {
        for (const s of t.servers) {
          if (s.status === 'deleted') continue;
          if (excludeId && s.id === excludeId) continue;
          if (name && s.serverName && s.serverName.toLowerCase() === name.toLowerCase()) return true;
          if (ip && s.mainIp === ip) return true;
        }
      }
      return false;
    };

    if (isDuplicate(formData.serverName, formData.mainIp, editingServerId || undefined)) {
      alert("A server with this Name or IP already exists in the active tables!");
      return;
    }

    const nbrIps = Number(formData.nbrIps) || 0;
    const serverData: Server = {
      id: editingServerId || Date.now(),
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
          ? { 
              ...t, 
              servers: editingServerId 
                ? t.servers.map(s => s.id === editingServerId ? { ...s, ...serverData } : s)
                : [...t.servers, serverData]
            }
          : t
      )
    );

    setFormData({ serverName: '', mainIp: '', provider: '', asn: '', dateEntre: '', dateSortie: '', nbrIps: '', classType: '' });
    setShowForm(false);
    setEditingServerId(null);
  };

  const handleEditClick = (server: Server) => {
    setEditingServerId(server.id);
    setFormData({
      serverName: server.serverName || '',
      mainIp: server.mainIp || '',
      provider: server.provider || '',
      asn: server.asn || '',
      dateEntre: server.dateEntre || '',
      dateSortie: server.dateSortie || '',
      nbrIps: server.nbrIps ? String(server.nbrIps) : '',
      classType: server.classType || ''
    });
    setShowForm(true);
    setShowBulk(false);
    setShowBulkCancel(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBulkImport = () => {
    const lines = bulkText.trim().split('\n').filter(l => l.trim());
    const newServers: Server[] = [];

    const isDuplicateBatch = (name: string, ip: string) => {
      // Check existing
      for (const t of teams) {
        for (const s of t.servers) {
          if (s.status === 'deleted') continue;
          if (name && s.serverName && s.serverName.toLowerCase() === name.toLowerCase()) return true;
          if (ip && s.mainIp === ip) return true;
        }
      }
      // Check already parsed in this batch
      for (const s of newServers) {
        if (name && s.serverName && s.serverName.toLowerCase() === name.toLowerCase()) return true;
        if (ip && s.mainIp === ip) return true;
      }
      return false;
    };

    let skipped = 0;

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 2 && parts[1]) {
        if (isDuplicateBatch(parts[0], parts[1])) {
          skipped++;
          continue;
        }
        
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
          classType: parts[7] || getClassFromIps(nbrIps),
          status: 'active',
        });
      }
    }

    if (skipped > 0) {
      alert(`${skipped} server(s) were skipped because they already exist.`);
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

  const handleBulkCancel = () => {
    // Extract server names (split by commas, newlines, or spaces)
    const serverNamesToCancel = bulkCancelText
      .split(/[\n, ]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s);

    if (serverNamesToCancel.length === 0) return;

    // Auto calculate today's date in DD/MM/YYYY
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const todayFormatted = `${dd}/${mm}/${yyyy}`;

    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? {
              ...t,
              servers: t.servers.map(s => {
                if (serverNamesToCancel.includes(s.serverName.toLowerCase())) {
                  return { ...s, status: 'deleted', dateSortie: todayFormatted, dateDeclaration: todayFormatted };
                }
                return s;
              })
            }
          : t
      )
    );

    setBulkCancelText('');
    setShowBulkCancel(false);
  };

  const handleBulkIpDomain = () => {
    const lines = bulkIpDomainText.trim().split('\n').filter(l => l.trim());
    const updates = new Map<string, {ip: string, domain: string}[]>();
    
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 3) {
        const serverName = parts[0].trim().toLowerCase();
        const ip = parts[1].trim();
        const domain = parts.slice(2).join(':').trim();
        if (!updates.has(serverName)) {
          updates.set(serverName, []);
        }
        updates.get(serverName)!.push({ip, domain});
      }
    }

    setTeams(prev => prev.map(t => {
      if (t.name === activeTeam) {
        return {
          ...t,
          servers: t.servers.map(s => {
            const sname = s.serverName.toLowerCase();
            if (updates.has(sname)) {
              const currentDomains = s.ipDomains || [];
              const newMappings = [...currentDomains, ...updates.get(sname)!];
              
              const allIps = new Set(newMappings.map(m => m.ip));
              if (s.mainIp) allIps.add(s.mainIp);
              const totalIpsCount = allIps.size;

              return { 
                ...s, 
                ipDomains: newMappings,
                nbrIps: totalIpsCount,
                classType: getClassFromIps(totalIpsCount)
              };
            }
            return s;
          })
        };
      }
      return t;
    }));

    setBulkIpDomainText('');
    setShowBulkIpDomain(false);
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

    // Auto calculate today's date
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const todayFormatted = `${dd}/${mm}/${yyyy}`;

    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? {
              ...t,
              servers: t.servers.map(s => s.id === serverId ? { ...s, status: 'deleted', dateSortie: ds as string, dateDeclaration: todayFormatted } : s)
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
            {teams.map(team => {
              const activeCount = team.servers.filter(s => s.status !== 'deleted').length;
              const cancelCount = team.servers.filter(s => s.status === 'deleted' && s.dateSortie && isCurrentMonth(s.dateSortie)).length;
              return (
                <button
                  key={team.name}
                  className={`db-tab ${activeTeam === team.name ? 'active' : ''}`}
                  onClick={() => { setActiveTeam(team.name); setSearchTerm(''); }}
                >
                  <span className="tab-name">👥 {team.name}</span>
                  <div className="team-counters">
                    <span className="team-counter-green" title="Active Servers">{activeCount}</span>
                    <span className="team-counter-red" title="Servers to Cancel">{cancelCount}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="db-toolbar">
        <div className="db-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            ⇅ Sort by IP:
          </span>
          <div className="db-filter">
            <select
              className="filter-select"
              value={sortIp}
              onChange={(e) => setSortIp(e.target.value as 'default' | 'min' | 'max')}
            >
              <option value="default">Default</option>
              <option value="min">Min IP (Low to High)</option>
              <option value="max">Max IP (High to Low)</option>
            </select>
          </div>
        </div>
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
          <button className="add-server-btn" onClick={() => { 
            if (!showForm) {
              setEditingServerId(null);
              setFormData({ serverName: '', mainIp: '', provider: '', asn: '', dateEntre: '', dateSortie: '', nbrIps: '', classType: '' });
            }
            setShowForm(!showForm); 
            setShowBulk(false); 
            setShowBulkCancel(false); 
            setShowBulkIpDomain(false);
          }}>
            {showForm && !editingServerId ? '✕ Cancel' : '+ Add Server'}
          </button>
          <button className="bulk-import-btn" onClick={() => { setShowBulk(!showBulk); setShowForm(false); setShowBulkCancel(false); setShowBulkIpDomain(false); }}>
            {showBulk ? '✕ Cancel' : '📋 Bulk Import'}
          </button>
          <button className="bulk-cancel-btn" onClick={() => { setShowBulkCancel(!showBulkCancel); setShowForm(false); setShowBulk(false); setShowBulkIpDomain(false); }}>
            {showBulkCancel ? '✕ Cancel' : '🗑️ Bulk Cancel'}
          </button>
          <button className="bulk-import-btn" style={{background: 'linear-gradient(135deg, #10b981, #3b82f6)'}} onClick={() => { setShowBulkIpDomain(!showBulkIpDomain); setShowForm(false); setShowBulk(false); setShowBulkCancel(false); }}>
            {showBulkIpDomain ? '✕ Cancel' : '🌐 Map IPs & Domains'}
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

      {/* Bulk Cancel */}
      {showBulkCancel && (
        <div className="bulk-form animate-fade-in" style={{ borderColor: 'rgba(248, 113, 113, 0.4)' }}>
          <h3 style={{ color: '#f87171' }}>🗑️ Bulk Cancel Servers</h3>
          <p className="bulk-hint">Paste your list of server names to cancel (separated by commas, spaces, or newlines).</p>
          <p className="bulk-example">Example: <code>srv-01, srv-02, srv-03</code></p>
          <textarea
            className="bulk-textarea"
            rows={5}
            placeholder={'s_wmn3_2182\ns_wmn3_2180\ns_wmn3_2159'}
            value={bulkCancelText}
            onChange={(e) => setBulkCancelText(e.target.value)}
          />
          <div className="bulk-actions">
            <span className="bulk-count">{bulkCancelText.split(/[\n, ]+/).filter(l => l.trim()).length} server(s) detected</span>
            <button className="submit-btn danger-submit" onClick={handleBulkCancel}>🗑️ Cancel All</button>
          </div>
        </div>
      )}

      {/* Bulk Map IP Domains */}
      {showBulkIpDomain && (
        <div className="bulk-form animate-fade-in" style={{ borderColor: 'rgba(56, 189, 248, 0.4)' }}>
          <h3 style={{ color: '#38bdf8' }}>🌐 Map IPs & Domains to Servers</h3>
          <p className="bulk-hint">Paste your list in the exact format: <code>ServerName:IP:Domain</code> (one per line).</p>
          <p className="bulk-example">Example:<br/><code>server1:192.168.1.1:domain.com</code><br/><code>server1:10.0.0.5:domain2.com</code></p>
          <textarea
            className="bulk-textarea"
            rows={5}
            placeholder={'srv-01:1.1.1.1:test.com\nsrv-01:2.2.2.2:example.com'}
            value={bulkIpDomainText}
            onChange={(e) => setBulkIpDomainText(e.target.value)}
          />
          <div className="bulk-actions">
            <span className="bulk-count">{bulkIpDomainText.split('\n').filter(l => l.trim()).length} mapping(s) detected</span>
            <button className="submit-btn" style={{background: 'linear-gradient(135deg, #10b981, #3b82f6)'}} onClick={handleBulkIpDomain}>✓ Save Mappings</button>
          </div>
        </div>
      )}

      {/* Add / Edit Server Form */}
      {showForm && (
        <form className="add-form animate-fade-in" onSubmit={handleAddServer}>
          <h3>{editingServerId ? `✏️ Edit Server in ${activeTeam}` : `➕ Add Server to ${activeTeam}`}</h3>
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
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="submit-btn">
              {editingServerId ? '✓ Update Server' : '✓ Add Server'}
            </button>
            {editingServerId && (
              <button 
                type="button" 
                className="minimal-btn" 
                style={{ padding: '0.75rem 2rem', fontSize: '0.9rem', border: '1px solid var(--glass-border)' }}
                onClick={() => {
                  setShowForm(false);
                  setEditingServerId(null);
                  setFormData({ serverName: '', mainIp: '', provider: '', asn: '', dateEntre: '', dateSortie: '', nbrIps: '', classType: '' });
                }}
              >
                Cancel
              </button>
            )}
          </div>
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
            <span className="stat-new">NEW SERVER ADD: <strong>{monthNewCount} {currentMonthName}</strong></span>
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
                <th>Age</th>
                <th>Notice Date</th>
                <th style={{textAlign: 'right'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredActiveServers.sort((a, b) => {
                if (sortIp === 'min') return ipToNumber(a.mainIp) - ipToNumber(b.mainIp);
                if (sortIp === 'max') return ipToNumber(b.mainIp) - ipToNumber(a.mainIp);
                return 0;
              }).length > 0 ? (
                filteredActiveServers.map((s) => (
                  <tr key={s.id}>
                    <td className="td-name">{s.serverName || '—'}</td>
                    <td className="td-ip">{s.mainIp}</td>
                    <td className="td-date">{s.dateEntre}</td>
                    <td className="td-date" style={{ color: '#94a3b8' }}>{getServerAge(s.dateEntre)}</td>
                    <td>
                      {s.dateSortie ? (
                        <span className={`notice-badge ${getNoticeColorClass(s.dateSortie)}`}>⚠️ {s.dateSortie}</span>
                      ) : (
                        <span className="td-date">—</span>
                      )}
                    </td>
                    <td style={{textAlign: 'right'}}>
                      <div className="action-buttons-right">
                        <button className="minimal-btn" title="Edit" onClick={() => handleEditClick(s)}>Edit</button>
                        <button className="minimal-btn danger" title="Delete to History" onClick={() => handleDeleteToHistory(s.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-row">No active servers found.</td>
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
                      <th>DateEntre</th>
                      <th>DateSortie</th>
                      <th>Jour Declaration</th>
                      <th style={{textAlign: 'right'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyByMonth[month].map((s) => (
                      <tr key={s.id}>
                        <td className="td-name">{s.serverName || '—'}</td>
                        <td className="td-ip">{s.mainIp}</td>
                        <td>{s.asn}</td>
                        <td>{s.dateEntre}</td>
                        <td>{s.dateSortie ? <span className={`notice-badge ${getNoticeColorClass(s.dateSortie)}`}>⚠️ {s.dateSortie}</span> : '—'}</td>
                        <td className="text-center">{s.nbrIps}</td>
                        <td className="td-date">{s.dateDeclaration || s.dateSortie || '—'}</td>
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
