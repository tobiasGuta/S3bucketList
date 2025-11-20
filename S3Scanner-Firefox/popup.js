document.addEventListener('DOMContentLoaded', async () => {
  const recordingToggle = document.getElementById('recordingToggle');
  const statusText = document.getElementById('statusText');
  const bucketList = document.getElementById('bucketList');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');

  // Load initial state
  const { recording } = await browser.storage.local.get('recording');
  recordingToggle.checked = !!recording;
  updateStatusText(!!recording);

  // Load buckets
  loadBuckets();

  // Listeners
  recordingToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    updateStatusText(enabled);
    browser.runtime.sendMessage({ action: 'setRecording', enabled });
  });

  exportBtn.addEventListener('click', exportBuckets);
  
  clearBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all discovered buckets?')) {
          await browser.storage.local.set({ buckets: {} });
          loadBuckets();
      }
  });

  // Message listener for updates
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'bucketUpdated') {
      loadBuckets();
    }
  });

  function updateStatusText(enabled) {
    statusText.textContent = enabled ? 'Recording On' : 'Recording Off';
    statusText.style.color = enabled ? '#2196F3' : '#666';
  }

  async function loadBuckets() {
    const buckets = await browser.runtime.sendMessage({ action: 'getBuckets' });
    renderBuckets(buckets);
  }

  function renderBuckets(buckets) {
    bucketList.innerHTML = '';
    const keys = Object.keys(buckets).sort((a, b) => buckets[b].date - buckets[a].date);

    if (keys.length === 0) {
      bucketList.innerHTML = '<div class="empty-state">No buckets found yet.</div>';
      return;
    }

    keys.forEach(hostname => {
      const bucket = buckets[hostname];
      const el = document.createElement('div');
      el.className = 'bucket-item';
      
      let badges = '';
      if (bucket.permissions.listBucket) badges += '<span class="perm-badge warning">ListBucket</span>';
      if (bucket.permissions.aclRead) badges += '<span class="perm-badge danger">ACL Read</span>';
      if (bucket.permissions.aclWrite) badges += '<span class="perm-badge danger">ACL Write</span>';
      if (!badges) badges = '<span class="perm-badge">Private</span>';

      el.innerHTML = `
        <div class="bucket-info">
          <a href="https://${bucket.hostname}" target="_blank" class="bucket-host">${bucket.hostname}</a>
          <div class="bucket-perms">
            ${badges}
            ${bucket.region ? `<span class="perm-badge" style="background: #e3f2fd; color: #1565c0;">${bucket.region}</span>` : ''}
            <span style="margin-left: 8px; color: #999;">${new Date(bucket.date).toLocaleTimeString()}</span>
          </div>
        </div>
        <div class="bucket-actions">
          <button class="delete-btn" title="Remove">×</button>
        </div>
      `;

      el.querySelector('.delete-btn').addEventListener('click', async () => {
        await browser.runtime.sendMessage({ action: 'deleteBucket', hostname: bucket.hostname });
        loadBuckets();
      });

      bucketList.appendChild(el);
    });
  }

  async function exportBuckets() {
    const buckets = await browser.runtime.sendMessage({ action: 'getBuckets' });
    const json = JSON.stringify(buckets, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `s3-buckets-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
});
