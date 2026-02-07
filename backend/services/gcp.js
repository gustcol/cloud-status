const fetch = require('node-fetch');
const { parseString } = require('xml2js');

// GCP Status API endpoints (public, no auth needed)
const GCP_INCIDENTS_URL = 'https://status.cloud.google.com/incidents.json';
const GCP_FEED_URL = 'https://status.cloud.google.com/en/feed.atom';

// Curated GCP service catalog (~67 services across 11 categories)
const GCP_SERVICE_CATALOG = {
  Compute: [
    'Compute Engine', 'Google Kubernetes Engine', 'Cloud Run',
    'Cloud Functions', 'App Engine', 'Bare Metal Solution',
  ],
  Storage: [
    'Cloud Storage', 'Persistent Disk', 'Filestore',
    'Cloud Storage for Firebase',
  ],
  Database: [
    'Cloud SQL', 'Cloud Spanner', 'Firestore',
    'Cloud Bigtable', 'Memorystore', 'AlloyDB',
  ],
  Networking: [
    'Cloud Load Balancing', 'Cloud CDN', 'Cloud DNS',
    'Cloud Interconnect', 'Cloud VPN', 'Cloud NAT',
    'Cloud Armor', 'Traffic Director',
  ],
  'AI & ML': [
    'Vertex AI', 'Cloud Natural Language', 'Cloud Vision',
    'Cloud Speech-to-Text', 'Cloud Text-to-Speech', 'Cloud Translation',
    'Gemini', 'Document AI',
  ],
  'Data & Analytics': [
    'BigQuery', 'Dataflow', 'Dataproc', 'Pub/Sub',
    'Cloud Composer', 'Data Catalog', 'Looker',
  ],
  'Application Integration': [
    'Cloud Tasks', 'Cloud Scheduler', 'Workflows',
    'Eventarc', 'API Gateway', 'Apigee',
  ],
  'Security & Identity': [
    'Identity and Access Management', 'Cloud KMS', 'Secret Manager',
    'Security Command Center', 'Cloud Identity', 'BeyondCorp Enterprise',
  ],
  'Management & Monitoring': [
    'Cloud Monitoring', 'Cloud Logging', 'Cloud Trace',
    'Cloud Profiler', 'Error Reporting', 'Cloud Console',
  ],
  DevOps: [
    'Cloud Build', 'Artifact Registry', 'Container Registry',
    'Cloud Deploy', 'Cloud Source Repositories',
  ],
  'Migration & Transfer': [
    'Database Migration Service', 'Transfer Appliance',
    'Storage Transfer Service', 'Migrate to Virtual Machines',
  ],
};

// Map GCP incident severity to unified status
function mapGCPSeverity(severity) {
  switch ((severity || '').toUpperCase()) {
    case 'SERVICE_OUTAGE':
      return 'disruption';
    case 'SERVICE_DISRUPTION':
      return 'degraded';
    case 'AVAILABLE':
      return 'operational';
    default:
      return 'informational';
  }
}

