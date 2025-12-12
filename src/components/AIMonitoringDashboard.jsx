// components/AIMonitoringDashboard.jsx
import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const AIMonitoringDashboard = () => {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [timeRange, setTimeRange] = useState(24);

  useEffect(() => {
    fetchStats();
    fetchHealth();
    fetchAlerts();
    const interval = setInterval(() => {
      fetchStats();
      fetchHealth();
    }, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchStats = async () => {
    const response = await fetch(`/api/monitoring/stats?hours=${timeRange}`);
    const data = await response.json();
    setStats(data);
  };

  const fetchHealth = async () => {
    const response = await fetch('/api/monitoring/health');
    const data = await response.json();
    setHealth(data);
  };

  const fetchAlerts = async () => {
    const response = await fetch('/api/monitoring/alerts?resolved=false&limit=10');
    const data = await response.json();
    setAlerts(data);
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  if (!stats || !health) return <div>Loading...</div>;

  return (
    <div className="ai-monitoring-dashboard">
      <h1>AI Agent Monitoring Dashboard</h1>
      
      {/* Health Status */}
      <div className="health-status">
        <h2>System Health</h2>
        <div className={`health-indicator ${health.status}`}>
          Status: {health.status.toUpperCase()}
        </div>
        <p>Last checked: {new Date(health.checked_at).toLocaleString()}</p>
      </div>

      {/* Performance Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3>Agent Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="agent_name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total_calls" fill="#0088FE" name="Total Calls" />
              <Bar dataKey="successful_calls" fill="#00C49F" name="Successful" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Cost Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={80}
                fill="#8884d8"
                dataKey="total_cost"
              >
                {stats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `$${value.toFixed(4)}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Latency Trends */}
      <div className="chart-card full-width">
        <h3>Latency Trends (ms)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stats}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="agent_name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="avg_execution_time" stroke="#FF8042" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Active Alerts */}
      <div className="alerts-section">
        <h3>Active Alerts</h3>
        {alerts.length === 0 ? (
          <p className="no-alerts">No active alerts</p>
        ) : (
          <div className="alerts-list">
            {alerts.map((alert) => (
              <div key={alert.id} className={`alert ${alert.alert_type}`}>
                <div className="alert-header">
                  <span className="alert-type">{alert.alert_type.toUpperCase()}</span>
                  <span className="alert-agent">{alert.agent_name}</span>
                  <span className="alert-time">{new Date(alert.created_at).toLocaleString()}</span>
                </div>
                <div className="alert-body">
                  <p>{alert.message}</p>
                  <p>Value: {alert.alert_value} | Threshold: {alert.threshold}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time Range Selector */}
      <div className="time-selector">
        <label>Time Range: </label>
        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
          <option value={1}>Last Hour</option>
          <option value={24}>Last 24 Hours</option>
          <option value={168}>Last Week</option>
          <option value={720}>Last Month</option>
        </select>
      </div>
    </div>
  );
};

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${name}: ${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default AIMonitoringDashboard;