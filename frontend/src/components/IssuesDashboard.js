import React, { useMemo } from 'react';

const providerLabels = { aws: 'AWS', azure: 'Azure', gcp: 'GCP' };

function IssuesDashboard({ awsStatus, azureStatus, gcpStatus }) {
  const { disruptions, degraded, informational, providerCounts, activeIncidents } = useMemo(() => {
    const disruptions = [];
    const degraded = [];
    const informational = [];
    const providerCounts = { aws: 0, azure: 0, gcp: 0 };
    const activeIncidents = [];

    const processProvider = (status, provider) => {
      if (!status?.services) return;
      for (const svc of status.services) {
        if (svc.status === 'disruption') {
          disruptions.push({ ...svc, provider });
          providerCounts[provider]++;
        } else if (svc.status === 'degraded') {
          degraded.push({ ...svc, provider });
          providerCounts[provider]++;
        } else if (svc.status === 'informational') {
          informational.push({ ...svc, provider });
          providerCounts[provider]++;
        }
      }
      // Collect recent non-resolved events as active incidents
      if (status.recentEvents) {
        for (const evt of status.recentEvents) {
          if (evt.type !== 'resolved' && evt.type !== 'change') {
            activeIncidents.push({ ...evt, provider });
          }
        }
      }
    };

    processProvider(awsStatus, 'aws');
    processProvider(azureStatus, 'azure');
    processProvider(gcpStatus, 'gcp');

    activeIncidents.sort((a, b) => new Date(b.date) - new Date(a.date));

    return { disruptions, degraded, informational, providerCounts, activeIncidents: activeIncidents.slice(0, 15) };
  }, [awsStatus, azureStatus, gcpStatus]);

  const totalIssues = disruptions.length + degraded.length + informational.length;
  const allClear = totalIssues === 0;

  return (
    <div>
      {/* Summary cards */}
      <div className="issues-summary">
        {['aws', 'azure', 'gcp'].map((p) => (
          <div key={p} className={`issues-summary-card ${p}`}>
            <div className="summary-count" style={{ color: providerCounts[p] > 0 ? 'var(--color-disruption)' : 'var(--color-operational)' }}>
              {providerCounts[p]}
            </div>
            <div className="summary-label">{providerLabels[p]} affected services</div>
          </div>
        ))}
      </div>

      {allClear ? (
        <div className="all-clear">
          <h2>All Systems Operational</h2>
          <p>No issues detected across all monitored cloud providers.</p>
        </div>
      ) : (
        <>
          {disruptions.length > 0 && (
            <div className="issues-section">
              <div className="issues-section-header">
                <span className="section-dot" style={{ background: 'var(--color-disruption)', boxShadow: '0 0 6px var(--color-disruption)' }} />
                <span style={{ color: 'var(--color-disruption)' }}>Disruptions</span>
                <span className="section-count">({disruptions.length} services)</span>
              </div>
              <div className="issues-services-grid">
                {disruptions.map((svc, idx) => (
                  <IssueServiceCard key={`dis-${svc.slug}-${idx}`} service={svc} />
                ))}
              </div>
            </div>
          )}

          {degraded.length > 0 && (
            <div className="issues-section">
              <div className="issues-section-header">
                <span className="section-dot" style={{ background: 'var(--color-degraded)', boxShadow: '0 0 6px var(--color-degraded)' }} />
                <span style={{ color: 'var(--color-degraded)' }}>Degraded Performance</span>
                <span className="section-count">({degraded.length} services)</span>
              </div>
              <div className="issues-services-grid">
                {degraded.map((svc, idx) => (
                  <IssueServiceCard key={`deg-${svc.slug}-${idx}`} service={svc} />
                ))}
              </div>
            </div>
          )}

          {informational.length > 0 && (
            <div className="issues-section">
              <div className="issues-section-header">
                <span className="section-dot" style={{ background: 'var(--color-informational)', boxShadow: '0 0 6px var(--color-informational)' }} />
                <span style={{ color: 'var(--color-informational)' }}>Informational</span>
                <span className="section-count">({informational.length} services)</span>
              </div>
              <div className="issues-services-grid">
                {informational.map((svc, idx) => (
                  <IssueServiceCard key={`inf-${svc.slug}-${idx}`} service={svc} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Active incidents timeline */}
      {activeIncidents.length > 0 && (
        <div className="issues-incidents">
          <h3>Active Incidents & Events</h3>
          <div className="events-list">
            {activeIncidents.map((evt, idx) => (
              <div key={`${evt.guid || evt.title}-${idx}`} className="event-card">
                <div className="event-header">
                  <span className={`event-provider ${evt.provider}`}>
                    {providerLabels[evt.provider] || evt.provider}
                  </span>
                  <span className={`event-badge ${evt.type}`}>{evt.type}</span>
                </div>
                <div className="event-title">{evt.title}</div>
                {evt.description && (
                  <div className="event-description">{evt.description}</div>
                )}
                <div className="event-meta">
                  {evt.service && <span>Service: {evt.service}</span>}
                  {evt.date && <span>{new Date(evt.date).toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IssueServiceCard({ service }) {
  return (
    <div className="issue-service-card">
      <div className="issue-service-info">
        <span className={`provider-badge ${service.provider}`}>
          {providerLabels[service.provider]}
        </span>
        <span className="service-name" title={service.name}>
          {service.name}
        </span>
      </div>
      <div className="service-status">
        <span className={`status-label ${service.status}`}>
          {service.status}
        </span>
        <span className={`status-dot ${service.status}`} />
      </div>
    </div>
  );
}

export default IssuesDashboard;
