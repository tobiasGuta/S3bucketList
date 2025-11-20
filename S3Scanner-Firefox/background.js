// background.js

// Configuration
const CONCURRENCY_LIMIT = 4;
const PROBE_TIMEOUT_MS = 5000;
const ALARM_NAME = 'process-queue';

// State
let isRecording = false;
let probeQueue = [];
let activeProbes = 0;
let knownHosts = new Set(); // Cache to avoid re-probing in session

// Load initial state
browser.storage.local.get(['recording', 'buckets']).then((result) => {
  isRecording = result.recording || false;
  if (result.buckets) {
    Object.keys(result.buckets).forEach(h => knownHosts.add(h));
  }
});

// --- WebRequest Listener ---

browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!isRecording) return;
    
    try {
      const url = new URL(details.url);
      const hostname = url.hostname.toLowerCase();
      
      if (shouldProbeHost(hostname)) {
        enqueueProbe(hostname);
      }
    } catch (e) {
      // Ignore invalid URLs
    }
  },
  { urls: ["<all_urls>"] }
);

// --- Helpers ---

function shouldProbeHost(hostname) {
  if (knownHosts.has(hostname)) return false;
  
  // Filter out internal/extension hosts
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
  if (hostname.endsWith('.mozilla.org') || hostname.endsWith('.firefox.com')) return false;
  
  // Filter out common non-S3 hosts to reduce noise (optional but good practice)
  if (hostname.includes('google') || hostname.includes('facebook') || hostname.includes('microsoft')) return false;

  return true;
}

function enqueueProbe(hostname) {
  if (knownHosts.has(hostname)) return;
  knownHosts.add(hostname); // Mark as seen immediately to prevent duplicates in queue
  
  probeQueue.push(hostname);
  processQueue();
}

async function processQueue() {
  if (activeProbes >= CONCURRENCY_LIMIT || probeQueue.length === 0) return;

  const hostname = probeQueue.shift();
  activeProbes++;

  try {
    await probeHost(hostname);
  } catch (err) {
    console.error(`Probe failed for ${hostname}:`, err);
  } finally {
    activeProbes--;
    processQueue(); // Process next
  }
}

// --- Probing Logic ---

async function probeHost(hostname) {
  const results = {
    hostname: hostname,
    public: false,
    permissions: {
      listBucket: false,
      aclRead: false,
      aclWrite: false
    },
    date: Date.now(),
    owned: false
  };

  // 1. Probe ListBucket (GET /)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    
    const response = await fetch(`https://${hostname}/`, { 
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeout);

    // We process 200 OK (Public List) and 403 Forbidden (Exists but private)
    // But we only care if it's an S3 bucket.
    // Even 403 responses from S3 usually have headers or XML body indicating it's S3.
    // But for this scanner, we primarily want PUBLIC buckets.
    // However, to confirm it's S3, we might need to check headers like 'x-amz-request-id' or 'Server: AmazonS3'.
    
    const serverHeader = response.headers.get('Server');
    const region = response.headers.get('x-amz-bucket-region');
    const isS3Server = serverHeader && (serverHeader.includes('AmazonS3') || serverHeader.includes('MinIO'));

    if (region) results.region = region;

    if (response.status === 200) {
        const text = await response.text();
        const listBucketResult = parseListBucketXml(text);
        if (listBucketResult.isS3) {
            results.owned = true;
            results.public = true;
            results.permissions.listBucket = true;
            if (listBucketResult.owner) results.owner = listBucketResult.owner;
        } else if (isS3Server) {
             // It's S3 but maybe HTML index?
             results.owned = true;
        }
    } else if (isS3Server) {
        results.owned = true;
    }

  } catch (e) {
    // Network error or timeout
  }

  // 2. Probe ACL (GET /?acl)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    
    const response = await fetch(`https://${hostname}/?acl`, { 
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeout);

    if (response.status === 200) {
        const text = await response.text();
        const aclResult = parseAclXml(text);
        if (aclResult.isS3) {
            results.owned = true;
            if (aclResult.publicRead) {
                results.public = true;
                results.permissions.aclRead = true;
            }
            if (aclResult.publicWrite) {
                results.public = true;
                results.permissions.aclWrite = true;
            }
        }
    }
  } catch (e) {
      // Ignore
  }

  // Save if it's an S3 bucket (owned) and we found something interesting or just want to log it
  // The prompt says "Detect Amazon S3-style hostnames... stores findings".
  // We'll store if it's confirmed S3.
  if (results.owned) {
      await saveBucket(results);
  }
}

