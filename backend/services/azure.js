const fetch = require('node-fetch');
const https = require('https');
const { parseString } = require('xml2js');

// Allow self-signed certs for Azure RSS endpoint
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const AZURE_STATUS_URL = 'https://azure.status.microsoft/en-us/status';
const AZURE_RSS_URL = 'https://rssfeed.azure.status.microsoft/en-us/status/feed/';

// Predefined Azure service categories (same as AWS approach for consistency)
const AZURE_SERVICE_CATALOG = {
  Compute: [
    'Virtual Machines', 'Virtual Machine Scale Sets', 'App Service',
    'App Service (Linux)', 'Azure Functions', 'Azure Kubernetes Service (AKS)',
    'Container Instances', 'Batch', 'Cloud Services',
    'Azure Spring Apps',
  ],
  Storage: [
    'Storage Accounts', 'Azure Backup', 'Azure Site Recovery',
    'StorSimple', 'Azure NetApp Files', 'Azure HPC Cache',
    'Azure Managed Lustre',
  ],
  Database: [
    'Azure Cosmos DB', 'Azure SQL Database', 'Azure Database for MySQL',
    'Azure Database for PostgreSQL', 'Azure Database for MariaDB',
    'Azure Cache for Redis', 'Azure SQL Managed Instance',
  ],
  Networking: [
    'Virtual Network', 'Load Balancer', 'VPN Gateway',
    'Application Gateway', 'Azure Firewall', 'Azure DDoS Protection',
    'Network Infrastructure', 'ExpressRoute Circuits',
    'Azure Private Link', 'Azure Front Door', 'Virtual WAN',
    'Network Watcher', 'Web Application Firewall',
  ],
  'AI & Machine Learning': [
    'Azure Machine Learning', 'Cognitive Services', 'Azure AI services',
    'Azure AI Search', 'Azure AI Language', 'Azure AI Vision',
    'Azure AI Speech', 'Azure AI Translator', 'Azure OpenAI',
  ],
  'Integration & Messaging': [
    'Service Bus', 'Event Grid', 'Event Hubs', 'API Management',
    'Logic Apps', 'Notification Hubs', 'Azure SignalR Service',
  ],
  'Identity & Security': [
    'Azure Active Directory', 'Key Vault', 'Azure Sentinel',
    'Microsoft Defender for Cloud', 'Azure DDoS Protection',
  ],
  'Management & Monitoring': [
    'Azure Monitor', 'Log Analytics', 'Azure Resource Manager',
    'Automation', 'Azure Policy', 'Azure Advisor',
  ],
  Analytics: [
    'Azure Synapse Analytics', 'HDInsight', 'Azure Databricks',
    'Azure Data Factory', 'Azure Stream Analytics',
    'Azure Data Explorer', 'Power BI Embedded',
  ],
  DevOps: [
    'Azure DevOps', 'Azure DevTest Labs', 'Container Registry',
  ],
};

