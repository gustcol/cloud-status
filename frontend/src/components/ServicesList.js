import React, { useState, useMemo } from 'react';

function ServicesList({ awsStatus, azureStatus, gcpStatus }) {
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const allCategories = useMemo(() => {
    const categories = [];

    const addFromProvider = (status, provider) => {
      if (!status?.servicesByCategory) return;
      for (const [category, services] of Object.entries(status.servicesByCategory)) {
        categories.push({
          category: `${provider} - ${category}`,
          provider,
          services: services.map((s) => ({ ...s, provider })),
        });
      }
    };

    if (providerFilter === 'all' || providerFilter === 'aws') {
      addFromProvider(awsStatus, 'aws');
    }
    if (providerFilter === 'all' || providerFilter === 'azure') {
      addFromProvider(azureStatus, 'azure');
    }
    if (providerFilter === 'all' || providerFilter === 'gcp') {
      addFromProvider(gcpStatus, 'gcp');
    }

    return categories;
  }, [awsStatus, azureStatus, gcpStatus, providerFilter]);

  const filteredCategories = useMemo(() => {
    return allCategories
      .map((cat) => ({
        ...cat,
        services: cat.services.filter((svc) => {
          const matchesSearch =
            !search || svc.name.toLowerCase().includes(search.toLowerCase());
          const matchesStatus =
            statusFilter === 'all' || svc.status === statusFilter;
          return matchesSearch && matchesStatus;
        }),
      }))
      .filter((cat) => cat.services.length > 0);
  }, [allCategories, search, statusFilter]);

  return (
    <div>
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
          className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All Status
        </button>
        <button
          className={`filter-btn ${statusFilter === 'operational' ? 'active' : ''}`}
          onClick={() => setStatusFilter('operational')}
        >
          Operational
        </button>
        <button
          className={`filter-btn ${statusFilter === 'degraded' ? 'active' : ''}`}
          onClick={() => setStatusFilter('degraded')}
        >
          Degraded
        </button>
        <button
          className={`filter-btn ${statusFilter === 'disruption' ? 'active' : ''}`}
          onClick={() => setStatusFilter('disruption')}
        >
          Disruption
        </button>
      </div>

      {filteredCategories.length === 0 ? (
        <div className="empty-state">
          <p>No services match your filters.</p>
        </div>
      ) : (
        filteredCategories.map((cat) => (
          <div key={cat.category} className="category-section">
            <div className="category-header">{cat.category}</div>
            <div className="services-grid">
              {cat.services.map((svc, idx) => (
                <div key={`${svc.slug}-${idx}`} className="service-card">
                  <span className="service-name" title={svc.name}>
                    {svc.name}
                  </span>
                  <div className="service-status">
                    <span className={`status-label ${svc.status}`}>
                      {svc.status}
                    </span>
                    <span className={`status-dot ${svc.status}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default ServicesList;
