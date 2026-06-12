'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { loadTeamsFromFirebase, saveTeamsToFirebase, loadIpStatusFromFirebase, saveIpStatusToFirebase, addMonitorLogToFirebase } from '@/lib/firebaseTeams';
import { getUniqueIpDomains } from '@/lib/ipUtils';
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
  classType?: string;
  status?: 'active' | 'deleted' | 'tocancel';
  dateDeclaration?: string;
  ipDomains?: { ip: string, domain: string }[];
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

function getYearMonthNumberFromLabel(label: string): number {
  const parts = label.split(' ');
  if (parts.length !== 2) return 0;
  const monthName = parts[0].toLowerCase();
  const year = parseInt(parts[1]);
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIdx = months.indexOf(monthName);
  if (monthIdx === -1 || isNaN(year)) return 0;
  return year * 12 + monthIdx;
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
  
  if (diffDays < -2) return 'kept'; // New class for grey
  if (diffDays >= -2 && diffDays <= 3) return 'urgent';
  if (diffDays >= 4 && diffDays <= 7) return 'warning';
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

interface ScheduleItem {
  id: string;
  name: string;
  type: string;
  cronExpression: string;
  enabled: boolean;
  lastRun?: string;
  teamName?: string;
}

export default function DatabasePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from Firebase on initial mount
  useEffect(() => {
    const load = async () => {
      const data = await loadTeamsFromFirebase();
      if (data && data.length > 0) {
        setTeams(data);
      }
      setIsLoaded(true);
    };
    load();
  }, []);

  // Save to Firebase whenever teams change
  useEffect(() => {
    if (isLoaded) {
      saveTeamsToFirebase(teams);
    }
  }, [teams, isLoaded]);

  // Schedule state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleType, setNewScheduleType] = useState('payment_notice');
  const [newScheduleProvider, setNewScheduleProvider] = useState('');
  const [newScheduleAge, setNewScheduleAge] = useState('60');
  const [newScheduleFrequency, setNewScheduleFrequency] = useState<'time' | '1h' | '2h' | '6h' | '12h'>('time');
  const [newScheduleTime1, setNewScheduleTime1] = useState('08:00');
  const [newScheduleTime2, setNewScheduleTime2] = useState('');
  const [newScheduleTeam, setNewScheduleTeam] = useState('all');
  const [newScheduleDays, setNewScheduleDays] = useState<number[]>([1,2,3,4,5,6,0]);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  // Load schedules on mount
  useEffect(() => {
    fetch('/api/schedule').then(r => r.json()).then(data => {
      if (data.schedules) setSchedules(data.schedules);
    }).catch(() => {});
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
      const name = newScheduleName || `Auto Check (Every ${interval}h)`;

      let finalType = newScheduleType;
      if (newScheduleType === 'by_provider') finalType = `by_provider_${newScheduleProvider}`;
      if (newScheduleType === 'old_age') finalType = `old_age_${newScheduleAge}`;

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', name, type: finalType, cronExpression: cronExpr, teamName: newScheduleTeam })
      });
      const data = await res.json();
      if (data.schedules) setSchedules(data.schedules);
    } else {
      const [h1, m1] = newScheduleTime1.split(':');
      let cronExpr = `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`;
      const name = newScheduleName || `Auto Check ${newScheduleTime1}`;

      let finalType = newScheduleType;
      if (newScheduleType === 'by_provider') finalType = `by_provider_${newScheduleProvider}`;
      if (newScheduleType === 'old_age') finalType = `old_age_${newScheduleAge}`;

      if (newScheduleTime2) {
        const [h2, m2] = newScheduleTime2.split(':');
        await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: `${name} (1)`, type: finalType, cronExpression: `${parseInt(m1)} ${parseInt(h1)} * * ${dayStr}`, teamName: newScheduleTeam })
        });
        const res2 = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: `${name} (2)`, type: finalType, cronExpression: `${parseInt(m2)} ${parseInt(h2)} * * ${dayStr}`, teamName: newScheduleTeam })
        });
        const data = await res2.json();
        if (data.schedules) setSchedules(data.schedules);
      } else {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name, type: finalType, cronExpression: cronExpr, teamName: newScheduleTeam })
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
    setNewScheduleProvider('');
    setNewScheduleAge('60');
    setNewScheduleDays([1,2,3,4,5,6,0]);
    setEditingScheduleId(null);
  };

  const handleUpdateSchedule = async () => {
    if (!editingScheduleId) return;
    // Delete old then add new
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

  // Load an existing schedule into the form for editing
  const handleEditSchedule = (s: ScheduleItem) => {
    setEditingScheduleId(s.id);
    setNewScheduleName(s.name);
    setNewScheduleTeam(s.teamName || 'all');

    // Parse type
    if (s.type.startsWith('old_age_')) {
      setNewScheduleType('old_age');
      setNewScheduleAge(s.type.replace('old_age_', ''));
    } else if (s.type.startsWith('by_provider_')) {
      setNewScheduleType('by_provider');
      setNewScheduleProvider(s.type.replace('by_provider_', ''));
    } else {
      setNewScheduleType(s.type);
    }

    // Parse cron expression to time/days
    const parts = s.cronExpression.split(' ');
    if (parts.length === 5) {
      const [min, hour, , , dow] = parts;
      if (hour.startsWith('*/')) {
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

    setIsScheduleModalOpen(true);
  };

  const [activeTeam, setActiveTeam] = useState<string>('REDA');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterField, setFilterField] = useState<'all' | 'ip' | 'domain' | 'serverName'>('all');
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showBulkCancel, setShowBulkCancel] = useState(false);
  const [editingServerId, setEditingServerId] = useState<number | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [bulkCancelText, setBulkCancelText] = useState('');
  const [showBulkIpDomain, setShowBulkIpDomain] = useState(false);
  const [bulkIpDomainText, setBulkIpDomainText] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [selectedReportMonth, setSelectedReportMonth] = useState<string>('');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<'all' | 'new' | 'existing' | 'tocancel' | 'deleted'>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'active' | 'tocancel' | 'new' | 'deleted'>('all');

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

  const displayServersList = React.useMemo(() => {
    const all = currentTeam?.servers || [];
    if (quickFilter === 'deleted') {
      return all.filter(s => s.status === 'deleted' && s.dateSortie && isCurrentMonth(s.dateSortie));
    }
    if (quickFilter === 'active') {
      return activeServers.filter(s => s.status === 'active');
    }
    if (quickFilter === 'tocancel') {
      return activeServers.filter(s => s.status === 'tocancel');
    }
    if (quickFilter === 'new') {
      return activeServers.filter(s => s.dateEntre && isCurrentMonth(s.dateEntre));
    }
    return activeServers;
  }, [currentTeam, activeServers, quickFilter]);
  
  // Filter search
  const filteredActiveServers = displayServersList.filter(s => {
    if (!searchTerm) return true;
    
    // Split search terms by spaces, commas, semicolons, or newlines
    const terms = searchTerm.split(/[\s,;\n]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
    if (terms.length === 0) return true;

    // A server matches if it matches ANY of the terms
    return terms.some(term => {
      // Helper to check domain mappings
      const matchesDomain = s.ipDomains && s.ipDomains.some(d => d.domain.toLowerCase().includes(term));
      
      if (filterField === 'ip') {
        return (s.mainIp || '').toLowerCase().includes(term) || 
               (s.ipDomains && s.ipDomains.some(d => d.ip.toLowerCase().includes(term)));
      }
      if (filterField === 'domain') return matchesDomain;
      if (filterField === 'serverName') return (s.serverName || '').toLowerCase().includes(term);
      
      return (
        (s.serverName || '').toLowerCase().includes(term) ||
        (s.mainIp || '').toLowerCase().includes(term) ||
        (s.provider || '').toLowerCase().includes(term) ||
        (s.asn || '').toLowerCase().includes(term) ||
        matchesDomain
      );
    });
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
    if (!sortConfig) return 0;
    
    const { key, direction } = sortConfig;
    const modifier = direction === 'asc' ? 1 : -1;

    if (key === 'serverName') {
      return (a.serverName || '').localeCompare(b.serverName || '') * modifier;
    }
    if (key === 'mainIp') {
      return (ipToNumber(a.mainIp) - ipToNumber(b.mainIp)) * modifier;
    }
    if (key === 'dateEntre' || key === 'age') {
      const timeA = parseDate(a.dateEntre)?.getTime() || 0;
      const timeB = parseDate(b.dateEntre)?.getTime() || 0;
      return key === 'age' ? (timeB - timeA) * modifier : (timeA - timeB) * modifier;
    }
    if (key === 'dateSortie') {
      const timeA = parseDate(a.dateSortie)?.getTime() || Number.MAX_SAFE_INTEGER;
      const timeB = parseDate(b.dateSortie)?.getTime() || Number.MAX_SAFE_INTEGER;
      return (timeA - timeB) * modifier;
    }
    return 0;
  });

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      setSortConfig(null);
      return;
    }
    setSortConfig({ key, direction });
  };

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
    if (editingServerId) {
      addMonitorLogToFirebase("Edit Server", `Edited server: ${serverData.serverName} (IP: ${serverData.mainIp}, Provider: ${serverData.provider || 'N/A'}, ASN: ${serverData.asn || 'N/A'}, DateEntre: ${serverData.dateEntre}) in team ${activeTeam}`);
    } else {
      addMonitorLogToFirebase("Add Server", `new server add: Added new server ${serverData.serverName} (IP: ${serverData.mainIp}, Provider: ${serverData.provider || 'N/A'}, ASN: ${serverData.asn || 'N/A'}, DateEntre: ${serverData.dateEntre}) in team ${activeTeam}`);
    }
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
      addMonitorLogToFirebase("Bulk Import", `new server add: Bulk imported ${newServers.length} server(s) into team ${activeTeam}:\n` + newServers.map(s => `- ${s.serverName} (${s.mainIp})`).join('\n'));
      setBulkText('');
      setShowBulk(false);
    }
  };

  const handleBulkCancel = (actionType: 'tocancel' | 'deleted') => {
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
                  const dateSortie = s.dateSortie || todayFormatted;
                  return { 
                    ...s, 
                    status: actionType, 
                    dateSortie, 
                    dateDeclaration: todayFormatted 
                  };
                }
                return s;
              })
            }
          : t
      )
    );
    
    const logAction = actionType === 'tocancel' ? 'Mark To Cancel' : 'Delete Definitive';
    addMonitorLogToFirebase("Bulk Action", `Bulk processed (${logAction}) servers in team ${activeTeam}: ${serverNamesToCancel.join(', ')}`);
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

    const actualChangedIps = new Set<string>();

    // Compute updated teams
    const updatedTeams = teams.map((t: any) => {
      if (t.name === activeTeam) {
        return {
          ...t,
          servers: t.servers.map((s: any) => {
            const sname = s.serverName.toLowerCase();
            if (updates.has(sname)) {
              const currentDomains: {ip: string, domain: string}[] = s.ipDomains || [];
              
              // Build a map of old unique domains for change detection
              const oldUnique = getUniqueIpDomains(currentDomains);
              const oldDomainMap = new Map(oldUnique.map(d => [d.ip.trim(), d.domain.trim()]));
              
              const changedIps = new Set<string>();
              const changedOldDomains = new Set<string>();
              
              // Build a set of IPs being updated and detect changes
              const updateMap = new Map<string, string>();
              for (const mapping of updates.get(sname)!) {
                const ip = mapping.ip.trim();
                const newDomain = mapping.domain.trim();
                updateMap.set(ip, newDomain);
                const oldDomain = oldDomainMap.get(ip);
                if (oldDomain !== newDomain) {
                  changedIps.add(ip);
                  actualChangedIps.add(ip);
                  if (oldDomain) {
                    changedOldDomains.add(oldDomain);
                  }
                }
              }

              // Replace domains: filter out ALL old entries for updated IPs, then add new ones
              const cleanedDomains = currentDomains.filter(m => !updateMap.has(m.ip.trim()));
              const newMappings = [...cleanedDomains, ...updates.get(sname)!];
              
              const allIps = new Set(newMappings.map(m => m.ip));
              if (s.mainIp) allIps.add(s.mainIp);
              const totalIpsCount = allIps.size;

              // Clear stale check results for IPs whose domain changed
              let newSpfDetails = s.spfDetails ? { ...s.spfDetails } : undefined;
              let newVmtaDetails = s.vmtaDetails ? { ...s.vmtaDetails } : undefined;
              let newRdnsDetails = s.rdnsDetails ? [...s.rdnsDetails] : undefined;

              if (changedIps.size > 0) {
                // Clear SPF results for changed IPs
                if (newSpfDetails) {
                  changedIps.forEach(ip => {
                    delete newSpfDetails![ip];
                  });
                }
                // Clear VMTA results for changed IPs
                if (newVmtaDetails) {
                  changedIps.forEach(ip => {
                    delete newVmtaDetails![ip];
                  });
                }
                // Clear rDNS results: remove PTR queries for changed IPs and A queries for old domains
                if (newRdnsDetails) {
                  newRdnsDetails = newRdnsDetails.filter((q: any) => {
                    if (q.type === 'PTR' && changedIps.has(q.query)) return false;
                    if (q.type === 'A' && changedOldDomains.has(q.query)) return false;
                    return true;
                  });
                }
              }

              return { 
                ...s, 
                ipDomains: newMappings,
                nbrIps: totalIpsCount,
                classType: getClassFromIps(totalIpsCount),
                ...(newSpfDetails !== undefined && { spfDetails: newSpfDetails }),
                ...(newVmtaDetails !== undefined && { vmtaDetails: newVmtaDetails }),
                ...(newRdnsDetails !== undefined && { rdnsDetails: newRdnsDetails }),
              };
            }
            return s;
          })
        };
      }
      return t;
    });

    // Update state AND explicitly save to Firebase (don't rely on useEffect alone)
    setTeams(updatedTeams);
    saveTeamsToFirebase(updatedTeams);

    // Update IP Status tracker to 'Change DOM' for all actual changed IPs for today
    if (actualChangedIps.size > 0) {
      loadIpStatusFromFirebase().then(ipHistory => {
        const history = ipHistory || {};
        const today = new Date().toISOString().split('T')[0];
        let changed = false;
        actualChangedIps.forEach(ip => {
          if (!history[ip]) history[ip] = {};
          if (history[ip][today] !== 'Change DOM') {
            history[ip][today] = 'Change DOM';
            changed = true;
          }
        });
        if (changed) {
          saveIpStatusToFirebase(history);
        }
      }).catch(err => console.error('Failed to update ip status history on mapping:', err));
    }

    addMonitorLogToFirebase("Map IPs & Domains", `Change domain New: Mapped IPs & domains in team ${activeTeam}:\n` + lines.join('\n'));
    setBulkIpDomainText('');
    setShowBulkIpDomain(false);
  };

  const handleMarkToCancel = (serverId: number) => {
    const server = currentTeam?.servers.find(s => s.id === serverId);
    let ds = server?.dateSortie;
    if (!ds) {
      const promptDate = window.prompt("Enter Notice Date (DD/MM/YYYY) for cancellation:");
      if (!promptDate) return;
      ds = promptDate;
    }

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
              servers: t.servers.map(s => s.id === serverId ? { ...s, status: 'tocancel', dateSortie: ds as string, dateDeclaration: todayFormatted } : s)
            }
          : t
      )
    );
    if (server) {
      addMonitorLogToFirebase("Mark To Cancel", `Marked server ${server.serverName} (${server.mainIp}) as To Cancel (Notice Date: ${ds}) in team ${activeTeam}`);
    }
  };

  const handleKeepServer = (serverId: number) => {
    const server = currentTeam?.servers.find(s => s.id === serverId);
    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? {
              ...t,
              servers: t.servers.map(s => s.id === serverId ? { ...s, status: 'active', dateSortie: '', dateDeclaration: '' } : s)
            }
          : t
      )
    );
    if (server) {
      addMonitorLogToFirebase("Keep Server", `Restored server ${server.serverName} (${server.mainIp}) to Active status in team ${activeTeam}`);
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
    if (serverToDel) {
      addMonitorLogToFirebase("Delete Server", `Moved server ${serverToDel.serverName} (${serverToDel.mainIp}) to history (Date Sortie: ${ds}) in team ${activeTeam}`);
    }
  };

  const handlePermanentDelete = (serverId: number) => {
    if(!window.confirm("Are you sure you want to permanently erase this server?")) return;
    const serverToDel = currentTeam?.servers.find(s => s.id === serverId);
    setTeams(prev =>
      prev.map(t =>
        t.name === activeTeam
          ? { ...t, servers: t.servers.filter(s => s.id !== serverId) }
          : t
      )
    );
    if (serverToDel) {
      addMonitorLogToFirebase("Permanent Delete", `Permanently erased server ${serverToDel.serverName} (${serverToDel.mainIp}) from team ${activeTeam}`);
    }
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
    addMonitorLogToFirebase("Clear History", `Cleared all deleted server history for team ${activeTeam}`);
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

  // Find all unique months present in the system for this team for reporting
  const availableReportMonths = React.useMemo(() => {
    const monthsSet = new Set<string>();
    const allServers = currentTeam?.servers || [];
    
    allServers.forEach(s => {
      if (s.dateEntre) {
        const m = getMonthYear(s.dateEntre);
        if (m && m !== 'Unknown Date') monthsSet.add(m);
      }
      if (s.dateSortie) {
        const m = getMonthYear(s.dateSortie);
        if (m && m !== 'Unknown Date') monthsSet.add(m);
      }
    });
    
    return Array.from(monthsSet).sort((a, b) => {
      const db = new Date(b);
      const da = new Date(a);
      return (isNaN(db.getTime()) ? 0 : db.getTime()) - (isNaN(da.getTime()) ? 0 : da.getTime());
    });
  }, [currentTeam]);

  useEffect(() => {
    if (availableReportMonths.length > 0) {
      const now = new Date();
      const currentMonthStr = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      if (availableReportMonths.includes(currentMonthStr)) {
        setSelectedReportMonth(currentMonthStr);
      } else {
        setSelectedReportMonth(availableReportMonths[0]);
      }
    } else {
      setSelectedReportMonth('');
    }
  }, [availableReportMonths]);

  const getMonthlyReportData = (monthYearStr: string) => {
    const reportMonthNum = getYearMonthNumberFromLabel(monthYearStr);
    
    const newServers: Server[] = [];
    const existingServers: Server[] = [];
    const toCancelServers: Server[] = [];
    const deletedServersList: Server[] = [];
    
    const allServers = currentTeam?.servers || [];
    
    allServers.forEach(s => {
      const entryMonthNum = getYearMonthNumber(s.dateEntre);
      const exitMonthNum = s.dateSortie ? getYearMonthNumber(s.dateSortie) : 0;
      
      if (s.status === 'deleted') {
        if (exitMonthNum === reportMonthNum) {
          deletedServersList.push(s);
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
        // active server
        if (entryMonthNum === reportMonthNum) {
          newServers.push(s);
        } else if (entryMonthNum < reportMonthNum) {
          existingServers.push(s);
        }
      }
    });
    
    return {
      newServers,
      existingServers,
      toCancelServers,
      deleted: deletedServersList
    };
  };

  const databaseSchedules = schedules.filter(s => 
    s.type === 'payment_notice' || s.type.startsWith('by_provider_') || s.type.startsWith('old_age_') || s.type === 'summary_report'
  );

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
              const activeCount = team.servers.filter(s => s.status === 'active').length;
              const toCancelCount = team.servers.filter(s => s.status === 'tocancel').length;
              const cancelCount = team.servers.filter(s => s.status === 'deleted' && s.dateSortie && isCurrentMonth(s.dateSortie)).length;
              return (
                <button
                  key={team.name}
                  className={`db-tab ${activeTeam === team.name ? 'active' : ''}`}
                  onClick={() => { setActiveTeam(team.name); setSearchTerm(''); setQuickFilter('all'); }}
                >
                  <span className="tab-name">👥 {team.name}</span>
                  <div className="team-counters">
                    <span className="team-counter-green" title="Prod Servers">{activeCount}</span>
                    <span className="team-counter-orange" title="Servers To Cancel">{toCancelCount}</span>
                    <span className="team-counter-red" title="Cancelled Definitive">{cancelCount}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="db-toolbar">
        <div className="db-toolbar-left" style={{ display: 'flex', gap: '0.8rem' }}>
          <Link 
            href="/database/monitor" 
            className="bulk-import-btn" 
            style={{background: 'linear-gradient(135deg, #6366f1, #4f46e5)', margin: 0, textDecoration: 'none', display: 'inline-flex', alignItems: 'center'}}
          >
            🖥️ Monitor
          </Link>
          <Link 
            href="/database/summary"
            className="bulk-import-btn" 
            style={{background: 'linear-gradient(135deg, #3b82f6, #0ea5e9)', margin: 0, textDecoration: 'none', display: 'inline-flex', alignItems: 'center'}}
          >
            📊 Summary Table
          </Link>
        </div>
        <div className="db-toolbar-right">
          <div className="db-filter">
            <select
              className="filter-select"
              value={filterField}
              onChange={(e) => setFilterField(e.target.value as 'all' | 'ip' | 'domain' | 'serverName')}
            >
              <option value="all">Search All Fields</option>
              <option value="ip">By IP</option>
              <option value="domain">By Domain</option>
              <option value="serverName">By Master Server Name</option>
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
            {showBulkCancel ? '✕ Cancel' : '🗑️ Bulk Cancel/Delete'}
          </button>
          <button className="bulk-import-btn" style={{background: 'linear-gradient(135deg, #10b981, #3b82f6)'}} onClick={() => { setShowBulkIpDomain(!showBulkIpDomain); setShowForm(false); setShowBulk(false); setShowBulkCancel(false); }}>
            {showBulkIpDomain ? '✕ Cancel' : '🌐 Map IPs & Domains'}
          </button>
          <button className="bulk-import-btn" style={{background: 'linear-gradient(135deg, #f59e0b, #ef4444)', marginLeft: '0.5rem'}} onClick={async () => {
            const btn = document.getElementById('manual-notice-btn');
            if (btn) btn.innerText = 'Sending...';
            try {
              await fetch('/api/cron-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'payment_notice', teamName: 'all' })
              });
              alert('Payment Notice sent to Telegram!');
            } catch (e) {
              alert('Error sending notice.');
            }
            if (btn) btn.innerText = '🤖 Send Notice (All)';
          }} id="manual-notice-btn">
            🤖 Send Notice (All)
          </button>
          <button 
            className="bulk-import-btn" 
            style={{background: 'linear-gradient(135deg, #10b981, #059669)', marginLeft: '0.5rem'}}
            onClick={() => {
              setIsScheduleModalOpen(!isScheduleModalOpen);
              setShowForm(false);
              setShowBulk(false);
              setShowBulkCancel(false);
              setShowBulkIpDomain(false);
            }}
          >
            ⏰ Auto Schedule
          </button>
        </div>
      </div>

      {isScheduleModalOpen && (
        <div className="animate-fade-in" style={{
          background: 'rgba(16, 185, 129, 0.04)',
          border: '1px solid rgba(16, 185, 129, 0.15)',
          borderRadius: '12px',
          padding: '1.2rem',
          marginBottom: '1rem',
          display: 'flex', gap: '1.5rem', flexWrap: 'wrap'
        }}>
          {/* New Schedule Form */}
          <div style={{ flex: '1 1 280px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '1.2rem', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ margin: '0 0 1rem', color: '#10b981', fontWeight: 600, fontSize: '1.1rem' }}>➕ New Schedule</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <input
                type="text"
                placeholder="Schedule Name"
                value={newScheduleName}
                onChange={e => setNewScheduleName(e.target.value)}
                style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '1rem' }}
              />
              <select
                value={newScheduleType}
                onChange={e => setNewScheduleType(e.target.value)}
                style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '1rem' }}
              >
                <option value="payment_notice" style={{ background: '#1e293b' }}>Payment Notice</option>
                <option value="old_age" style={{ background: '#1e293b' }}>Old Age Server Notice</option>
                <option value="by_provider" style={{ background: '#1e293b' }}>By Provider Notice</option>
                <option value="summary_report" style={{ background: '#1e293b' }}>Summary Table Report</option>
              </select>
              {newScheduleType === 'old_age' && (
                <input
                  type="number"
                  placeholder="Minimum Age (Days) e.g., 20"
                  value={newScheduleAge}
                  onChange={e => setNewScheduleAge(e.target.value)}
                  style={{ gridColumn: '1 / -1', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '1rem' }}
                />
              )}
              {newScheduleType === 'by_provider' && (
                <input
                  type="text"
                  placeholder="Provider Name (e.g., OVH)"
                  value={newScheduleProvider}
                  onChange={e => setNewScheduleProvider(e.target.value)}
                  style={{ gridColumn: '1 / -1', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontSize: '1rem' }}
                />
              )}
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
                    setNewScheduleProvider('');
                    setNewScheduleAge('60');
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
            <p style={{ margin: '0 0 0.8rem', color: '#10b981', fontWeight: 600, fontSize: '1.1rem' }}>📋 Active Schedules</p>
            {databaseSchedules.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '1rem', textAlign: 'center', padding: '1rem' }}>No schedules configured yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {databaseSchedules.map(s => (
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
                        {s.type.toUpperCase()} • {s.cronExpression} • Team: {s.teamName || 'all'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleEditSchedule(s)}
                      style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: '1.1rem', padding: '0.4rem', flexShrink: 0 }}
                      title="Edit Schedule"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteSchedule(s.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem', padding: '0.4rem', flexShrink: 0 }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}





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
          <h3 style={{ color: '#f87171' }}>🗑️ Bulk Cancel/Delete Servers</h3>
          <p className="bulk-hint">Paste your list of server names (separated by commas, spaces, or newlines).</p>
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
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                className="submit-btn" 
                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }} 
                onClick={() => handleBulkCancel('tocancel')}
              >
                ⚠️ Mark To Cancel
              </button>
              <button 
                className="submit-btn danger-submit" 
                onClick={() => handleBulkCancel('deleted')}
              >
                ❌ Delete Definitive
              </button>
            </div>
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
          <div className="board-header-left" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2>{activeTeam}</h2>
            {quickFilter !== 'all' && (
              <button 
                onClick={() => setQuickFilter('all')}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '20px',
                  color: '#94a3b8',
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  transition: 'all 0.2s',
                  lineHeight: 1
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
              >
                Clear Filter ({quickFilter === 'deleted' ? 'MONTH DEL' : quickFilter.toUpperCase()}) ✕
              </button>
            )}
          </div>
          <div className="board-header-right" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button 
              className="minimal-btn" 
              style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.8rem' }}
              title="Copy the names of all currently filtered servers in the table"
              onClick={() => {
                if (sortedServers.length === 0) {
                  alert('No filtered servers to copy!');
                  return;
                }
                const names = sortedServers.map(s => s.serverName).filter(Boolean).join('\n');
                navigator.clipboard.writeText(names);
                alert(`Copied ${sortedServers.length} filtered server name(s) to clipboard!`);
              }}
            >
              📋 Copy Filtered ({sortedServers.length})
            </button>
            <button 
              className="minimal-btn" 
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.8rem' }}
              title="Copy the names of all RED urgent servers"
              onClick={() => {
                const redServers = activeServers.filter(s => s.dateSortie && getNoticeColorClass(s.dateSortie) === 'urgent');
                if (redServers.length === 0) {
                  alert('No urgent servers found!');
                  return;
                }
                const names = redServers.map(s => `${s.serverName} ; ${s.dateSortie}`).join('\n');
                navigator.clipboard.writeText(names);
                alert(`Copied ${redServers.length} urgent server(s) to clipboard!`);
              }}
            >
              📋 Copy Urgent
            </button>
            <span 
              className="stat-active"
              style={{
                cursor: 'pointer',
                padding: '0.3rem 0.6rem',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: quickFilter === 'active' ? 'rgba(52, 211, 153, 0.4)' : 'transparent',
                background: quickFilter === 'active' ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
                transition: 'all 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                userSelect: 'none'
              }}
              onClick={() => setQuickFilter(prev => prev === 'active' ? 'all' : 'active')}
              title={quickFilter === 'active' ? 'Click to show all servers' : 'Click to filter only active servers'}
            >
              ACTIVE: <strong>{activeServers.filter(s => s.status === 'active').length} Servers</strong>
            </span>
            <span 
              className="stat-orange"
              style={{
                cursor: 'pointer',
                padding: '0.3rem 0.6rem',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: quickFilter === 'tocancel' ? 'rgba(249, 115, 22, 0.4)' : 'transparent',
                background: quickFilter === 'tocancel' ? 'rgba(249, 115, 22, 0.1)' : 'transparent',
                transition: 'all 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                userSelect: 'none'
              }}
              onClick={() => setQuickFilter(prev => prev === 'tocancel' ? 'all' : 'tocancel')}
              title={quickFilter === 'tocancel' ? 'Click to show all servers' : 'Click to filter only servers to cancel'}
            >
              TO CANCEL: <strong>{activeServers.filter(s => s.status === 'tocancel').length} Servers</strong>
            </span>
            <span 
              className="stat-new"
              style={{
                cursor: 'pointer',
                padding: '0.3rem 0.6rem',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: quickFilter === 'new' ? 'rgba(96, 165, 250, 0.4)' : 'transparent',
                background: quickFilter === 'new' ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                transition: 'all 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                userSelect: 'none'
              }}
              onClick={() => setQuickFilter(prev => prev === 'new' ? 'all' : 'new')}
              title={quickFilter === 'new' ? 'Click to show all servers' : 'Click to filter only servers added in the current month'}
            >
              NEW SERVER ADD: <strong>{monthNewCount} {currentMonthName}</strong>
            </span>
            <span 
              className="stat-del"
              style={{
                cursor: 'pointer',
                padding: '0.3rem 0.6rem',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: quickFilter === 'deleted' ? 'rgba(248, 113, 113, 0.4)' : 'transparent',
                background: quickFilter === 'deleted' ? 'rgba(248, 113, 113, 0.1)' : 'transparent',
                transition: 'all 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                userSelect: 'none'
              }}
              onClick={() => setQuickFilter(prev => prev === 'deleted' ? 'all' : 'deleted')}
              title={quickFilter === 'deleted' ? 'Click to show all servers' : 'Click to view only servers deleted in the current month'}
            >
              MONTH DEL: <strong>{monthDelCount}</strong>
            </span>
          </div>
        </div>

        <div className="db-table-container no-border-radius-top">
          <table className="db-table clean-table">
            <thead>
              <tr>
                <th className="sortable-th" onClick={() => handleSort('serverName')}>
                  Server {sortConfig?.key === 'serverName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="sortable-th" onClick={() => handleSort('mainIp')}>
                  Main IP {sortConfig?.key === 'mainIp' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="sortable-th" onClick={() => handleSort('dateEntre')}>
                  DateEntre {sortConfig?.key === 'dateEntre' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="sortable-th" onClick={() => handleSort('age')}>
                  Age {sortConfig?.key === 'age' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="sortable-th" onClick={() => handleSort('dateSortie')}>
                  Notice Date {sortConfig?.key === 'dateSortie' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{textAlign: 'right'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedServers.length > 0 ? (
                sortedServers.map((s) => (
                  <tr key={s.id} style={
                    s.status === 'deleted' ? { background: 'rgba(248, 113, 113, 0.06)', opacity: 0.85 } :
                    (s.status === 'tocancel' ? { background: 'rgba(249, 115, 22, 0.08)' } : undefined)
                  }>
                    <td className="td-name">
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ 
                            color: s.status === 'tocancel' ? '#f97316' : (s.status === 'deleted' ? '#f87171' : undefined), 
                            textDecoration: s.status === 'deleted' ? 'line-through' : undefined,
                            fontWeight: 600 
                          }}>{s.serverName || '—'}</span>
                          {s.status === 'tocancel' && <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 'bold' }}>tocancel</span>}
                          {s.status === 'deleted' && <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 'bold' }}>deleted</span>}
                        </div>
                        {s.serverName && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(s.serverName);
                              alert(`Copied ${s.serverName} to clipboard!`);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              padding: '0.2rem',
                              transition: 'color 0.2s',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                            title="Copy Server Name"
                            className="copy-srv-btn"
                          >
                            📋
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="td-ip">
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{s.mainIp}</span>
                        {(() => {
                          const extraIps = s.ipDomains ? s.ipDomains.filter(item => item.ip !== s.mainIp) : [];
                          const extraCount = extraIps.length > 0 ? extraIps.length : (s.nbrIps && s.nbrIps > 1 ? s.nbrIps - 1 : 0);
                          if (extraCount > 0) {
                            return (
                              <div className="more-ips-badge-container">
                                <span className="more-ips-badge">+{extraCount} more</span>
                                <div className="more-ips-tooltip">
                                  {extraIps.length > 0 ? (
                                    extraIps.map((item, idx) => (
                                      <div key={idx} style={{ padding: '0.1rem 0', display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
                                        <strong style={{ color: '#38bdf8' }}>{item.ip}</strong>
                                        {item.domain && <span style={{ color: '#94a3b8' }}>({item.domain})</span>}
                                      </div>
                                    ))
                                  ) : (
                                    <span style={{ color: '#94a3b8' }}>IP details not mapped</span>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>
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
                      <div className="action-buttons-right" style={{ gap: '0.4rem' }}>
                        {s.status === 'tocancel' ? (
                          <>
                            <button className="minimal-btn" style={{ borderColor: '#22c55e', color: '#22c55e' }} title="Keep Server" onClick={() => handleKeepServer(s.id)}>Keep</button>
                            <button className="minimal-btn danger" title="Delete Definitive" onClick={() => handleDeleteToHistory(s.id)}>Delete Definitive</button>
                          </>
                        ) : s.status === 'deleted' ? (
                          <>
                            <button className="minimal-btn" style={{ borderColor: '#22c55e', color: '#22c55e' }} title="Restore Server" onClick={() => handleKeepServer(s.id)}>Restore</button>
                            <button className="minimal-btn danger" title="Permanent Delete" onClick={() => handlePermanentDelete(s.id)}>Perm Del</button>
                          </>
                        ) : (
                          <>
                            <button className="minimal-btn" title="Edit" onClick={() => handleEditClick(s)}>Edit</button>
                            <button className="minimal-btn" style={{ borderColor: '#f97316', color: '#f97316' }} title="Mark To Cancel" onClick={() => handleMarkToCancel(s.id)}>To Cancel</button>
                            <button className="minimal-btn danger" title="Delete Definitive" onClick={() => handleDeleteToHistory(s.id)}>Delete Definitive</button>
                          </>
                        )}
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
            {availableReportMonths.length > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
                <select 
                  className="filter-select"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                  value={selectedReportMonth || availableReportMonths[0]}
                  onChange={(e) => setSelectedReportMonth(e.target.value)}
                >
                  {availableReportMonths.map(m => <option key={m} value={m} style={{ background: '#1e293b' }}>{m}</option>)}
                </select>
                <button 
                  className="minimal-btn"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none', padding: '0.35rem 0.8rem' }}
                  onClick={() => {
                    if (!selectedReportMonth && availableReportMonths.length > 0) {
                      setSelectedReportMonth(availableReportMonths[0]);
                    }
                    setIsReportModalOpen(true);
                  }}
                >
                  📊 View Monthly Report
                </button>
              </div>
            )}
            <button className="clear-all-btn" onClick={handleClearAllHistory}>Clear All</button>
          </div>
        </div>
        
        {sortedHistoryMonths.length > 0 ? (
          <div className="history-months-container">
            {sortedHistoryMonths.map(month => (
              <div key={month} className="history-month-block">
                <div className="history-month-header">
                  <h3 className="history-month-title">📅 {month}</h3>
                  <button 
                    className="minimal-btn" 
                    style={{ background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.4)', color: '#818cf8', padding: '0.3rem 0.8rem' }}
                    onClick={() => {
                      setSelectedReportMonth(month);
                      setIsReportModalOpen(true);
                    }}
                  >
                    📊 View Monthly Report
                  </button>
                </div>
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
                        <td className="td-name">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span>{s.serverName || '—'}</span>
                            {s.serverName && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(s.serverName);
                                  alert(`Copied ${s.serverName} to clipboard!`);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#94a3b8',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                  padding: '0.2rem',
                                  transition: 'color 0.2s',
                                  display: 'inline-flex',
                                  alignItems: 'center'
                                }}
                                title="Copy Server Name"
                                className="copy-srv-btn"
                              >
                                📋
                              </button>
                            )}
                          </div>
                        </td>
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

      {isReportModalOpen && (
        <div className="modal-overlay" onClick={() => setIsReportModalOpen(false)}>
          <div className="report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="report-modal-header">
              <h2>📊 Monthly Report — {selectedReportMonth || availableReportMonths[0]} ({activeTeam})</h2>
              <button className="close-btn" onClick={() => setIsReportModalOpen(false)}>✕</button>
            </div>
            <div className="report-modal-body">
              {(() => {
                const reportMonth = selectedReportMonth || availableReportMonths[0];
                const reportData = getMonthlyReportData(reportMonth);
                
                // Filter items based on activeReportTab
                let displayItems: (Server & { reportType: string })[] = [];
                
                const mappedNew = reportData.newServers.map(s => ({ ...s, reportType: 'New' }));
                const mappedExisting = reportData.existingServers.map(s => ({ ...s, reportType: 'Existing' }));
                const mappedToCancel = reportData.toCancelServers.map(s => ({ ...s, reportType: 'To Cancel' }));
                const mappedDeleted = reportData.deleted.map(s => ({ ...s, reportType: 'Cancelled' }));
                
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
                  <>
                    {/* Dashboard cards */}
                    <div className="report-dashboard-grid">
                      <div className="report-stat-card new">
                        <span className="report-stat-label">🆕 New Servers</span>
                        <span className="report-stat-value">{reportData.newServers.length}</span>
                      </div>
                      <div className="report-stat-card existing">
                        <span className="report-stat-label">🖥️ Existing Servers</span>
                        <span className="report-stat-value">{reportData.existingServers.length}</span>
                      </div>
                      <div className="report-stat-card tocancel">
                        <span className="report-stat-label">⚠️ To Cancel</span>
                        <span className="report-stat-value">{reportData.toCancelServers.length}</span>
                      </div>
                      <div className="report-stat-card deleted">
                        <span className="report-stat-label">❌ Cancelled / Deleted</span>
                        <span className="report-stat-value">{reportData.deleted.length}</span>
                      </div>
                    </div>
                    
                    {/* Tabs switcher */}
                    <div className="report-tabs">
                      <button 
                        className={`report-tab-btn ${activeReportTab === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveReportTab('all')}
                      >
                        All ({mappedNew.length + mappedExisting.length + mappedToCancel.length + mappedDeleted.length})
                      </button>
                      <button 
                        className={`report-tab-btn ${activeReportTab === 'new' ? 'active' : ''}`}
                        onClick={() => setActiveReportTab('new')}
                        style={{ color: '#38bdf8' }}
                      >
                        New ({mappedNew.length})
                      </button>
                      <button 
                        className={`report-tab-btn ${activeReportTab === 'existing' ? 'active' : ''}`}
                        onClick={() => setActiveReportTab('existing')}
                        style={{ color: '#34d399' }}
                      >
                        Already Existing ({mappedExisting.length})
                      </button>
                      <button 
                        className={`report-tab-btn ${activeReportTab === 'tocancel' ? 'active' : ''}`}
                        onClick={() => setActiveReportTab('tocancel')}
                        style={{ color: '#f59e0b' }}
                      >
                        To Cancel ({mappedToCancel.length})
                      </button>
                      <button 
                        className={`report-tab-btn ${activeReportTab === 'deleted' ? 'active' : ''}`}
                        onClick={() => setActiveReportTab('deleted')}
                        style={{ color: '#f87171' }}
                      >
                        Definitive Deleted ({mappedDeleted.length})
                      </button>
                    </div>
                    
                    {/* Table */}
                    <div className="db-table-container">
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
                  </>
                );
              })()}
            </div>
            <div className="audit-modal-footer" style={{ padding: '1rem 1.5rem', background: 'rgba(30, 41, 59, 0.4)', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button 
                className="minimal-btn" 
                style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}
                onClick={() => setIsReportModalOpen(false)}
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
