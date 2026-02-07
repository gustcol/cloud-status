const fetch = require('node-fetch');
const { parseString } = require('xml2js');

// AWS Health Dashboard API
const AWS_EVENTS_URL = 'https://health.aws.amazon.com/public/currentevents';
const AWS_RSS_URL = 'https://status.aws.amazon.com/rss/all.rss';

// Predefined list of major AWS service categories
// AWS doesn't expose a service catalog API, so we define the key services
const AWS_SERVICE_CATALOG = {
  Compute: [
    'Amazon EC2', 'AWS Lambda', 'Amazon ECS', 'Amazon EKS',
    'AWS Fargate', 'Amazon Lightsail', 'AWS Batch',
  ],
  Storage: [
    'Amazon S3', 'Amazon EBS', 'Amazon EFS', 'Amazon Glacier',
    'AWS Storage Gateway',
  ],
  Database: [
    'Amazon RDS', 'Amazon DynamoDB', 'Amazon Aurora',
    'Amazon ElastiCache', 'Amazon Redshift', 'Amazon DocumentDB',
  ],
  Networking: [
    'Amazon VPC', 'Amazon CloudFront', 'Amazon Route 53',
    'Elastic Load Balancing', 'AWS Direct Connect', 'Amazon API Gateway',
  ],
  'Application Integration': [
    'Amazon SQS', 'Amazon SNS', 'Amazon EventBridge',
    'AWS Step Functions',
  ],
  'Security & Identity': [
    'AWS IAM', 'AWS KMS', 'Amazon Cognito',
    'AWS WAF', 'AWS Shield', 'AWS Secrets Manager',
  ],
  'Management & Monitoring': [
    'Amazon CloudWatch', 'AWS CloudFormation', 'AWS CloudTrail',
    'AWS Systems Manager', 'AWS Config',
  ],
  'AI & Machine Learning': [
    'Amazon SageMaker', 'Amazon Bedrock', 'Amazon Rekognition',
    'Amazon Comprehend', 'Amazon Polly', 'Amazon Transcribe',
  ],
  'Developer Tools': [
    'AWS CodePipeline', 'AWS CodeBuild', 'AWS CodeDeploy',
    'AWS CodeCommit',
  ],
  Analytics: [
    'Amazon Kinesis', 'Amazon Athena', 'AWS Glue',
    'Amazon EMR', 'Amazon OpenSearch Service',
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

async function fetchAWSStatus() {
  // 1. Fetch current active events from the API
  let activeEvents = [];
  try {
    const eventsRes = await fetch(AWS_EVENTS_URL, {
      headers: { 'User-Agent': 'CloudStatusMonitor/1.0' },
      timeout: 15000,
    });
    if (eventsRes.ok) {
      // Response is UTF-16 encoded with BOM
      const arrayBuf = await eventsRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      // Try UTF-16 BE (BOM: FE FF) or UTF-16 LE
      let text;
      if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        text = buffer.swap16().toString('utf16le').replace(/^\uFEFF/, '');
      } else if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        text = buffer.toString('utf16le').replace(/^\uFEFF/, '');
      } else {
        text = buffer.toString('utf8');
      }
      activeEvents = JSON.parse(text);
    }
  } catch (err) {
    console.warn('AWS events fetch warning:', err.message);
  }

  // 2. Build services from catalog, marking affected ones
  const affectedServices = new Set();
  if (Array.isArray(activeEvents)) {
    for (const event of activeEvents) {
      if (event.service_name) affectedServices.add(event.service_name);
      if (event.service) affectedServices.add(event.service);
    }
  }

  const services = [];
  const categories = Object.keys(AWS_SERVICE_CATALOG);
  const servicesByCategory = {};

  for (const [category, svcNames] of Object.entries(AWS_SERVICE_CATALOG)) {
    servicesByCategory[category] = [];
    for (const name of svcNames) {
      const isAffected = affectedServices.has(name) ||
        [...affectedServices].some((s) => name.toLowerCase().includes(s.toLowerCase()));

      const event = Array.isArray(activeEvents)
        ? activeEvents.find((e) =>
            (e.service_name || '').toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes((e.service_name || '').toLowerCase())
          )
        : null;

      let status = 'operational';
      if (event) {
        const desc = ((event.description || '') + (event.status || '')).toLowerCase();
        if (desc.includes('disruption') || desc.includes('outage')) status = 'disruption';
        else if (desc.includes('degraded') || desc.includes('increased error')) status = 'degraded';
        else status = 'informational';
      }

      const svc = {
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        region: event?.region || 'global',
        status,
        statusRaw: status,
      };

      servicesByCategory[category].push(svc);
      services.push(svc);
    }
  }

  // 3. Fetch RSS for recent events/changes
  let recentEvents = [];
  try {
    const rssRes = await fetch(AWS_RSS_URL, {
      headers: { 'User-Agent': 'CloudStatusMonitor/1.0' },
      timeout: 10000,
    });

    if (rssRes.ok) {
      const rssXml = await rssRes.text();
      const rssData = await parseXml(rssXml);
      const items = rssData?.rss?.channel?.item;
      if (items) {
        const itemList = Array.isArray(items) ? items : [items];
        recentEvents = itemList.slice(0, 30).map((item) => ({
          title: item.title || '',
          description: (item.description || '').replace(/<[^>]*>/g, '').trim(),
          date: item.pubDate || '',
          guid: item.guid?._ || item.guid || '',
          service: extractServiceFromTitle(item.title || ''),
          type: classifyEvent(item.title || '', item.description || ''),
        }));
      }
    }
  } catch (rssErr) {
    console.warn('AWS RSS fetch warning:', rssErr.message);
  }

  // 4. Calculate overall status
  const hasDisruption = services.some((s) => s.status === 'disruption');
  const hasDegraded = services.some((s) => s.status === 'degraded');
  const hasInfo = services.some((s) => s.status === 'informational');

  let overallStatus = 'operational';
  if (hasDisruption) overallStatus = 'disruption';
  else if (hasDegraded) overallStatus = 'degraded';
  else if (hasInfo) overallStatus = 'informational';

  return {
    provider: 'AWS',
    overallStatus,
    totalServices: services.length,
    categories,
    servicesByCategory,
    services,
    recentEvents,
    activeIncidents: Array.isArray(activeEvents) ? activeEvents.length : 0,
  };
}

function extractServiceFromTitle(title) {
  const match = title.match(/:\s*(.+?)(?:\s*\(|$)/);
  return match ? match[1].trim() : title.split(':')[0]?.trim() || title;
}

function classifyEvent(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  if (text.includes('resolved') || text.includes('operating normally')) return 'resolved';
  if (text.includes('disruption') || text.includes('outage')) return 'disruption';
  if (text.includes('degraded') || text.includes('increased error')) return 'degraded';
  if (text.includes('informational') || text.includes('investigating')) return 'informational';
  if (text.includes('policy') || text.includes('change') || text.includes('update')) return 'change';
  return 'informational';
}

module.exports = { fetchAWSStatus };
