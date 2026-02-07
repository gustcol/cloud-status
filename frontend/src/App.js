import React, { useState, useEffect, useCallback } from 'react';
import StatusBanner from './components/StatusBanner';
import ServicesList from './components/ServicesList';
import EventsList from './components/EventsList';
import IssuesDashboard from './components/IssuesDashboard';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('services');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`${API_BASE}/refresh`, { method: 'POST' });
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner" />
          <p>Loading cloud status...</p>
        </div>
      </div>
    );
  }

  const awsStatus = data?.aws?.status;
  const azureStatus = data?.azure?.status;
  const gcpStatus = data?.gcp?.status;
  const lastUpdated = data?.aws?.lastUpdated || data?.azure?.lastUpdated || data?.gcp?.lastUpdated;

  // Combine events from all providers
  const allEvents = [
    ...(awsStatus?.recentEvents || []).map((e) => ({ ...e, provider: 'aws' })),
    ...(azureStatus?.recentEvents || []).map((e) => ({ ...e, provider: 'azure' })),
    ...(gcpStatus?.recentEvents || []).map((e) => ({ ...e, provider: 'gcp' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="app">
      <header className="header">
        <h1>Cloud Status Monitor</h1>
        <p>Real-time status for AWS, Azure, and GCP services</p>
        {lastUpdated && (
          <div className="last-updated">
            Last updated: {new Date(lastUpdated).toLocaleString()}
            <span style={{ marginLeft: 12 }}>
              <button
                className="refresh-btn"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing...' : 'Refresh Now'}
              </button>
            </span>
          </div>
        )}
      </header>

      {error && (
        <div className="error-banner">
          <span>Failed to load status: {error}</span>
          <button className="refresh-btn" onClick={fetchData}>
            Retry
          </button>
        </div>
      )}

      <div className="overall-status">
        <StatusBanner
          provider="AWS"
          providerClass="aws"
          status={awsStatus}
        />
        <StatusBanner
          provider="Azure"
          providerClass="azure"
          status={azureStatus}
        />
        <StatusBanner
          provider="GCP"
          providerClass="gcp"
          status={gcpStatus}
        />
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'issues' ? 'active' : ''}`}
          onClick={() => setActiveTab('issues')}
        >
          Issues & Degradation
        </button>
        <button
          className={`tab ${activeTab === 'services' ? 'active' : ''}`}
          onClick={() => setActiveTab('services')}
        >
          Services Status
        </button>
        <button
          className={`tab ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          Recent Events & Changes
        </button>
      </div>

      {activeTab === 'issues' && (
        <IssuesDashboard awsStatus={awsStatus} azureStatus={azureStatus} gcpStatus={gcpStatus} />
      )}

      {activeTab === 'services' && (
        <ServicesList awsStatus={awsStatus} azureStatus={azureStatus} gcpStatus={gcpStatus} />
      )}

      {activeTab === 'events' && <EventsList events={allEvents} />}

      <footer className="footer">
        <p>
          Data sourced from{' '}
          <a
            href="https://status.aws.amazon.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-aws)' }}
          >
            AWS Health Dashboard
          </a>
          {' & '}
          <a
            href="https://status.azure.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-azure)' }}
          >
            Azure Status
          </a>
          {' & '}
          <a
            href="https://status.cloud.google.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-gcp)' }}
          >
            GCP Status
          </a>
          . Auto-refreshes every 5 minutes.
        </p>
      </footer>
    </div>
  );
}

export default App;