function parseXml(xml) {
  return new Promise((resolve, reject) => {
    parseString(xml, { explicitArray: false }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

async function fetchGCPStatus() {
  // 1. Fetch active incidents from the JSON API
  let incidents = [];
  try {
    const incRes = await fetch(GCP_INCIDENTS_URL, {
      headers: { 'User-Agent': 'CloudStatusMonitor/1.0' },
      timeout: 15000,
    });
    if (incRes.ok) {
      incidents = await incRes.json();
    }
  } catch (err) {
    console.warn('GCP incidents fetch warning:', err.message);
  }

  // 2. Filter to active incidents only (end is null or empty)
  const activeIncidents = Array.isArray(incidents)
    ? incidents.filter((inc) => !inc.end)
    : [];

  // 3. Build a map of affected products from active incidents
  const affectedProducts = new Map(); // product name -> worst severity
  for (const inc of activeIncidents) {
    const severity = inc.severity || inc.most_recent_update?.severity || 'SERVICE_DISRUPTION';
    if (Array.isArray(inc.affected_products)) {
      for (const product of inc.affected_products) {
        const productName = product.title || product;
        const existing = affectedProducts.get(productName);
        const mapped = mapGCPSeverity(severity);
        if (!existing || severityRank(mapped) > severityRank(existing)) {
          affectedProducts.set(productName, mapped);
        }
      }
    }
  }

  // 4. Build services from catalog, cross-referencing affected products
  const services = [];
  const categories = Object.keys(GCP_SERVICE_CATALOG);
  const servicesByCategory = {};

  for (const [category, svcNames] of Object.entries(GCP_SERVICE_CATALOG)) {
    servicesByCategory[category] = [];
    for (const name of svcNames) {
      // Check if this service matches any affected product
      let status = 'operational';
      for (const [productName, productStatus] of affectedProducts) {
        if (
          name.toLowerCase().includes(productName.toLowerCase()) ||
          productName.toLowerCase().includes(name.toLowerCase())
        ) {
          if (severityRank(productStatus) > severityRank(status)) {
            status = productStatus;
          }
        }
      }

      const svc = {
        name,
        slug: name.toLowerCase().replace(/[\/\s]+/g, '-'),
        region: 'global',
        status,
        statusRaw: status,
      };

      servicesByCategory[category].push(svc);
      services.push(svc);
    }
  }

  // 5. Fetch Atom feed for recent events
  let recentEvents = [];
  try {
    const feedRes = await fetch(GCP_FEED_URL, {
      headers: { 'User-Agent': 'CloudStatusMonitor/1.0' },
      timeout: 10000,
    });

    if (feedRes.ok) {
      const feedXml = await feedRes.text();
      const feedData = await parseXml(feedXml);
      const entries = feedData?.feed?.entry;
      if (entries) {
        const entryList = Array.isArray(entries) ? entries : [entries];
        recentEvents = entryList.slice(0, 30).map((entry) => ({
          title: entry.title?._ || entry.title || '',
          description: ((entry.content?._ || entry.content || '')
            .replace(/<[^>]*>/g, '')
            .trim()
            .slice(0, 500)),
          date: entry.updated || entry.published || '',
          guid: entry.id || '',
          service: extractServiceFromEntry(entry),
          type: classifyGCPEvent(
            entry.title?._ || entry.title || '',
            entry.content?._ || entry.content || ''
          ),
        }));
      }
    }
  } catch (feedErr) {
    console.warn('GCP feed fetch warning:', feedErr.message);
  }

  // 6. Calculate overall status
  const hasDisruption = services.some((s) => s.status === 'disruption');
  const hasDegraded = services.some((s) => s.status === 'degraded');
  const hasInfo = services.some((s) => s.status === 'informational');

  let overallStatus = 'operational';
  if (hasDisruption) overallStatus = 'disruption';
  else if (hasDegraded) overallStatus = 'degraded';
  else if (hasInfo) overallStatus = 'informational';

  return {
    provider: 'GCP',
    overallStatus,
    totalServices: services.length,
    categories,
    servicesByCategory,
    services,
    recentEvents,
    activeIncidents: activeIncidents.length,
  };
}

function severityRank(status) {
  switch (status) {
    case 'disruption': return 3;
    case 'degraded': return 2;
    case 'informational': return 1;
    default: return 0;
  }
}

function extractServiceFromEntry(entry) {
  const title = entry.title?._ || entry.title || '';
  // GCP feed titles often contain the product name
  const match = title.match(/^(.*?)(?:\s*[-–—]|\s*:)/);
  return match ? match[1].trim() : title.split(' ').slice(0, 4).join(' ');
}

function classifyGCPEvent(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  if (text.includes('resolved') || text.includes('service has been restored')) return 'resolved';
  if (text.includes('outage') || text.includes('unavailable') || text.includes('service_outage')) return 'disruption';
  if (text.includes('degraded') || text.includes('disruption') || text.includes('elevated error')) return 'degraded';
  if (text.includes('maintenance') || text.includes('planned')) return 'maintenance';
  if (text.includes('change') || text.includes('update') || text.includes('deprecation')) return 'change';
  return 'informational';
}

module.exports = { fetchGCPStatus };
