'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { loadTeamsFromFirebase, loadWarmupFromFirebase, saveWarmupToFirebase } from '@/lib/firebaseTeams';
import './Warmup.css';

interface WarmupHistoryEntry {
  day: number;
  sent: number;
  inbox: number;
  spam: number;
  date: string;
  status: 'Warmup' | 'Ready' | 'Alert' | 'Paused';
}

interface WarmupServer {
  id: string;
  serverName: string;
  serverStatus?: string;
  ip: string;
  currentDay: number;
  status: 'Warmup' | 'Ready' | 'Alert' | 'Paused';
  sent: number;
  inbox: number;
  spam: number;
  history: WarmupHistoryEntry[];
}

export default function SuiviWarmupPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [warmupData, setWarmupData] = useState<Record<string, WarmupServer[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Import Panel State
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importText, setImportText] = useState('');

  // History Modal State
  const [selectedServer, setSelectedServer] = useState<WarmupServer | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // New History Entry Form State
  const [newHistDay, setNewHistDay] = useState<string>('');
  const [newHistSent, setNewHistSent] = useState<string>('');
  const [newHistInbox, setNewHistInbox] = useState<string>('');
  const [newHistSpam, setNewHistSpam] = useState<string>('');
  const [newHistStatus, setNewHistStatus] = useState<'Warmup' | 'Ready' | 'Alert' | 'Paused'>('Warmup');
  const [newHistDate, setNewHistDate] = useState<string>('');

  // Fetch initial teams and warmup logs
  useEffect(() => {
    const fetchData = async () => {
      try {
        const fbTeams = await loadTeamsFromFirebase();
        if (fbTeams && fbTeams.length > 0) {
          setTeams(fbTeams);
          setActiveTeam(fbTeams[0].name || 'REDA');
        } else {
          // Fallback teams
          setTeams([{ name: 'REDA', servers: [] }, { name: 'AMINE', servers: [] }]);
        }

        const fbWarmup = await loadWarmupFromFirebase();
        if (fbWarmup) {
          setWarmupData(fbWarmup);
        }
      } catch (err) {
        console.error('Error fetching warmup data:', err);
      } finally {
        setIsLoaded(true);
      }
    };
    fetchData();
  }, []);

  // Set default history date whenever modal opens
  useEffect(() => {
    if (selectedServer) {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      setNewHistDate(`${dd}/${mm}/${yyyy}`);
      
      // Auto-increment day in helper
      const nextDay = selectedServer.history.length > 0 
        ? Math.max(...selectedServer.history.map(h => h.day)) + 1 
        : selectedServer.currentDay + 1;
      setNewHistDay(nextDay.toString());
      setNewHistSent('');
      setNewHistInbox('');
      setNewHistSpam('');
      setNewHistStatus(selectedServer.status);
    }
  }, [selectedServer]);

  // Show status toasts
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Sync / Save to Firebase
  const triggerSave = async (updatedData: Record<string, WarmupServer[]>) => {
    setWarmupData(updatedData);
    await saveWarmupToFirebase(updatedData);
  };

  // Switch Team handler
  const handleTeamChange = (teamName: string) => {
    setActiveTeam(teamName);
  };

  // Merge team server database inventory with saved warmup records
  const currentServers = useMemo(() => {
    const activeTeamObj = teams.find(t => t.name === activeTeam);
    const dbServers = activeTeamObj?.servers?.filter((s: any) => s.status !== 'deleted') || [];
    const savedWarmupList = warmupData[activeTeam] || [];

    const todayStr = new Date().toLocaleDateString('fr-FR');

    return dbServers.map((dbS: any) => {
      // Find matching saved log by case-insensitive Server Name
      const existingWarmup = savedWarmupList.find(
        (w: WarmupServer) => w.serverName.toLowerCase() === dbS.serverName.toLowerCase()
      );

      if (existingWarmup) {
        // Return existing, but enforce newest IP and Server Name from DB
        return {
          ...existingWarmup,
          serverName: dbS.serverName,
          serverStatus: dbS.status,
          ip: dbS.mainIp || existingWarmup.ip || ''
        };
      }

      // Initial default details for database server not yet warmed up
      const defaultDay = 1;
      return {
        id: `warmup_db_${dbS.id || Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        serverName: dbS.serverName,
        serverStatus: dbS.status,
        ip: dbS.mainIp || '',
        currentDay: defaultDay,
        status: 'Warmup',
        sent: 0,
        inbox: 0,
        spam: 0,
        history: [
          {
            day: defaultDay,
            sent: 0,
            inbox: 0,
            spam: 0,
            status: 'Warmup',
            date: todayStr
          }
        ]
      } as WarmupServer;
    });
  }, [teams, activeTeam, warmupData]);

  // Filtered Warmup list based on Search Query
  const filteredServers = useMemo(() => {
    if (!searchQuery) return currentServers;
    const q = searchQuery.toLowerCase();
    return currentServers.filter(
      (s: WarmupServer) => s.serverName.toLowerCase().includes(q) || s.ip.toLowerCase().includes(q)
    );
  }, [currentServers, searchQuery]);

  // Metrics calculations for selected team
  const metrics = useMemo(() => {
    let active = 0;
    let ready = 0;
    let alert = 0;
    let totalSent = 0;

    currentServers.forEach((s: WarmupServer) => {
      if (s.status === 'Warmup') active++;
      else if (s.status === 'Ready') ready++;
      else if (s.status === 'Alert') alert++;
      
      totalSent += s.sent || 0;
    });

    return { active, ready, alert, totalSent };
  }, [currentServers]);

  // Inline update helper for a specific server (linked with DB name matching)
  const handleUpdateServer = (serverName: string, field: keyof WarmupServer, value: any) => {
    const savedWarmupList = [...(warmupData[activeTeam] || [])];
    const index = savedWarmupList.findIndex(
      s => s.serverName.toLowerCase() === serverName.toLowerCase()
    );

    const todayStr = new Date().toLocaleDateString('fr-FR');

    let targetServer: WarmupServer;

    if (index > -1) {
      targetServer = { ...savedWarmupList[index] };
    } else {
      const dbS = teams.find(t => t.name === activeTeam)?.servers?.find(
        (s: any) => s.serverName.toLowerCase() === serverName.toLowerCase()
      );
      const defaultDay = 1;
      targetServer = {
        id: `warmup_db_${dbS?.id || Date.now()}`,
        serverName: serverName,
        ip: dbS?.mainIp || '',
        currentDay: defaultDay,
        status: 'Warmup',
        sent: 0,
        inbox: 0,
        spam: 0,
        history: [
          {
            day: defaultDay,
            sent: 0,
            inbox: 0,
            spam: 0,
            status: 'Warmup',
            date: todayStr
          }
        ]
      };
    }

    // Apply the edit
    const updatedServer = { ...targetServer, [field]: value };

    // Synchronize latest stats into server's history
    const dayToSync = updatedServer.currentDay;
    if (!updatedServer.history) {
      updatedServer.history = [];
    }

    const historyEntry: WarmupHistoryEntry = {
      day: dayToSync,
      sent: updatedServer.sent,
      inbox: updatedServer.inbox,
      spam: updatedServer.spam,
      status: updatedServer.status,
      date: todayStr
    };

    const histIndex = updatedServer.history.findIndex(h => h.day === dayToSync);
    if (histIndex > -1) {
      updatedServer.history[histIndex] = historyEntry;
    } else {
      updatedServer.history.push(historyEntry);
    }

    updatedServer.history.sort((a, b) => a.day - b.day);

    if (index > -1) {
      savedWarmupList[index] = updatedServer;
    } else {
      savedWarmupList.push(updatedServer);
    }

    const updated = {
      ...warmupData,
      [activeTeam]: savedWarmupList
    };
    triggerSave(updated);
  };

  // Reset and clear warmup logs for server
  const handleResetWarmupLogs = (serverName: string) => {
    if (!confirm(`Are you sure you want to reset and clear warmup logs for ${serverName}?`)) return;
    
    const savedWarmupList = warmupData[activeTeam] || [];
    const updatedList = savedWarmupList.filter(
      s => s.serverName.toLowerCase() !== serverName.toLowerCase()
    );

    const updated = {
      ...warmupData,
      [activeTeam]: updatedList
    };
    triggerSave(updated);
    showToast(`Warmup logs reset for ${serverName}`);
  };

  // Import panel log parser
  const handleImportLogs = () => {
    if (!importText.trim()) return;

    try {
      const lines = importText.split('\n');
      const savedWarmupList = [...(warmupData[activeTeam] || [])];
      const todayStr = new Date().toLocaleDateString('fr-FR');
      let importCount = 0;

      let tempServer: Partial<WarmupServer> & { day?: number } = {};

      const parseKeyValue = (line: string) => {
        const parts = line.split(/[:|=]/);
        if (parts.length < 2) return false;
        const key = parts[0].trim().toLowerCase();
        const val = parts.slice(1).join(':').trim();

        if (key.includes('server') || key.includes('srv')) tempServer.serverName = val;
        else if (key.includes('ip')) tempServer.ip = val;
        else if (key.includes('day') || key.includes('step')) tempServer.day = parseInt(val, 10);
        else if (key.includes('sent')) tempServer.sent = parseInt(val, 10);
        else if (key.includes('inbox') || key.includes('rp test') || key.includes('deliver')) tempServer.inbox = parseInt(val, 10);
        else if (key.includes('spam')) tempServer.spam = parseInt(val, 10);
        else if (key.includes('status')) tempServer.status = val as any;
        return true;
      };

      lines.forEach(line => {
        const cleanLine = line.trim();
        if (!cleanLine) {
          if (tempServer.serverName) {
            saveParsedServer(tempServer, savedWarmupList, todayStr);
            importCount++;
            tempServer = {};
          }
          return;
        }

        const isKV = parseKeyValue(cleanLine);

        if (!isKV) {
          const parts = cleanLine.split(/[,;\t|]/);
          if (parts.length >= 3) {
            const sName = parts[0].trim();
            const ipVal = parts[1].trim();
            const dayVal = parseInt(parts[2].replace(/[^\d]/g, ''), 10) || 1;
            const sentVal = parseInt(parts[3] || '0', 10) || 0;
            const inboxVal = parseInt(parts[4] || '0', 10) || 0;
            const spamVal = parseInt(parts[5] || '0', 10) || 0;
            const statusVal = (parts[6]?.trim() || 'Warmup') as any;

            if (sName) {
              const parsed = {
                serverName: sName,
                ip: ipVal,
                day: dayVal,
                sent: sentVal,
                inbox: inboxVal,
                spam: spamVal,
                status: statusVal
              };
              saveParsedServer(parsed, savedWarmupList, todayStr);
              importCount++;
            }
          }
        }
      });

      if (tempServer.serverName) {
        saveParsedServer(tempServer, savedWarmupList, todayStr);
        importCount++;
      }

      if (importCount > 0) {
        const updated = {
          ...warmupData,
          [activeTeam]: savedWarmupList
        };
        triggerSave(updated);
        showToast(`Parsed and saved ${importCount} logs`);
        setImportText('');
        setShowImportPanel(false);
      } else {
        showToast('Could not parse any logs. Check the format.');
      }
    } catch (err) {
      console.error(err);
      showToast('Import failed.');
    }
  };

  const saveParsedServer = (
    parsed: Partial<WarmupServer> & { day?: number }, 
    savedList: WarmupServer[],
    todayStr: string
  ) => {
    const name = parsed.serverName;
    if (!name) return;

    const dayNum = parsed.day || parsed.currentDay || 1;
    const sentNum = parsed.sent || 0;
    const inboxNum = parsed.inbox || 0;
    const spamNum = parsed.spam || 0;
    const statusVal = parsed.status || 'Warmup';

    const index = savedList.findIndex(s => s.serverName.toLowerCase() === name.toLowerCase());

    const historyEntry: WarmupHistoryEntry = {
      day: dayNum,
      sent: sentNum,
      inbox: inboxNum,
      spam: spamNum,
      status: statusVal,
      date: todayStr
    };

    if (index > -1) {
      const server = savedList[index];
      server.currentDay = dayNum;
      server.sent = sentNum;
      server.inbox = inboxNum;
      server.spam = spamNum;
      server.status = statusVal;

      if (!server.history) server.history = [];
      const hIndex = server.history.findIndex(h => h.day === dayNum);
      if (hIndex > -1) {
        server.history[hIndex] = historyEntry;
      } else {
        server.history.push(historyEntry);
      }
      server.history.sort((a, b) => a.day - b.day);
    } else {
      const dbS = teams.find(t => t.name === activeTeam)?.servers?.find(
        (s: any) => s.serverName.toLowerCase() === name.toLowerCase()
      );

      const newS: WarmupServer = {
        id: `warmup_db_${dbS?.id || Date.now()}`,
        serverName: name,
        ip: dbS?.mainIp || parsed.ip || '',
        currentDay: dayNum,
        sent: sentNum,
        inbox: inboxNum,
        spam: spamNum,
        status: statusVal,
        history: [historyEntry]
      };
      savedList.push(newS);
    }
  };

  const getDeliverabilityClass = (inbox: number, spam: number, sent: number) => {
    const total = inbox + spam;
    const pct = total > 0 ? (inbox / total) * 100 : (sent > 0 ? (inbox / sent) * 100 : 0);
    if (pct >= 85) return 'excellent';
    if (pct >= 60) return 'average';
    return 'poor';
  };

  const getDeliverabilityText = (inbox: number, spam: number, sent: number) => {
    const total = inbox + spam;
    const pct = total > 0 ? (inbox / total) * 100 : (sent > 0 ? (inbox / sent) * 100 : 0);
    return `${pct.toFixed(1)}%`;
  };

  // Open history modal
  const openHistory = (server: WarmupServer) => {
    setSelectedServer(server);
    setShowHistoryModal(true);
  };

  // Close history modal
  const closeHistory = () => {
    setSelectedServer(null);
    setShowHistoryModal(false);
  };

  // Add/Update log inside modal
  const handleUpdateHistoryForServer = (updatedHistory: WarmupHistoryEntry[]) => {
    if (!selectedServer) return;

    const savedWarmupList = [...(warmupData[activeTeam] || [])];
    const index = savedWarmupList.findIndex(
      s => s.serverName.toLowerCase() === selectedServer.serverName.toLowerCase()
    );

    const newestEntry = updatedHistory[updatedHistory.length - 1];

    let targetServer: WarmupServer;
    if (index > -1) {
      targetServer = { ...savedWarmupList[index] };
    } else {
      const dbS = teams.find(t => t.name === activeTeam)?.servers?.find(
        (s: any) => s.serverName.toLowerCase() === selectedServer.serverName.toLowerCase()
      );
      targetServer = {
        id: `warmup_db_${dbS?.id || Date.now()}`,
        serverName: selectedServer.serverName,
        ip: dbS?.mainIp || selectedServer.ip || '',
        currentDay: 1,
        status: 'Warmup',
        sent: 0,
        inbox: 0,
        spam: 0,
        history: []
      };
    }

    const updatedServer: WarmupServer = {
      ...targetServer,
      history: updatedHistory,
      currentDay: newestEntry ? newestEntry.day : targetServer.currentDay,
      sent: newestEntry ? newestEntry.sent : 0,
      inbox: newestEntry ? newestEntry.inbox : 0,
      spam: newestEntry ? newestEntry.spam : 0,
      status: newestEntry ? newestEntry.status : 'Warmup'
    };

    if (index > -1) {
      savedWarmupList[index] = updatedServer;
    } else {
      savedWarmupList.push(updatedServer);
    }

    const updatedMap = {
      ...warmupData,
      [activeTeam]: savedWarmupList
    };

    triggerSave(updatedMap);
    setSelectedServer(updatedServer);
  };

  const handleAddHistoryLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer) return;

    const dayNum = parseInt(newHistDay, 10);
    const sentNum = parseInt(newHistSent, 10) || 0;
    const inboxNum = parseInt(newHistInbox, 10) || 0;
    const spamNum = parseInt(newHistSpam, 10) || 0;

    if (isNaN(dayNum) || dayNum <= 0) {
      alert('Please enter a valid day');
      return;
    }

    const newEntry: WarmupHistoryEntry = {
      day: dayNum,
      sent: sentNum,
      inbox: inboxNum,
      spam: spamNum,
      status: newHistStatus,
      date: newHistDate || new Date().toLocaleDateString('fr-FR')
    };

    const updatedHistory = [...selectedServer.history];
    const index = updatedHistory.findIndex(h => h.day === dayNum);
    if (index > -1) {
      updatedHistory[index] = newEntry;
    } else {
      updatedHistory.push(newEntry);
    }
    updatedHistory.sort((a, b) => a.day - b.day);

    handleUpdateHistoryForServer(updatedHistory);
    showToast(`Added log for Day ${dayNum}`);

    setNewHistDay((dayNum + 1).toString());
    setNewHistSent('');
    setNewHistInbox('');
    setNewHistSpam('');
  };

  const handleDeleteHistoryLog = (dayNum: number) => {
    if (!selectedServer) return;
    if (!confirm(`Are you sure you want to delete Day ${dayNum} history log?`)) return;

    const updatedHistory = selectedServer.history.filter(h => h.day !== dayNum);
    if (updatedHistory.length === 0) {
      alert('Keep at least one log entry in history.');
      return;
    }

    handleUpdateHistoryForServer(updatedHistory);
    showToast(`Deleted history log for Day ${dayNum}`);
  };

  return (
    <div className="warmup-container animate-fade-in">
      {/* Header */}
      <header className="warmup-header">
        <h1>🔥 Suivi Warmup</h1>
      </header>

      {/* Team Context selector */}
      <div className="team-selector-row">
        <label>CONTEXT TEAM:</label>
        {teams.map(t => (
          <button
            key={t.name}
            className={`team-badge-btn ${activeTeam === t.name ? 'active' : ''}`}
            onClick={() => handleTeamChange(t.name)}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Stats KPI Dashboard */}
      <section className="stats-cards-grid">
        <div className="stats-card-warmup active">
          <div className="stats-card-info">
            <h4>Active Warmups ({activeTeam})</h4>
            <div className="val">{metrics.active}</div>
          </div>
          <span className="stats-card-icon">🔥</span>
        </div>

        <div className="stats-card-warmup ready">
          <div className="stats-card-info">
            <h4>Ready Servers ({activeTeam})</h4>
            <div className="val">{metrics.ready}</div>
          </div>
          <span className="stats-card-icon">✅</span>
        </div>

        <div className="stats-card-warmup alert">
          <div className="stats-card-info">
            <h4>Warmup Alerts ({activeTeam})</h4>
            <div className="val">{metrics.alert}</div>
          </div>
          <span className="stats-card-icon">⚠️</span>
        </div>

        <div className="stats-card-warmup total-sent">
          <div className="stats-card-info">
            <h4>Total Sent Today ({activeTeam})</h4>
            <div className="val">{metrics.totalSent.toLocaleString()}</div>
          </div>
          <span className="stats-card-icon">📤</span>
        </div>
      </section>

      {/* Table section title and filters */}
      <div className="table-header-row">
        <h3>Database-Linked Servers</h3>
        <div className="table-actions">
          <input
            type="text"
            className="search"
            placeholder="Search by server or IP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Link href="/team-server-detail" className="btn-warmup add" style={{ textDecoration: 'none' }}>
            ⚙️ Manage Database
          </Link>
          <button 
            className="btn-warmup import" 
            onClick={() => setShowImportPanel(!showImportPanel)}
          >
            📥 Import Logs
          </button>
        </div>
      </div>

      {/* Bulk Import logs text area panel */}
      {showImportPanel && (
        <div className="import-panel-warmup">
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f97316' }}>
            PASTE BOT LOGS OR DELIMITED CSV LINES:
          </label>
          <textarea
            rows={6}
            placeholder="Server: srv-01&#10;IP: 1.2.3.4&#10;Day: 5&#10;Sent: 200&#10;Inbox: 150&#10;Spam: 50&#10;Status: Warmup"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button 
              className="btn-warmup import" 
              onClick={handleImportLogs} 
              style={{ background: '#f97316', color: '#fff' }}
            >
              Parse & Save 🚀
            </button>
            <button 
              className="btn-warmup delete" 
              onClick={() => setShowImportPanel(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main Warmup Data Table */}
      <div className="warmup-table-container">
        {!isLoaded ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading Warmup Data and Server Inventory...
          </div>
        ) : filteredServers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No active servers in the database inventory for team {activeTeam}. 
            <br />
            <Link href="/team-server-detail" style={{ color: '#f97316', textDecoration: 'underline', marginTop: '0.5rem', display: 'inline-block' }}>
              Click here to manage your Server Database.
            </Link>
          </div>
        ) : (
          <table className="warmup-table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Server Name</th>
                <th style={{ width: '160px' }}>IP Address</th>
                <th style={{ width: '220px' }}>Warmup Progress</th>
                <th style={{ width: '110px' }}>Sent</th>
                <th style={{ width: '110px' }}>Inbox</th>
                <th style={{ width: '110px' }}>Spam</th>
                <th style={{ width: '100px' }}>Inbox %</th>
                <th style={{ width: '140px' }}>Status</th>
                <th style={{ width: '180px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredServers.map((s: WarmupServer) => (
                <tr key={s.serverName} style={s.serverStatus === 'tocancel' ? { background: 'rgba(249, 115, 22, 0.08)' } : undefined}>
                  {/* Server Name (Read-Only label linked to DB) */}
                  <td style={{ fontWeight: 600, color: s.serverStatus === 'tocancel' ? '#f97316' : '#f8fafc', paddingLeft: '1.2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{s.serverName}</span>
                      {s.serverStatus === 'tocancel' && <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 'bold' }}>tocancel</span>}
                    </div>
                  </td>

                  {/* IP Address (Read-Only label linked to DB) */}
                  <td style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                    {s.ip || 'No IP'}
                  </td>

                  {/* Warmup Day / Progress bar */}
                  <td>
                    <div className="progress-label-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="progress-bar-container">
                          <div 
                            className="progress-bar-fill" 
                            style={{ width: `${Math.min((s.currentDay / 10) * 100, 100)}%` }}
                          />
                        </div>
                        <input
                          type="number"
                          style={{ 
                            width: '50px', 
                            background: 'rgba(255,255,255,0.05)', 
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '4px',
                            color: '#fff',
                            textAlign: 'center',
                            fontSize: '0.85rem',
                            padding: '0.1rem'
                          }}
                          value={s.currentDay}
                          onChange={(e) => handleUpdateServer(s.serverName, 'currentDay', parseInt(e.target.value, 10) || 1)}
                        />
                      </div>
                      <span className="progress-text">Step {s.currentDay}/10 Warmup Days</span>
                    </div>
                  </td>

                  {/* Sent */}
                  <td>
                    <div className="cell-input-wrapper">
                      <input
                        type="number"
                        value={s.sent}
                        onChange={(e) => handleUpdateServer(s.serverName, 'sent', parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                  </td>

                  {/* Inbox */}
                  <td>
                    <div className="cell-input-wrapper">
                      <input
                        type="number"
                        value={s.inbox}
                        onChange={(e) => handleUpdateServer(s.serverName, 'inbox', parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                  </td>

                  {/* Spam */}
                  <td>
                    <div className="cell-input-wrapper">
                      <input
                        type="number"
                        value={s.spam}
                        onChange={(e) => handleUpdateServer(s.serverName, 'spam', parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                  </td>

                  {/* Inbox % calculated */}
                  <td>
                    <span className={`inbox-pct ${getDeliverabilityClass(s.inbox, s.spam, s.sent)}`}>
                      {getDeliverabilityText(s.inbox, s.spam, s.sent)}
                    </span>
                  </td>

                  {/* Status Dropdown */}
                  <td>
                    <select
                      className={`status-select ${s.status.toLowerCase()}`}
                      value={s.status}
                      onChange={(e) => handleUpdateServer(s.serverName, 'status', e.target.value)}
                      style={{
                        color: s.status === 'Warmup' ? '#f97316' : 
                               s.status === 'Ready' ? '#10b981' : 
                               s.status === 'Alert' ? '#ef4444' : '#eab308',
                        borderColor: s.status === 'Warmup' ? 'rgba(249, 115, 22, 0.3)' : 
                                     s.status === 'Ready' ? 'rgba(16, 185, 129, 0.3)' : 
                                     s.status === 'Alert' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(234, 179, 8, 0.3)'
                      }}
                    >
                      <option value="Warmup">🔥 Warmup</option>
                      <option value="Ready">✅ Ready</option>
                      <option value="Alert">⚠️ Alert</option>
                      <option value="Paused">⏸️ Paused</option>
                    </select>
                  </td>

                  {/* Actions */}
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                      <button className="btn-warmup history" onClick={() => openHistory(s)}>
                        📜 History
                      </button>
                      <button 
                        className="btn-warmup delete" 
                        onClick={() => handleResetWarmupLogs(s.serverName)}
                        title="Reset & Clear Warmup Logs"
                      >
                        🔄 Reset
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* History Log Modal */}
      {showHistoryModal && selectedServer && (
        <div className="modal-overlay" onClick={closeHistory}>
          <div className="history-modal-box animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📜 Warmup History: {selectedServer.serverName} ({selectedServer.ip || 'No IP'})</h2>
              <button className="close-btn" onClick={closeHistory}>&times;</button>
            </div>
            
            <div className="modal-body">
              {/* Form to add log entry */}
              <form onSubmit={handleAddHistoryLog} className="history-add-form">
                <h4>Add or Update Daily Warmup Log</h4>
                <div className="form-inputs-row">
                  <div className="form-field" style={{ maxWidth: '80px' }}>
                    <label>Day</label>
                    <input
                      type="number"
                      required
                      value={newHistDay}
                      onChange={(e) => setNewHistDay(e.target.value)}
                    />
                  </div>
                  <div className="form-field" style={{ maxWidth: '120px' }}>
                    <label>Date</label>
                    <input
                      type="text"
                      required
                      placeholder="DD/MM/YYYY"
                      value={newHistDate}
                      onChange={(e) => setNewHistDate(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Sent</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newHistSent}
                      onChange={(e) => setNewHistSent(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Inbox</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newHistInbox}
                      onChange={(e) => setNewHistInbox(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Spam</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newHistSpam}
                      onChange={(e) => setNewHistSpam(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label>Status</label>
                    <select
                      value={newHistStatus}
                      onChange={(e) => setNewHistStatus(e.target.value as any)}
                    >
                      <option value="Warmup">Warmup</option>
                      <option value="Ready">Ready</option>
                      <option value="Alert">Alert</option>
                      <option value="Paused">Paused</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-form-submit">
                    Save Record
                  </button>
                </div>
              </form>

              {/* Logs table */}
              <div className="history-table-container">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Date</th>
                      <th>Sent</th>
                      <th>Inbox</th>
                      <th>Spam</th>
                      <th>Inbox %</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'center' }}>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedServer.history.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                          No history records found for this server.
                        </td>
                      </tr>
                    ) : (
                      selectedServer.history.map((h, index) => (
                        <tr key={index}>
                          <td style={{ fontWeight: 600, color: '#f97316' }}>Day {h.day}</td>
                          <td>{h.date}</td>
                          <td>{h.sent.toLocaleString()}</td>
                          <td>{h.inbox.toLocaleString()}</td>
                          <td>{h.spam.toLocaleString()}</td>
                          <td>
                            <span className={`inbox-pct ${getDeliverabilityClass(h.inbox, h.spam, h.sent)}`}>
                              {getDeliverabilityText(h.inbox, h.spam, h.sent)}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${h.status.toLowerCase()}`}>
                              {h.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              className="copy-icon-btn" 
                              onClick={() => handleDeleteHistoryLog(h.day)}
                              style={{ margin: '0 auto', opacity: 0.6 }}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      {toastMessage && <div className="toast-warmup">{toastMessage}</div>}
    </div>
  );
}
