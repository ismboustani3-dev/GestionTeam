'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { loadTeamsFromFirebase, loadGestionRpFromFirebase, saveGestionRpToFirebase, saveTeamsToFirebase, loadIpStatusFromFirebase, saveIpStatusToFirebase } from '@/lib/firebaseTeams';
import './GestionRp.css';

interface StockDomain {
  id: string;
  domainRp: string;
  domainInclude: string;
  subdomain: string;
  typeInclude: string;
  checkRecord: 'exist' | 'not exist' | 'Pending';
  recordDeclarationSpf: string;
  sent: string;
  revenu: string;
  reInbox: string;
}

interface SchemaDeclaration {
  id: string;
  masterDomain: string;
  ipAddress: string;
  ptrRecord: string;
  activeServer: string;
  status: 'Matching' | 'Mismatch' | 'Pending';
}

export default function GestionRpPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [activeTab, setActiveTab] = useState<'schema' | 'stock'>('stock');
  
  // Stock Domain State
  const [stockDomainsMap, setStockDomainsMap] = useState<Record<string, StockDomain[]>>({});
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightDuplicates, setHighlightDuplicates] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importText, setImportText] = useState('');
  const [isCheckingDns, setIsCheckingDns] = useState(false);

  // Schema Declarations State
  const [schemasMap, setSchemasMap] = useState<Record<string, SchemaDeclaration[]>>({});
  const [checkedSchemaIds, setCheckedSchemaIds] = useState<string[]>([]);
  const [schemaSearchQuery, setSchemaSearchQuery] = useState('');
  const [isResolvingPtr, setIsResolvingPtr] = useState(false);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Firebase integration loading flag
  const [isLoaded, setIsLoaded] = useState(false);

  // Load initial teams and domains
  useEffect(() => {
    const fetchData = async () => {
      const fbTeams = await loadTeamsFromFirebase();
      if (fbTeams && fbTeams.length > 0) {
        setTeams(fbTeams);
        // Default to first team name
        const firstTeam = fbTeams[0].name;
        setActiveTeam(firstTeam);
      }

      const fbData = await loadGestionRpFromFirebase();
      if (fbData) {
        if (fbData.stockDomains) setStockDomainsMap(fbData.stockDomains);
        if (fbData.schemas) setSchemasMap(fbData.schemas);
      }
      setIsLoaded(true);
    };
    fetchData();
  }, []);

  // Save changes to Firebase
  const triggerSave = async (updatedStock?: Record<string, StockDomain[]>, updatedSchemas?: Record<string, SchemaDeclaration[]>) => {
    const finalStock = updatedStock || stockDomainsMap;
    const finalSchemas = updatedSchemas || schemasMap;
    await saveGestionRpToFirebase({
      stockDomains: finalStock,
      schemas: finalSchemas
    });
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  const handleCopyText = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label}: "${text}" to clipboard!`);
  };

  // Stock Domain handlers
  const currentStockDomains = useMemo(() => {
    return stockDomainsMap[activeTeam] || [];
  }, [stockDomainsMap, activeTeam]);

  const filteredStockDomains = useMemo(() => {
    let result = currentStockDomains;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => 
        d.domainRp.toLowerCase().includes(q) ||
        d.domainInclude.toLowerCase().includes(q) ||
        d.subdomain.toLowerCase().includes(q) ||
        d.typeInclude.toLowerCase().includes(q) ||
        d.recordDeclarationSpf.toLowerCase().includes(q)
      );
    }
    return result;
  }, [currentStockDomains, searchQuery]);

  // Find duplicate Domain RP values
  const duplicateDomainRps = useMemo(() => {
    const counts: Record<string, number> = {};
    currentStockDomains.forEach(d => {
      const val = d.domainRp.trim().toLowerCase();
      if (val) {
        counts[val] = (counts[val] || 0) + 1;
      }
    });
    return Object.keys(counts).filter(k => counts[k] > 1);
  }, [currentStockDomains]);

  const handleAddStockRow = () => {
    const newRow: StockDomain = {
      id: `stock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      domainRp: '',
      domainInclude: '',
      subdomain: '',
      typeInclude: '',
      checkRecord: 'Pending',
      recordDeclarationSpf: '',
      sent: '',
      revenu: '',
      reInbox: ''
    };
    
    const updated = {
      ...stockDomainsMap,
      [activeTeam]: [...currentStockDomains, newRow]
    };
    setStockDomainsMap(updated);
    triggerSave(updated, undefined);
    showToast('Added new empty domain row');
  };

  const handleUpdateStockCell = (id: string, field: keyof StockDomain, value: string) => {
    const updatedRows = currentStockDomains.map(row => {
      if (row.id === id) {
        return { ...row, [field]: value };
      }
      return row;
    });

    const updatedMap = {
      ...stockDomainsMap,
      [activeTeam]: updatedRows
    };
    setStockDomainsMap(updatedMap);
    triggerSave(updatedMap, undefined);
  };

  const handleDeleteRow = (id: string) => {
    const updatedRows = currentStockDomains.filter(row => row.id !== id);
    const updatedMap = {
      ...stockDomainsMap,
      [activeTeam]: updatedRows
    };
    setStockDomainsMap(updatedMap);
    triggerSave(updatedMap, undefined);
    setCheckedIds(checkedIds.filter(checkedId => checkedId !== id));
    showToast('Row deleted successfully');
  };

  const handleDeleteSelected = () => {
    if (checkedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${checkedIds.length} selected row(s)?`)) return;

    const updatedRows = currentStockDomains.filter(row => !checkedIds.includes(row.id));
    const updatedMap = {
      ...stockDomainsMap,
      [activeTeam]: updatedRows
    };
    setStockDomainsMap(updatedMap);
    triggerSave(updatedMap, undefined);
    setCheckedIds([]);
    showToast(`Deleted ${checkedIds.length} rows`);
  };

  const handleToggleSelectAll = () => {
    if (checkedIds.length === filteredStockDomains.length) {
      setCheckedIds([]);
    } else {
      setCheckedIds(filteredStockDomains.map(d => d.id));
    }
  };

  const handleToggleCheckbox = (id: string) => {
    if (checkedIds.includes(id)) {
      setCheckedIds(checkedIds.filter(checkedId => checkedId !== id));
    } else {
      setCheckedIds([...checkedIds, id]);
    }
  };

  // Bulk check SPF records
  const handleCheckSpfSelected = async () => {
    if (checkedIds.length === 0) {
      alert('Please select at least one domain to check');
      return;
    }

    const selectedRows = currentStockDomains.filter(row => checkedIds.includes(row.id));
    const domainsToCheck = selectedRows.map(row => row.domainRp).filter(Boolean);

    if (domainsToCheck.length === 0) {
      alert('Selected rows have no domains configured');
      return;
    }

    setIsCheckingDns(true);
    showToast(`Starting DNS Lookup for ${domainsToCheck.length} domains...`);

    try {
      const res = await fetch('/api/dns-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: domainsToCheck })
      });
      const data = await res.json();

      if (data.results) {
        const updatedRows = currentStockDomains.map(row => {
          if (checkedIds.includes(row.id) && row.domainRp) {
            const dnsResult = data.results[row.domainRp];
            if (dnsResult) {
              return {
                ...row,
                checkRecord: dnsResult.exist ? 'exist' : 'not exist' as any,
                recordDeclarationSpf: dnsResult.record || row.recordDeclarationSpf
              };
            }
          }
          return row;
        });

        const updatedMap = {
          ...stockDomainsMap,
          [activeTeam]: updatedRows
        };
        setStockDomainsMap(updatedMap);
        triggerSave(updatedMap, undefined);
        showToast('DNS checks and record updates completed!');
      }
    } catch (e: any) {
      alert('Failed to resolve DNS records: ' + e.message);
    }
    setIsCheckingDns(false);
  };

  // Bulk import
  const handleBulkImport = () => {
    if (!importText.trim()) {
      alert('Please paste some text first');
      return;
    }

    const lines = importText.trim().split('\n');
    const importedRows: StockDomain[] = [];

    lines.forEach(line => {
      const parts = line.split(/[,;]/).map(p => p.trim());
      if (parts[0]) {
        importedRows.push({
          id: `stock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 5)}`,
          domainRp: parts[0] || '',
          domainInclude: parts[1] || '',
          subdomain: parts[2] || '',
          typeInclude: parts[3] || '',
          checkRecord: 'Pending',
          recordDeclarationSpf: parts[4] || '',
          sent: parts[5] || '',
          revenu: parts[6] || '',
          reInbox: parts[7] || ''
        });
      }
    });

    if (importedRows.length > 0) {
      const updated = {
        ...stockDomainsMap,
        [activeTeam]: [...currentStockDomains, ...importedRows]
      };
      setStockDomainsMap(updated);
      triggerSave(updated, undefined);
      setImportText('');
      setShowImportPanel(false);
      showToast(`Imported ${importedRows.length} domain row(s) successfully!`);
    } else {
      alert('Could not detect any valid lines to import');
    }
  };

  const copySelectedDomains = () => {
    if (checkedIds.length === 0) {
      alert('No rows selected');
      return;
    }
    const selectedRows = currentStockDomains.filter(row => checkedIds.includes(row.id));
    const list = selectedRows.map(row => row.domainRp).filter(Boolean).join('\n');
    navigator.clipboard.writeText(list);
    showToast(`Copied ${selectedRows.length} domains to clipboard`);
  };

  // Schema Declarations handlers
  const currentSchemas = useMemo(() => {
    return schemasMap[activeTeam] || [];
  }, [schemasMap, activeTeam]);

  const filteredSchemas = useMemo(() => {
    let result = currentSchemas;
    if (schemaSearchQuery) {
      const q = schemaSearchQuery.toLowerCase();
      result = result.filter(s => 
        s.masterDomain.toLowerCase().includes(q) ||
        s.ipAddress.toLowerCase().includes(q) ||
        s.ptrRecord.toLowerCase().includes(q) ||
        s.activeServer.toLowerCase().includes(q)
      );
    }
    return result;
  }, [currentSchemas, schemaSearchQuery]);

  const handleAddSchemaRow = () => {
    const newRow: SchemaDeclaration = {
      id: `schema_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      masterDomain: '',
      ipAddress: '',
      ptrRecord: '',
      activeServer: '',
      status: 'Pending'
    };

    const updated = {
      ...schemasMap,
      [activeTeam]: [...currentSchemas, newRow]
    };
    setSchemasMap(updated);
    triggerSave(undefined, updated);
    showToast('Added empty schema declaration row');
  };

  const propagateDomainChange = async (ip: string, domain: string, serverName: string, teamName: string) => {
    const ipPattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    const domainPattern = /^[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+$/;

    const trimmedIp = (ip || '').trim();
    const trimmedDomain = (domain || '').trim();
    const trimmedServer = (serverName || '').trim();

    if (!trimmedIp || !trimmedDomain || !trimmedServer) return;
    if (!ipPattern.test(trimmedIp) || !domainPattern.test(trimmedDomain)) return;

    try {
      const fbTeams = await loadTeamsFromFirebase();
      if (!fbTeams) return;

      let teamsChanged = false;
      const updatedTeams = fbTeams.map(t => {
        if (t.name === teamName) {
          const updatedServers = (t.servers || []).map((s: any) => {
            if (s.serverName && s.serverName.toLowerCase() === trimmedServer.toLowerCase()) {
              const currentDomains = s.ipDomains || [];
              const lastMappingForIp = [...currentDomains].reverse().find(m => m.ip === trimmedIp);
              if (!lastMappingForIp || lastMappingForIp.domain !== trimmedDomain) {
                const newMappings = [...currentDomains, { ip: trimmedIp, domain: trimmedDomain }];
                
                const allIps = new Set(newMappings.map(m => m.ip));
                if (s.mainIp) allIps.add(s.mainIp);
                const totalIpsCount = allIps.size;

                const getClassFromIps = (nbr: number): string => {
                  if (nbr >= 19 && nbr <= 35) return '27';
                  if (nbr >= 7 && nbr <= 18) return '28';
                  if (nbr >= 3 && nbr <= 6) return '29';
                  if (nbr > 35) return '26 or less';
                  return '—';
                };

                teamsChanged = true;
                return {
                  ...s,
                  ipDomains: newMappings,
                  nbrIps: totalIpsCount,
                  classType: getClassFromIps(totalIpsCount)
                };
              }
            }
            return s;
          });
          return { ...t, servers: updatedServers };
        }
        return t;
      });

      if (teamsChanged) {
        await saveTeamsToFirebase(updatedTeams);
        setTeams(updatedTeams);

        fetch('/api/cron-check', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teams: updatedTeams })
        }).catch(() => {});

        showToast(`Domain change propagated to server ${trimmedServer}`);
      }

      const ipHistory = await loadIpStatusFromFirebase() || {};
      const today = new Date().toISOString().split('T')[0];

      if (!ipHistory[trimmedIp]) {
        ipHistory[trimmedIp] = {};
      }

      if (ipHistory[trimmedIp][today] !== 'Change DOM') {
        ipHistory[trimmedIp][today] = 'Change DOM';
        await saveIpStatusToFirebase(ipHistory);
        showToast(`IP Status updated to Change DOM for ${trimmedIp}`);
      }

    } catch (error) {
      console.error('Error propagating domain change:', error);
    }
  };

  const handleUpdateSchemaCell = (id: string, field: keyof SchemaDeclaration, value: string) => {
    let rowToPropagate: any = null;

    const updatedRows = currentSchemas.map(row => {
      if (row.id === id) {
        const updatedRow = { ...row, [field]: value };
        if (field === 'masterDomain' || field === 'ipAddress' || field === 'activeServer') {
          rowToPropagate = updatedRow;
        }
        return updatedRow;
      }
      return row;
    });

    const updatedMap = {
      ...schemasMap,
      [activeTeam]: updatedRows
    };
    setSchemasMap(updatedMap);
    triggerSave(undefined, updatedMap);

    if (rowToPropagate) {
      propagateDomainChange(
        rowToPropagate.ipAddress,
        rowToPropagate.masterDomain,
        rowToPropagate.activeServer,
        activeTeam
      );
    }
  };

  const handleDeleteSchemaRow = (id: string) => {
    const updatedRows = currentSchemas.filter(row => row.id !== id);
    const updatedMap = {
      ...schemasMap,
      [activeTeam]: updatedRows
    };
    setSchemasMap(updatedMap);
    triggerSave(undefined, updatedMap);
    setCheckedSchemaIds(checkedSchemaIds.filter(checkedId => checkedId !== id));
    showToast('Schema row deleted');
  };

  const handleDeleteSelectedSchemas = () => {
    if (checkedSchemaIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${checkedSchemaIds.length} selected schema(s)?`)) return;

    const updatedRows = currentSchemas.filter(row => !checkedSchemaIds.includes(row.id));
    const updatedMap = {
      ...schemasMap,
      [activeTeam]: updatedRows
    };
    setSchemasMap(updatedMap);
    triggerSave(undefined, updatedMap);
    setCheckedSchemaIds([]);
    showToast(`Deleted ${checkedSchemaIds.length} schemas`);
  };

  const handleToggleSelectAllSchemas = () => {
    if (checkedSchemaIds.length === filteredSchemas.length) {
      setCheckedSchemaIds([]);
    } else {
      setCheckedSchemaIds(filteredSchemas.map(s => s.id));
    }
  };

  const handleToggleSchemaCheckbox = (id: string) => {
    if (checkedSchemaIds.includes(id)) {
      setCheckedSchemaIds(checkedSchemaIds.filter(checkedId => checkedId !== id));
    } else {
      setCheckedSchemaIds([...checkedSchemaIds, id]);
    }
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = currentStockDomains.length;
    const exist = currentStockDomains.filter(d => d.checkRecord === 'exist').length;
    const notExist = currentStockDomains.filter(d => d.checkRecord === 'not exist').length;
    const include = currentStockDomains.filter(d => d.typeInclude).length;

    return { total, exist, notExist, include };
  }, [currentStockDomains]);

  return (
    <div className="gestion-rp-container">
      {/* Top Navbar / Tabs */}
      <div className="tab-navbar">
        <button 
          className={`nav-tab-btn ${activeTab === 'schema' ? 'active' : ''}`}
          onClick={() => setActiveTab('schema')}
        >
          📁 Schema Declaration Master & IP
        </button>
        <button 
          className={`nav-tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
          onClick={() => setActiveTab('stock')}
        >
          🌐 Stock Domain Master
        </button>
      </div>

      {/* Team selector Segmented buttons */}
      <div className="team-selector-row">
        <label>Active Team:</label>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {teams.map(t => (
            <button
              key={t.name}
              className={`team-badge-btn ${activeTeam === t.name ? 'active' : ''}`}
              onClick={() => {
                setActiveTeam(t.name);
                setCheckedIds([]);
                setCheckedSchemaIds([]);
              }}
            >
              {t.name}
            </button>
          ))}
          {teams.length === 0 && (
            <>
              <button className={`team-badge-btn ${activeTeam === 'REDA' ? 'active' : ''}`} onClick={() => setActiveTeam('REDA')}>REDA</button>
              <button className={`team-badge-btn ${activeTeam === 'KHALID' ? 'active' : ''}`} onClick={() => setActiveTeam('KHALID')}>KHALID</button>
            </>
          )}
        </div>
      </div>

      {/* Stock Domain Tab content */}
      {activeTab === 'stock' && (
        <div className="animate-fade-in">
          {/* Stats row */}
          <div className="stats-cards-grid">
            <div className="stats-card-rp total">
              <div className="stats-card-info">
                <h4>Total Domains</h4>
                <div className="val">{stats.total}</div>
              </div>
              <div className="stats-card-icon">🌐</div>
            </div>

            <div className="stats-card-rp exist">
              <div className="stats-card-info">
                <h4>Exist</h4>
                <div className="val">{stats.exist}</div>
              </div>
              <div className="stats-card-icon">✓</div>
            </div>

            <div className="stats-card-rp not-exist">
              <div className="stats-card-info">
                <h4>Not Exist</h4>
                <div className="val">{stats.notExist}</div>
              </div>
              <div className="stats-card-icon">✕</div>
            </div>

            <div className="stats-card-rp include">
              <div className="stats-card-info">
                <h4>Type Include</h4>
                <div className="val">{stats.include}</div>
              </div>
              <div className="stats-card-icon">🥞</div>
            </div>
          </div>

          {/* Table inventory list */}
          <div className="inventory-header">
            <h3>Stock Domain Inventory</h3>
            
            <div className="inventory-actions">
              <input 
                type="text" 
                placeholder="Search domains..."
                className="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              
              <button 
                className={`action-btn-rp duplicates ${highlightDuplicates ? 'active' : ''}`}
                onClick={() => setHighlightDuplicates(!highlightDuplicates)}
              >
                🔍 {highlightDuplicates ? 'Clear Highlights' : 'Select Duplicates'}
              </button>

              <button 
                className="action-btn-rp copy"
                onClick={copySelectedDomains}
                disabled={checkedIds.length === 0}
              >
                📋 Copy Selected
              </button>

              <button 
                className="action-btn-rp check"
                onClick={handleCheckSpfSelected}
                disabled={checkedIds.length === 0 || isCheckingDns}
              >
                ⚡ {isCheckingDns ? 'Checking...' : 'Check SPF (Selected)'}
              </button>

              <button 
                className="action-btn-rp import"
                onClick={() => setShowImportPanel(!showImportPanel)}
              >
                📥 Import
              </button>

              <button 
                className="action-btn-rp delete"
                onClick={handleDeleteSelected}
                disabled={checkedIds.length === 0}
              >
                🗑️ Delete Selected
              </button>

              <button 
                className="action-btn-rp add"
                onClick={handleAddStockRow}
              >
                ➕ Add Row
              </button>
            </div>
          </div>

          {/* Import panel container */}
          {showImportPanel && (
            <div className="import-panel-rp animate-fade-in">
              <p style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}>
                Paste lines in format: <code>domainrp , domain_include , subdomain , type_include , spf_record</code> (one per line)
              </p>
              <textarea
                rows={5}
                placeholder="domain-one.com , include-one.com , srv.include-one.com"
                value={importText}
                onChange={e => setImportText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="action-btn-rp import" onClick={handleBulkImport}>Execute Import</button>
                <button className="action-btn-rp delete" onClick={() => setShowImportPanel(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Table markup */}
          <div className="inventory-table-container">
            <table className="inventory-table-rp">
              <thead>
                <tr>
                  <th className="checkbox-cell">
                    <input 
                      type="checkbox"
                      checked={filteredStockDomains.length > 0 && checkedIds.length === filteredStockDomains.length}
                      onChange={handleToggleSelectAll}
                    />
                  </th>
                  <th className="col-domain">Domain RP</th>
                  <th className="col-domain">Domain Include</th>
                  <th className="col-domain">Subdomain</th>
                  <th style={{ width: '130px' }}>Type Include</th>
                  <th style={{ width: '130px' }}>Check Record</th>
                  <th className="col-spf">Record Declaration SPF</th>
                  <th style={{ width: '110px' }}>Sent</th>
                  <th style={{ width: '110px' }}>Revenu</th>
                  <th style={{ width: '110px' }}>Re Inbox</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStockDomains.map(row => {
                  const isDuplicate = duplicateDomainRps.includes(row.domainRp.trim().toLowerCase());
                  const isRowChecked = checkedIds.includes(row.id);

                  return (
                    <tr 
                      key={row.id} 
                      className={`inventory-row ${highlightDuplicates && isDuplicate ? 'duplicate-row' : ''}`}
                    >
                      <td className="checkbox-cell">
                        <input 
                          type="checkbox"
                          checked={isRowChecked}
                          onChange={() => handleToggleCheckbox(row.id)}
                        />
                      </td>
                      
                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.domainRp}
                            onChange={e => handleUpdateStockCell(row.id, 'domainRp', e.target.value)}
                          />
                          <button 
                            className="copy-icon-btn" 
                            title="Copy Domain"
                            onClick={() => handleCopyText(row.domainRp, 'Domain RP')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.domainInclude}
                            onChange={e => handleUpdateStockCell(row.id, 'domainInclude', e.target.value)}
                          />
                          <button 
                            className="copy-icon-btn"
                            title="Copy Domain Include"
                            onClick={() => handleCopyText(row.domainInclude, 'Domain Include')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.subdomain}
                            onChange={e => handleUpdateStockCell(row.id, 'subdomain', e.target.value)}
                          />
                          <button 
                            className="copy-icon-btn"
                            title="Copy Subdomain"
                            onClick={() => handleCopyText(row.subdomain, 'Subdomain')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.typeInclude}
                            onChange={e => handleUpdateStockCell(row.id, 'typeInclude', e.target.value)}
                          />
                          <button 
                            className="copy-icon-btn"
                            onClick={() => handleCopyText(row.typeInclude, 'Type Include')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td className="col-badge">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className={`status-badge-rp ${row.checkRecord === 'exist' ? 'exist' : row.checkRecord === 'not exist' ? 'not-exist' : 'pending'}`}>
                            {row.checkRecord}
                          </span>
                          <button 
                            className="copy-icon-btn"
                            onClick={() => handleCopyText(row.checkRecord, 'Check Record')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.recordDeclarationSpf}
                            onChange={e => handleUpdateStockCell(row.id, 'recordDeclarationSpf', e.target.value)}
                          />
                          <button 
                            className="copy-icon-btn"
                            title="Copy SPF Record"
                            onClick={() => handleCopyText(row.recordDeclarationSpf, 'SPF Record')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.sent}
                            onChange={e => handleUpdateStockCell(row.id, 'sent', e.target.value)}
                            placeholder="—"
                          />
                          <button 
                            className="copy-icon-btn"
                            onClick={() => handleCopyText(row.sent, 'Sent status')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.revenu}
                            onChange={e => handleUpdateStockCell(row.id, 'revenu', e.target.value)}
                            placeholder="—"
                          />
                          <button 
                            className="copy-icon-btn"
                            onClick={() => handleCopyText(row.revenu, 'Revenu')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.reInbox}
                            onChange={e => handleUpdateStockCell(row.id, 'reInbox', e.target.value)}
                            placeholder="—"
                          />
                          <button 
                            className="copy-icon-btn"
                            onClick={() => handleCopyText(row.reInbox, 'Re Inbox')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => handleDeleteRow(row.id)}
                          style={{ color: '#ef4444', fontSize: '1.1rem', cursor: 'pointer' }}
                          title="Delete Row"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredStockDomains.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                      No stock domains found for team {activeTeam}. Use the button to add or import.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schema Declaration Tab Content */}
      {activeTab === 'schema' && (
        <div className="animate-fade-in">
          {/* Header Panel */}
          <div className="inventory-header">
            <h3>Domain &amp; IP Schema Declarations</h3>
            
            <div className="inventory-actions">
              <input 
                type="text" 
                placeholder="Search schemas..."
                className="search"
                value={schemaSearchQuery}
                onChange={e => setSchemaSearchQuery(e.target.value)}
              />

              <button 
                className="action-btn-rp delete"
                onClick={handleDeleteSelectedSchemas}
                disabled={checkedSchemaIds.length === 0}
              >
                🗑️ Delete Selected
              </button>

              <button 
                className="action-btn-rp add"
                onClick={handleAddSchemaRow}
              >
                ➕ Add Schema
              </button>
            </div>
          </div>

          {/* Schema Table */}
          <div className="inventory-table-container">
            <table className="inventory-table-rp">
              <thead>
                <tr>
                  <th className="checkbox-cell">
                    <input 
                      type="checkbox"
                      checked={filteredSchemas.length > 0 && checkedSchemaIds.length === filteredSchemas.length}
                      onChange={handleToggleSelectAllSchemas}
                    />
                  </th>
                  <th>Master Domain</th>
                  <th>IP Address</th>
                  <th>RDNS PTR Record</th>
                  <th>Active Server Name</th>
                  <th style={{ width: '130px' }}>Status</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchemas.map(row => {
                  const isRowChecked = checkedSchemaIds.includes(row.id);
                  return (
                    <tr key={row.id}>
                      <td className="checkbox-cell">
                        <input 
                          type="checkbox"
                          checked={isRowChecked}
                          onChange={() => handleToggleSchemaCheckbox(row.id)}
                        />
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.masterDomain}
                            onChange={e => handleUpdateSchemaCell(row.id, 'masterDomain', e.target.value)}
                          />
                          <button 
                            className="copy-icon-btn"
                            onClick={() => handleCopyText(row.masterDomain, 'Master Domain')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.ipAddress}
                            onChange={e => handleUpdateSchemaCell(row.id, 'ipAddress', e.target.value)}
                          />
                          <button 
                            className="copy-icon-btn"
                            onClick={() => handleCopyText(row.ipAddress, 'IP Address')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.ptrRecord}
                            onChange={e => handleUpdateSchemaCell(row.id, 'ptrRecord', e.target.value)}
                          />
                          <button 
                            className="copy-icon-btn"
                            onClick={() => handleCopyText(row.ptrRecord, 'PTR Record')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <input 
                            type="text"
                            value={row.activeServer}
                            onChange={e => handleUpdateSchemaCell(row.id, 'activeServer', e.target.value)}
                          />
                          <button 
                            className="copy-icon-btn"
                            onClick={() => handleCopyText(row.activeServer, 'Active Server Name')}
                          >
                            📋
                          </button>
                        </div>
                      </td>

                      <td>
                        <div className="cell-input-wrapper">
                          <select
                            value={row.status}
                            onChange={e => handleUpdateSchemaCell(row.id, 'status', e.target.value)}
                            style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.3rem', borderRadius: '6px', fontSize: '0.85rem' }}
                          >
                            <option value="Matching">Matching</option>
                            <option value="Mismatch">Mismatch</option>
                            <option value="Pending">Pending</option>
                          </select>
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => handleDeleteSchemaRow(row.id)}
                          style={{ color: '#ef4444', fontSize: '1.1rem', cursor: 'pointer' }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredSchemas.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                      No schema configurations found. Click Add Schema to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
