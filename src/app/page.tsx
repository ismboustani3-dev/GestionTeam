import './Dashboard.css';

// Demo data - replace with real database in production
const dashboardData = {
  todayRevenue: 450.00,
  thisMonthRevenue: 9716.50,
  lastMonthRevenue: 0,
  totalRevenue: 9716.50,
  topMailers: [
    { name: 'Salma EL KARTIT', total: 3059.00 },
    { name: 'Jaafar LAAKEL HEMDANOU', total: 2662.00 },
    { name: 'Ayoub GHAILAN', total: 2068.50 },
    { name: 'Inssaf EL HAOUASS', total: 1927.00 },
    { name: 'Reda', total: 0 },
  ],
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(val).replace('.', ',');
}

export default function Home() {
  const data = dashboardData;

  return (
    <div className="dashboard animate-fade-in">
      <header className="dashboard-header">
        <h1>Overview</h1>
        <div className="user-profile">
          <div className="user-info">
            <span className="user-name">Ismail BOUSTANI</span>
            <span className="user-role">ADMIN</span>
          </div>
        </div>
      </header>

      <div className="filter-bar">
        <span className="filter-icon">📅</span>
        <span>Revenue Filter</span>
        <select className="filter-select">
          <option>All Time</option>
          <option>This Month</option>
        </select>
      </div>

      <div className="section-header">
        <h2>Revenue Performance</h2>
        <span className="last-updated">Last updated: just now</span>
      </div>

      <div className="metrics-grid">
        <div className="metric-card card-today">
          <span className="metric-label">TODAY</span>
          <span className="metric-value">{formatCurrency(data.todayRevenue)}</span>
        </div>
        
        <div className="metric-card card-month">
          <span className="metric-label">THIS MONTH</span>
          <span className="metric-value">{formatCurrency(data.thisMonthRevenue)}</span>
        </div>
        
        <div className="metric-card card-last-month">
          <span className="metric-label">LAST MONTH</span>
          <span className="metric-value">{formatCurrency(data.lastMonthRevenue)}</span>
        </div>
        
        <div className="metric-card card-total">
          <span className="metric-label">TOTAL REVENUE</span>
          <span className="metric-value">{formatCurrency(data.totalRevenue)}</span>
        </div>
      </div>

      <div className="dashboard-row">
        <div className="revenue-highlights">
          <div className="card-header">
            <h3>📊 Revenue Highlights</h3>
          </div>
          <div className="highlight-item">
            <span>Yesterday&apos;s Total</span>
            <span className="highlight-val">$0,00</span>
          </div>
          <div className="highlight-item">
            <span>Monthly Growth</span>
            <span className="highlight-val success">New Month</span>
          </div>
        </div>

        <div className="top-mailers">
          <div className="card-header">
            <h3>🏆 Top Mailers (Month)</h3>
          </div>
          <div className="mailer-list">
            {data.topMailers.map((mailer, idx) => (
              <div key={idx} className="mailer-item">
                <div className="mailer-info">
                  <span className={`rank rank-${idx + 1}`}>{idx + 1}</span>
                  <span className="mailer-name">{mailer.name}</span>
                </div>
                <span className="mailer-revenue">{formatCurrency(mailer.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
