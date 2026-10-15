const fs = require('fs');
const path = require('path');

// In-memory / file-based fallback store for local dev or when blobs are unavailable
const localStore = new Map();
const LOCAL_PERSIST_FILE = path.join('/tmp', 'drm_vault_store.json');

// Attempt to load existing local cache if any
try {
  if (fs.existsSync(LOCAL_PERSIST_FILE)) {
    const raw = fs.readFileSync(LOCAL_PERSIST_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      localStore.set(k, v);
    }
  }
} catch (e) {
  // Ignore
}

function persistLocalStore() {
  try {
    const obj = {};
    for (const [k, v] of localStore.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(LOCAL_PERSIST_FILE, JSON.stringify(obj), 'utf8');
  } catch (e) {
    // Ignore
  }
}

async function getNetlifyBlobStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    // Check if Netlify Blobs environment is configured
    if (process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT || process.env.SITE_ID) {
      return getStore({ name: 'drm-vault', consistency: 'strong' });
    }
  } catch (e) {
    // Fall back to local store
  }
  return null;
}

/**
 * Save an encrypted image record
 */
async function saveImageRecord(token, record) {
  const store = await getNetlifyBlobStore();
  if (store) {
    try {
      await store.setJSON(token, record);
      return;
    } catch (e) {
      console.warn('Netlify Blobs write failed, falling back to local store:', e.message);
    }
  }
  localStore.set(token, record);
  persistLocalStore();
}

/**
 * Retrieve an image record
 */
async function getImageRecord(token) {
  const store = await getNetlifyBlobStore();
  if (store) {
    try {
      const data = await store.get(token, { type: 'json' });
      if (data) return data;
    } catch (e) {
      console.warn('Netlify Blobs read error:', e.message);
    }
  }
  return localStore.get(token) || null;
}

/**
 * Atomically burn / destroy the image payload
 */
async function burnImageRecord(token, reason = 'view_completed') {
  const record = await getImageRecord(token);
  if (!record) return null;

  record.is_burned = true;
  record.burned_at = new Date().toISOString();
  record.burn_reason = reason;
  // Shred encrypted image payload immediately from storage!
  delete record.encryptedData;
  delete record.iv;
  delete record.authTag;

  const store = await getNetlifyBlobStore();
  if (store) {
    try {
      await store.setJSON(token, record);
      return record;
    } catch (e) {
      console.warn('Netlify Blobs burn error:', e.message);
    }
  }

  localStore.set(token, record);
  persistLocalStore();
  return record;
}

/**
 * List uploads for a user
 */
async function listUserImages(userId) {
  const images = [];
  const store = await getNetlifyBlobStore();
  if (store) {
    try {
      const { blobs } = await store.list();
      for (const b of blobs) {
        const item = await store.get(b.key, { type: 'json' });
        if (item && item.userId === userId) {
          images.push({
            token: item.token,
            filename: item.filename,
            mimeType: item.mimeType,
            filesize: item.filesize,
            createdAt: item.createdAt,
            expiresAt: item.expiresAt,
            viewDuration: item.viewDuration,
            spotlightMode: item.spotlightMode,
            watermarkEnabled: item.watermarkEnabled,
            isViewed: item.isViewed,
            viewedAt: item.viewedAt,
            viewerIp: item.viewerIp,
            isBurned: item.isBurned,
            burnedAt: item.burnedAt
          });
        }
      }
      return images.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
      console.warn('Netlify Blobs list error:', e.message);
    }
  }

  for (const item of localStore.values()) {
    if (item && item.userId === userId) {
      images.push({
        token: item.token,
        filename: item.filename,
        mimeType: item.mimeType,
        filesize: item.filesize,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        viewDuration: item.viewDuration,
        spotlightMode: item.spotlightMode,
        watermarkEnabled: item.watermarkEnabled,
        isViewed: item.isViewed,
        viewedAt: item.viewedAt,
        viewerIp: item.viewerIp,
        isBurned: item.isBurned,
        burnedAt: item.burnedAt
      });
    }
  }
  return images.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Delete / revoke an image
 */
async function deleteImageRecord(token, userId) {
  const record = await getImageRecord(token);
  if (!record || record.userId !== userId) return false;

  const store = await getNetlifyBlobStore();
  if (store) {
    try {
      await store.delete(token);
    } catch (e) {
      // Ignore
    }
  }
  localStore.delete(token);
  persistLocalStore();
  return true;
}

module.exports = {
  saveImageRecord,
  getImageRecord,
  burnImageRecord,
  listUserImages,
  deleteImageRecord
};
