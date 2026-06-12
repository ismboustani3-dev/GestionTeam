'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './Sidebar.css';

// Outline SVG Icons matching the requested style
const DashboardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const DatabaseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4m0 5c0 2.21-3.58 4-8 4s-8-1.79-8-4" />
  </svg>
);

const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75" />
  </svg>
);

const InfrastructureIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const BanIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
);

const GlobeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20" />
  </svg>
);

const FolderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const FlameIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2c0 0-3 3.5-3 6.5s2 4.5 3 4.5 3-1.5 3-4.5S12 2 12 2z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6c0 0-1.5 1.75-1.5 3.25S11.25 11.5 12 11.5s1.5-.75 1.5-2.25S12 6 12 6z" />
  </svg>
);

const ToolsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ width: '100%', height: '100%' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

export default function Sidebar() {
  const pathname = usePathname();
  const [isToolsOpen, setIsToolsOpen] = useState(true);
  const [fontScale, setFontScale] = useState(100);
  const [isFontControlOpen, setIsFontControlOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('gestiq_font_scale');
    if (saved) {
      const scale = Number(saved);
      setFontScale(scale);
      document.documentElement.style.fontSize = `${scale}%`;
    }
  }, []);

  const handleFontScale = (val: number) => {
    setFontScale(val);
    localStorage.setItem('gestiq_font_scale', String(val));
    document.documentElement.style.fontSize = `${val}%`;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon"></span>
          <h2>GestiQ</h2>
        </div>
      </div>
      
      <div className="sidebar-section">
        <span className="section-title">MAIN</span>
        <nav className="nav-menu">
          <Link href="/" className={`nav-item ${pathname === '/' ? 'active' : ''}`}>
            <span className="nav-icon"><DashboardIcon /></span>
            Dashboard
          </Link>
          <Link href="/database" className={`nav-item ${pathname === '/database' ? 'active' : ''}`}>
            <span className="nav-icon"><DatabaseIcon /></span>
            Database
          </Link>
          <Link href="/team-server-detail" className={`nav-item ${pathname === '/team-server-detail' ? 'active' : ''}`}>
            <span className="nav-icon"><UsersIcon /></span>
            Team Server Detail
          </Link>
          <Link href="/infrastructure" className={`nav-item ${pathname === '/infrastructure' ? 'active' : ''}`}>
            <span className="nav-icon"><InfrastructureIcon /></span>
            Infrastructure Check
          </Link>
          <Link href="/blacklist" className={`nav-item ${pathname === '/blacklist' ? 'active' : ''}`}>
            <span className="nav-icon"><BanIcon /></span>
            Check Blacklist
          </Link>
          <Link href="/ip-status" className={`nav-item ${pathname === '/ip-status' ? 'active' : ''}`}>
            <span className="nav-icon"><GlobeIcon /></span>
            IP Status
          </Link>
          <Link href="/gestion-rp" className={`nav-item ${pathname === '/gestion-rp' ? 'active' : ''}`}>
            <span className="nav-icon"><FolderIcon /></span>
            Gestion RP
          </Link>
          <Link href="/warmup" className={`nav-item ${pathname === '/warmup' ? 'active' : ''}`}>
            <span className="nav-icon"><FlameIcon /></span>
            Suivi Warmup
          </Link>
        </nav>
      </div>

      <div className="sidebar-section" style={{ marginTop: '1.5rem', flex: 'none' }}>
        <div 
          className="section-title tools-header" 
          onClick={() => setIsToolsOpen(!isToolsOpen)}
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            cursor: 'pointer',
            userSelect: 'none',
            paddingRight: '2rem'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="nav-icon" style={{ width: '16px', height: '16px' }}><ToolsIcon /></span> Tools
          </span>
          <span className={`chevron ${isToolsOpen ? 'open' : ''}`} style={{ fontSize: '0.6rem', transition: 'transform 0.3s ease' }}>{isToolsOpen ? '▲' : '▼'}</span>
        </div>
        
        {isToolsOpen && (
          <nav className="nav-menu nested-menu">
            <Link href="/tools/dns-scanner" className={`nav-item sub-item ${pathname === '/tools/dns-scanner' ? 'active' : ''}`}>
              <span className="bullet">•</span> DNS Scanner
            </Link>
            <Link href="/tools/extraction" className={`nav-item sub-item ${pathname === '/tools/extraction' ? 'active' : ''}`}>
              <span className="bullet">•</span> Extraction
            </Link>
            <Link href="/tools/ip-provider" className={`nav-item sub-item ${pathname === '/tools/ip-provider' ? 'active' : ''}`}>
              <span className="bullet">•</span> IP Provider
            </Link>
            <Link href="/tools/dns-generator" className={`nav-item sub-item ${pathname === '/tools/dns-generator' ? 'active' : ''}`}>
              <span className="bullet">•</span> DNS Generator
            </Link>
          </nav>
        )}
      </div>

      {/* Font Size Toggle Button */}
      <div 
        className="font-control-toggle" 
        onClick={() => setIsFontControlOpen(!isFontControlOpen)}
      >
        <span>🔤</span> Text Size
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', opacity: 0.6 }}>
          {isFontControlOpen ? '▲' : '▼'}
        </span>
      </div>

      {/* Font Size Adjuster Control */}
      {isFontControlOpen && (
        <div className="sidebar-font-control">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '1px' }}>TEXT SIZE</span>
            <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 700 }}>{fontScale}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button 
              onClick={() => handleFontScale(Math.max(80, fontScale - 5))}
              style={{ 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid rgba(255,255,255,0.08)', 
                color: '#fff', 
                width: '28px',
                height: '28px',
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontWeight: 'bold', 
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              title="Decrease Text Size"
            >
              A-
            </button>
            <input 
              type="range" 
              min="80" 
              max="130" 
              step="5" 
              value={fontScale} 
              onChange={(e) => handleFontScale(Number(e.target.value))}
              style={{ flex: 1, cursor: 'pointer', height: '4px', accentColor: '#10b981' }}
            />
            <button 
              onClick={() => handleFontScale(Math.min(130, fontScale + 5))}
              style={{ 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid rgba(255,255,255,0.08)', 
                color: '#fff', 
                width: '28px',
                height: '28px',
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontWeight: 'bold', 
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              title="Increase Text Size"
            >
              A+
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