function parseXml(xml) {
  return new Promise((resolve, reject) => {
    parseString(xml, { explicitArray: false }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function mapDataLabel(label) {
  switch ((label || '').toLowerCase()) {
    case 'good':
      return 'operational';
    case 'warning':
      return 'degraded';
    case 'critical':
    case 'error':
      return 'disruption';
    case 'not available':
      return 'operational'; // Not available in a region means N/A, not down
    case 'information':
    case 'advisory':
      return 'informational';
    default:
      return 'operational';
  }
}

async function fetchAzureStatus() {
  // 1. Fetch the status page HTML to extract service statuses
  let serviceStatuses = {};
  try {
    const htmlRes = await fetch(AZURE_STATUS_URL, {
      headers: { 'User-Agent': 'CloudStatusMonitor/1.0' },
      timeout: 20000,
    });

    if (htmlRes.ok) {
      const html = await htmlRes.text();
      serviceStatuses = parseAzureHTML(html);
    }
  } catch (err) {
    console.warn('Azure HTML fetch warning:', err.message);
  }

  // 2. Build service list from catalog, enriching with scraped status
  const services = [];
  const categories = Object.keys(AZURE_SERVICE_CATALOG);
  const servicesByCategory = {};

  for (const [category, svcNames] of Object.entries(AZURE_SERVICE_CATALOG)) {
    servicesByCategory[category] = [];
    for (const name of svcNames) {
      const scraped = serviceStatuses[name.toLowerCase()];

      const svc = {
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        region: 'global',
        status: scraped ? scraped.status : 'operational',
        statusRaw: scraped ? scraped.dataLabel : 'Good',
      };

      servicesByCategory[category].push(svc);
      services.push(svc);
    }
  }

  // 3. Fetch RSS for recent events
  let recentEvents = [];
  try {
    const rssRes = await fetch(AZURE_RSS_URL, {
      headers: { 'User-Agent': 'CloudStatusMonitor/1.0' },
      timeout: 10000,
      agent: httpsAgent,
    });

    if (rssRes.ok) {
      const rssXml = await rssRes.text();
      const rssData = await parseXml(rssXml);
      const items = rssData?.rss?.channel?.item;
      if (items) {
        const itemList = Array.isArray(items) ? items : [items];
        recentEvents = itemList.slice(0, 30).map((item) => {
          const categories = item.category;
          const categoryList = Array.isArray(categories) ? categories : categories ? [categories] : [];

          return {
            title: item.title || '',
            description: (item.description || '').replace(/<[^>]*>/g, '').trim(),
            date: item.pubDate || '',
            guid: item.guid?._ || item.guid || '',
            service: categoryList.slice(0, 5).join(', '),
            type: classifyAzureEvent(item.title || '', item.description || ''),
          };
        });
      }
    }
  } catch (rssErr) {
    console.warn('Azure RSS fetch warning:', rssErr.message);
  }

  // 4. Overall status
  const hasDisruption = services.some((s) => s.status === 'disruption');
  const hasDegraded = services.some((s) => s.status === 'degraded');
  const hasInfo = services.some((s) => s.status === 'informational');

  let overallStatus = 'operational';
  if (hasDisruption) overallStatus = 'disruption';
  else if (hasDegraded) overallStatus = 'degraded';
  else if (hasInfo) overallStatus = 'informational';

  return {
    provider: 'Azure',
    overallStatus,
    totalServices: services.length,
    categories,
    servicesByCategory,
    services,
    recentEvents,
  };
}

function parseAzureHTML(html) {
  // Parse service statuses from the Azure status page HTML.
  // Each service row has multiple region columns with data-label values.
  // We find the "default" table (the initially visible one) and parse it.
  // A service is degraded only if a significant portion of regions are affected,
  // or we report the worst status but include region info.
  const results = {};

  // Use the default table (the one shown on page load)
  const defaultTableMatch = /<table[^>]*class="[^"]*default[^"]*"[^>]*>([\s\S]*?)<\/table>/.exec(html);
  const tableHTML = defaultTableMatch ? defaultTableMatch[1] : html;

  const rowRegex = /<tr[^>]*>\s*<td[^>]*>\s*<span>([^<]+)<\/span>\s*<\/td>([\s\S]*?)<\/tr>/g;
  let match;

  while ((match = rowRegex.exec(tableHTML)) !== null) {
    const serviceName = match[1].trim();
    const restOfRow = match[2];

    // Count status labels across all region columns
    const labelRegex = /data-label="([^"]*)"/g;
    let labelMatch;
    let goodCount = 0;
    let warnCount = 0;
    let critCount = 0;
    let totalRegions = 0;

    while ((labelMatch = labelRegex.exec(restOfRow)) !== null) {
      const label = (labelMatch[1] || '').toLowerCase();
      if (label === 'good') { goodCount++; totalRegions++; }
      else if (label === 'warning') { warnCount++; totalRegions++; }
      else if (label === 'critical' || label === 'error') { critCount++; totalRegions++; }
      // 'not available' and '' are not counted as real regions
    }

    let status = 'operational';
    let dataLabel = 'Good';

    if (critCount > 0) {
      const critRatio = critCount / Math.max(totalRegions, 1);
      if (critRatio >= 0.5) status = 'disruption';
      else if (critRatio >= 0.2) status = 'degraded';
      else status = 'informational';
      dataLabel = 'Critical';
    } else if (warnCount > 0) {
      const warnRatio = warnCount / Math.max(totalRegions, 1);
      if (warnRatio >= 0.5) status = 'degraded';
      else if (warnRatio >= 0.15) status = 'informational';
      // If only 1 region out of many is affected, keep operational
      dataLabel = 'Warning';
    }

    results[serviceName.toLowerCase()] = {
      status,
      dataLabel,
      regionStats: { good: goodCount, warning: warnCount, critical: critCount, total: totalRegions },
    };
  }

  return results;
}

function classifyAzureEvent(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  if (text.includes('resolved') || text.includes('mitigated') || text.includes('recovery complete')) return 'resolved';
  if (text.includes('disruption') || text.includes('outage') || text.includes('unavailable')) return 'disruption';
  if (text.includes('degraded') || text.includes('intermittent') || text.includes('degradation')) return 'degraded';
  if (text.includes('maintenance') || text.includes('planned')) return 'maintenance';
  if (text.includes('policy') || text.includes('change') || text.includes('update') || text.includes('retirement')) return 'change';
  return 'informational';
}

module.exports = { fetchAzureStatus };