// --- Parsing (DOMParser) ---

function parseListBucketXml(xmlString) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, "text/xml");
        
        // Check for ListBucketResult
        const root = doc.documentElement;
        if (root.nodeName !== 'ListBucketResult') {
            return { isS3: false };
        }

        // Extract Owner if available
        // Note: Owner might be inside Metadata or just Owner tag
        // Standard S3 ListBucketResult has <Name>bucketname</Name> ...
        
        return { isS3: true, public: true }; 
    } catch (e) {
        return { isS3: false };
    }
}

function parseAclXml(xmlString) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, "text/xml");
        
        const root = doc.documentElement;
        if (root.nodeName !== 'AccessControlPolicy') {
            return { isS3: false };
        }

        let publicRead = false;
        let publicWrite = false;

        // Look for Grants
        const grants = doc.getElementsByTagName('Grant');
        for (let i = 0; i < grants.length; i++) {
            const grant = grants[i];
            const grantee = grant.getElementsByTagName('Grantee')[0];
            const permission = grant.getElementsByTagName('Permission')[0]?.textContent;
            
            if (grantee) {
                const uri = grantee.getElementsByTagName('URI')[0]?.textContent;
                // AllUsers group
                if (uri === 'http://acs.amazonaws.com/groups/global/AllUsers') {
                    if (permission === 'READ' || permission === 'FULL_CONTROL') publicRead = true;
                    if (permission === 'WRITE' || permission === 'FULL_CONTROL') publicWrite = true;
                }
            }
        }

        return { isS3: true, publicRead, publicWrite };
    } catch (e) {
        return { isS3: false };
    }
}

// --- Storage ---

async function saveBucket(bucket) {
    const data = await browser.storage.local.get('buckets');
    const buckets = data.buckets || {};
    
    // Merge permissions if exists
    if (buckets[bucket.hostname]) {
        const existing = buckets[bucket.hostname];
        bucket.permissions.listBucket = bucket.permissions.listBucket || existing.permissions.listBucket;
        bucket.permissions.aclRead = bucket.permissions.aclRead || existing.permissions.aclRead;
        bucket.permissions.aclWrite = bucket.permissions.aclWrite || existing.permissions.aclWrite;
    }
    
    buckets[bucket.hostname] = bucket;
    await browser.storage.local.set({ buckets });
    
    // Notify popup if open
    browser.runtime.sendMessage({ action: 'bucketUpdated', bucket }).catch(() => {});
}

// --- Messaging ---

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getBuckets') {
        browser.storage.local.get('buckets').then(data => {
            sendResponse(data.buckets || {});
        });
        return true; // Async response
    } else if (message.action === 'setRecording') {
        isRecording = message.enabled;
        browser.storage.local.set({ recording: isRecording });
    } else if (message.action === 'deleteBucket') {
        browser.storage.local.get('buckets').then(data => {
            const buckets = data.buckets || {};
            delete buckets[message.hostname];
            browser.storage.local.set({ buckets }).then(() => {
                sendResponse({ success: true });
            });
        });
        return true;
    }
});

// --- Alarms (Keep-alive / Retry) ---

browser.alarms.create(ALARM_NAME, { periodInMinutes: 1 });

browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        if (probeQueue.length > 0 && activeProbes < CONCURRENCY_LIMIT) {
            processQueue();
        }
    }
});
