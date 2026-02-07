import React, { useState, useMemo } from 'react';

function EventsList({ events }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const matchesType = typeFilter === 'all' || evt.type === typeFilter;
      const matchesProvider =
        providerFilter === 'all' || evt.provider === providerFilter;
      return matchesType && matchesProvider;
    });
  }, [events, typeFilter, providerFilter]);

  return (
    <div>
      <div className="filter-bar">
        <button
          className={`filter-btn ${providerFilter === 'all' ? 'active' : ''}`}
          onClick={() => setProviderFilter('all')}
        >
          All Providers
        </button>
        <button
          className={`filter-btn ${providerFilter === 'aws' ? 'active' : ''}`}
          onClick={() => setProviderFilter('aws')}
        >
          AWS
        </button>
        <button
          className={`filter-btn ${providerFilter === 'azure' ? 'active' : ''}`}
          onClick={() => setProviderFilter('azure')}
        >
          Azure
        </button>
        <button
          className={`filter-btn ${providerFilter === 'gcp' ? 'active' : ''}`}
          onClick={() => setProviderFilter('gcp')}
        >
          GCP
        </button>

        <span style={{ width: 1, background: 'var(--color-border)', margin: '0 4px' }} />

        <button
          className={`filter-btn ${typeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setTypeFilter('all')}
        >
          All Events
        </button>
        <button
          className={`filter-btn ${typeFilter === 'resolved' ? 'active' : ''}`}
          onClick={() => setTypeFilter('resolved')}
        >
          Resolved
        </button>
        <button
          className={`filter-btn ${typeFilter === 'disruption' ? 'active' : ''}`}
          onClick={() => setTypeFilter('disruption')}
        >
          Disruptions
        </button>
        <button
          className={`filter-btn ${typeFilter === 'change' ? 'active' : ''}`}
          onClick={() => setTypeFilter('change')}
        >
          Changes
        </button>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="empty-state">
          <p>No events match your filters.</p>
        </div>
      ) : (
        <div className="events-list">
          {filteredEvents.map((evt, idx) => (
            <div key={`${evt.guid || evt.title}-${idx}`} className="event-card">
              <div className="event-header">
                <span className={`event-provider ${evt.provider}`}>
                  {{ aws: 'AWS', azure: 'Azure', gcp: 'GCP' }[evt.provider] || evt.provider}
                </span>
                <span className={`event-badge ${evt.type}`}>{evt.type}</span>
              </div>
              <div className="event-title">{evt.title}</div>
              {evt.description && (
                <div className="event-description">{evt.description}</div>
              )}
              <div className="event-meta">
                {evt.service && <span>Service: {evt.service}</span>}
                {evt.date && (
                  <span>{new Date(evt.date).toLocaleString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default EventsList;
