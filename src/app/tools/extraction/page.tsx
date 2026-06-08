'use client';

import React, { useState, KeyboardEvent } from 'react';
import './Extraction.css';

export default function ExtractionPage() {
  // Segment state
  const [serverType, setServerType] = useState<'Local Server' | 'Internal Proxies' | 'External Proxies'>('Local Server');
  
  // Credentials & Config
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [provider, setProvider] = useState('bigpond');
  const [folder, setFolder] = useState('Trash');
  const [availableFolders, setAvailableFolders] = useState<string[]>(['Trash', 'INBOX', 'Spam', 'Junk', 'ALL']);
  const [filterType, setFilterType] = useState('All');
  
  // Extraction parameters
  const [extractionParam, setExtractionParam] = useState('Body');
  const [customParamKey, setCustomParamKey] = useState('');
  
  // Dedicated filter inputs
  const [subjectFilter, setSubjectFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [bodyFilter, setBodyFilter] = useState('');
  const [messageIdFilter, setMessageIdFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  
  // Filters tags
  const [tagInput, setTagInput] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  
  // Operations & Loading States
  const [emailLoading, setEmailLoading] = useState(false);
  const [connState, setConnState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connMessage, setConnMessage] = useState('');

  // Text Parser States
  const [rawInputLogs, setRawInputLogs] = useState('');
  const [outputLogs, setOutputLogs] = useState('');
  const [parserLoading, setParserLoading] = useState(false);

  // Add tag filter
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.trim().replace(/,$/, '');
      if (val && !filters.includes(val)) {
        setFilters([...filters, val]);
      }
      setTagInput('');
    }
  };

  const handleRemoveFilter = (idx: number) => {
    setFilters(filters.filter((_, i) => i !== idx));
  };

  // Test IMAP Connection
  const handleTestConnection = async () => {
    if (!email || !password) {
      alert('Please fill email and password first.');
      return;
    }
    setConnState('testing');
    setConnMessage('');

    try {
      const response = await fetch('/api/email-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          provider,
          folder,
          action: 'test'
        })
      });

      const data = await response.json();
      if (data.success) {
        setConnState('success');
        setConnMessage(data.message);
        if (data.folders && data.folders.length > 0) {
          setAvailableFolders(data.folders);
          // Set selected folder to first folder if current folder is not in the list
          const matched = data.folders.find((f: string) => f.toLowerCase() === folder.toLowerCase());
          if (matched) {
            setFolder(matched);
          } else {
            setFolder(data.folders[0]);
          }
        }
      } else {
        setConnState('error');
        setConnMessage(data.error || 'Connection failed.');
      }
    } catch (err: any) {
      setConnState('error');
      setConnMessage(err.message || 'Network error.');
    }
  };

  // Execute Email IMAP Extraction
  const handleExecuteExtraction = async () => {
    if (!email || !password) return;
    
    setEmailLoading(true);
    setConnState('idle');

    let activeFilters = filters;
    if (filterType === 'Subject') {
      activeFilters = [subjectFilter];
    } else if (filterType === 'From') {
      activeFilters = [fromFilter];
    } else if (filterType === 'Body') {
      activeFilters = [bodyFilter];
    } else if (filterType === 'Message ID') {
      activeFilters = [messageIdFilter];
    } else if (filterType === 'Date') {
      activeFilters = [dateFilter];
    } else if (filterType === 'Date range' || filterType === 'Range') {
      if (startDateFilter && endDateFilter) {
        activeFilters = [`${startDateFilter}..${endDateFilter}`];
      } else {
        activeFilters = [];
      }
    }

    try {
      const response = await fetch('/api/email-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          provider,
          folder,
          serverType,
          filterType,
          filters: activeFilters,
          extractionParam,
          customExtractKey: customParamKey,
          action: 'execute'
        })
      });

      const data = await response.json();
      if (data.success) {
        if (data.outputText) {
          setOutputLogs(data.outputText);
          alert(`Extraction completed successfully! Found ${data.count} entries.`);
        } else {
          setOutputLogs('Connection succeeded but no messages matched your filters.');
        }
      } else {
        alert(data.error || 'Failed to complete extraction.');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred during extraction.');
    }
    setEmailLoading(false);
  };

  // Run Bulk Text Parser
  const handleRunParser = () => {
    if (!rawInputLogs.trim()) return;
    setParserLoading(true);
    
    // Find all patterns in input
    const lines = rawInputLogs.split(/\r?\n/);
    const parsedItems: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // 1. Look for email:password combo
      const comboMatch = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}:[^\s]+/);
      if (comboMatch) {
        parsedItems.push(comboMatch[0]);
        continue;
      }
      
      // 2. Look for email address
      const emailMatch = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        parsedItems.push(emailMatch[0]);
        continue;
      }

      // 3. Look for URL
      const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/);
      if (urlMatch) {
        parsedItems.push(urlMatch[0]);
        continue;
      }
    }

    const uniqueItems = Array.from(new Set(parsedItems));
    
    if (uniqueItems.length > 0) {
      setOutputLogs(uniqueItems.join('\n'));
    } else {
      setOutputLogs('No patterns (emails, credentials, or URLs) detected in raw logs.');
    }
    setParserLoading(false);
  };

  const handleCopyOutput = () => {
    if (!outputLogs) return;
    navigator.clipboard.writeText(outputLogs);
    alert('Output copied to clipboard!');
  };

  const handleDownloadOutput = () => {
    if (!outputLogs) return;
    const blob = new Blob([outputLogs], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `extracted_logs_${new Date().toISOString().split('T')[0]}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="extraction-container animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <header className="extraction-header" style={{
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
        <div className="title-section">
          <span className="title-icon">✉️</span>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', margin: '0 0 0.2rem 0', letterSpacing: '0.5px' }}>
              EXTRACTION
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Extract targeted data from IMAP mailboxes or parse raw content logs
            </p>
          </div>
        </div>

        {/* Server toggle tabs */}
        <div className="segmented-control">
          {(['Local Server', 'Internal Proxies', 'External Proxies'] as const).map(type => (
            <button
              key={type}
              className={`segment-btn ${serverType === type ? 'active' : ''}`}
              onClick={() => setServerType(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </header>

      {/* Connection Config Card */}
      <div className="config-card">
        <div className="config-row">
          <input
            type="text"
            className="config-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={emailLoading}
          />
          <input
            type="password"
            className="config-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={emailLoading}
          />
          <select 
            className="config-select"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={emailLoading}
          >
            <option value="bigpond">bigpond</option>
            <option value="gmail">gmail</option>
            <option value="yahoo">yahoo</option>
            <option value="outlook">outlook</option>
            <option value="other">other</option>
          </select>
          <select 
            className="config-select"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            disabled={emailLoading}
          >
            {availableFolders.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

          {/* Test connection checkmark button */}
          <button 
            className={`test-conn-btn ${connState}`}
            onClick={handleTestConnection}
            title={connMessage || 'Test IMAP Connection'}
            disabled={emailLoading || connState === 'testing'}
          >
            {connState === 'testing' ? '⏳' : connState === 'success' ? '✓' : connState === 'error' ? '❌' : '⚡'}
          </button>
        </div>

        {/* Filters and execution buttons */}
        <div className="config-row-2">
          <select 
            className="config-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            disabled={emailLoading}
          >
            <option value="All">All</option>
            <option value="Date range">Date range</option>
            <option value="Range">Range</option>
            <option value="From">From</option>
            <option value="Subject">Subject</option>
            <option value="Message ID">Message ID</option>
            <option value="Body">Body</option>
            <option value="Date">Date</option>
          </select>

          <button className="plus-btn" title="Add Filter Row">+</button>

          {/* Dynamic Filter Input fields */}
          {filterType === 'All' && (
            <div className="tag-input-container">
              {filters.map((filter, index) => (
                <span key={index} className="filter-tag">
                  {filter}
                  <span className="tag-remove" onClick={() => handleRemoveFilter(index)}>✕</span>
                </span>
              ))}
              <input
                type="text"
                className="tag-field"
                placeholder="Select a filter(s)..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={emailLoading}
              />
            </div>
          )}

          {filterType === 'Subject' && (
            <input
              type="text"
              className="config-input"
              style={{ flex: 1 }}
              placeholder="Enter subject query filter (e.g. bounce, verification)..."
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              disabled={emailLoading}
            />
          )}

          {filterType === 'From' && (
            <input
              type="text"
              className="config-input"
              style={{ flex: 1 }}
              placeholder="Enter sender email to filter (e.g. alerts@company.com)..."
              value={fromFilter}
              onChange={(e) => setFromFilter(e.target.value)}
              disabled={emailLoading}
            />
          )}

          {filterType === 'Body' && (
            <input
              type="text"
              className="config-input"
              style={{ flex: 1 }}
              placeholder="Enter body text query filter..."
              value={bodyFilter}
              onChange={(e) => setBodyFilter(e.target.value)}
              disabled={emailLoading}
            />
          )}

          {filterType === 'Message ID' && (
            <input
              type="text"
              className="config-input"
              style={{ flex: 1 }}
              placeholder="Enter specific Message ID..."
              value={messageIdFilter}
              onChange={(e) => setMessageIdFilter(e.target.value)}
              disabled={emailLoading}
            />
          )}

          {filterType === 'Date' && (
            <input
              type="date"
              className="config-input"
              style={{ flex: 1, color: '#fff' }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              disabled={emailLoading}
            />
          )}

          {(filterType === 'Date range' || filterType === 'Range') && (
            <div style={{ display: 'flex', gap: '0.5rem', flex: 1, alignItems: 'center' }}>
              <input
                type="date"
                className="config-input"
                style={{ flex: 1, color: '#fff' }}
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                disabled={emailLoading}
              />
              <span style={{ color: 'var(--text-muted)' }}>to</span>
              <input
                type="date"
                className="config-input"
                style={{ flex: 1, color: '#fff' }}
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                disabled={emailLoading}
              />
            </div>
          )}

          <select 
            className="config-select"
            value={extractionParam}
            onChange={(e) => setExtractionParam(e.target.value)}
            disabled={emailLoading}
            style={{ width: '160px' }}
          >
            <option value="Body">Body</option>
            <option value="Full-source">Full-source</option>
            <option value="Full-source-2">Full-source-2</option>
            <option value="Inbox Gems">Inbox Gems</option>
            <option value="X-AOL-SPF">X-AOL-SPF</option>
            <option value="X-AOL-IP">X-AOL-IP</option>
            <option value="X-Originating-ip">X-Originating-ip</option>
            <option value="X-Sender-IP">X-Sender-IP</option>
          </select>

          <input
            type="text"
            className="config-input"
            style={{ width: '180px' }}
            placeholder="Extract param key (e.g. Code:)"
            value={customParamKey}
            onChange={(e) => setCustomParamKey(e.target.value)}
            disabled={emailLoading}
          />

          <div className="row-actions">
            <button 
              className="execute-btn"
              onClick={handleExecuteExtraction}
              disabled={emailLoading || !email || !password}
            >
              {emailLoading ? 'Extracting...' : 'Execute'}
            </button>
            <button className="settings-toggle-btn" title="Filter Settings">⚙️</button>
          </div>
        </div>
      </div>

      {/* Bulk Text Parser Title */}
      <h2 className="parser-section-title">BULK TEXT PARSER</h2>

      {/* Text Parser Layout */}
      <div className="parser-grid">
        {/* Left Side: paste logs */}
        <div className="parser-card">
          <textarea
            className="parser-textarea"
            placeholder="Paste raw logs here..."
            value={rawInputLogs}
            onChange={(e) => setRawInputLogs(e.target.value)}
            disabled={parserLoading}
          />
          <button 
            className="run-parser-btn"
            onClick={handleRunParser}
            disabled={parserLoading || !rawInputLogs}
          >
            {parserLoading ? 'Parsing...' : 'Run Parser'}
          </button>
        </div>

        {/* Right Side: output display */}
        <div className="parser-card">
          <textarea
            className="parser-textarea"
            placeholder="Extracted data will appear here..."
            value={outputLogs}
            readOnly
          />
          <div className="parser-action-row">
            <button className="parser-btn-secondary" onClick={handleCopyOutput} disabled={!outputLogs}>
              Copy
            </button>
            <button className="parser-btn-secondary" onClick={handleDownloadOutput} disabled={!outputLogs}>
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
