import React from 'react';

const statusLabels = {
  operational: 'All Systems Operational',
  informational: 'Informational Event',
  degraded: 'Degraded Performance',
  disruption: 'Service Disruption',
  maintenance: 'Under Maintenance',
  unknown: 'Status Unknown',
};

function StatusBanner({ provider, providerClass, status }) {
  const overallStatus = status?.overallStatus || 'unknown';
  const totalServices = status?.totalServices || 0;
  const label = statusLabels[overallStatus] || 'Loading...';

  return (
    <div className={`status-banner ${providerClass}`}>
      <div className={`provider-icon ${providerClass}`}>
        {{ aws: 'AWS', azure: 'Az', gcp: 'GCP' }[providerClass] || providerClass}
      </div>
      <div className="banner-info">
        <h3>{provider}</h3>
        <div className="status-text">
          <span className={`status-dot ${overallStatus}`} />
          <span className={`status-label ${overallStatus}`}>{label}</span>
        </div>
        <div className="service-count">
          {totalServices} services monitored
        </div>
      </div>
    </div>
  );
}

export default StatusBanner;
