import Link from 'next/link';
import './Sidebar.css';

export default function Sidebar() {
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
          <Link href="/" className="nav-item active">
            <span className="nav-icon">📊</span>
            Dashboard
          </Link>
          <Link href="/database" className="nav-item">
            <span className="nav-icon">🗄️</span>
            Database
          </Link>
        </nav>
      </div>
    </aside>
  );
}
