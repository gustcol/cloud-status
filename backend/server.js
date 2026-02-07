const express = require('express');
const cors = require('cors');
const { fetchAWSStatus } = require('./services/aws');
const { fetchAzureStatus } = require('./services/azure');
const { fetchGCPStatus } = require('./services/gcp');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// In-memory cache
let cache = {
  aws: { status: null, lastUpdated: null },
  azure: { status: null, lastUpdated: null },
  gcp: { status: null, lastUpdated: null },
};

async function refreshAllStatus() {
  console.log(`[${new Date().toISOString()}] Refreshing cloud status...`);
  try {
    const [awsData, azureData, gcpData] = await Promise.allSettled([
      fetchAWSStatus(),
      fetchAzureStatus(),
      fetchGCPStatus(),
    ]);

    if (awsData.status === 'fulfilled') {
      cache.aws = { status: awsData.value, lastUpdated: new Date().toISOString() };
    } else {
      console.error('AWS fetch failed:', awsData.reason?.message);
    }

    if (azureData.status === 'fulfilled') {
      cache.azure = { status: azureData.value, lastUpdated: new Date().toISOString() };
    } else {
      console.error('Azure fetch failed:', azureData.reason?.message);
    }

    if (gcpData.status === 'fulfilled') {
      cache.gcp = { status: gcpData.value, lastUpdated: new Date().toISOString() };
    } else {
      console.error('GCP fetch failed:', gcpData.reason?.message);
    }

    console.log(`[${new Date().toISOString()}] Status refresh complete.`);
  } catch (err) {
    console.error('Refresh error:', err.message);
  }
}

// Refresh every 5 minutes
cron.schedule('*/5 * * * *', refreshAllStatus);

// Initial load
refreshAllStatus();

// --- API Routes ---

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/status', (_req, res) => {
  res.json({
    aws: cache.aws,
    azure: cache.azure,
    gcp: cache.gcp,
  });
});

app.get('/api/status/aws', (_req, res) => {
  res.json(cache.aws);
});

app.get('/api/status/azure', (_req, res) => {
  res.json(cache.azure);
});

app.get('/api/status/gcp', (_req, res) => {
  res.json(cache.gcp);
});

app.post('/api/refresh', async (_req, res) => {
  await refreshAllStatus();
  res.json({ message: 'Refreshed', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Cloud Status API running on port ${PORT}`);
});
