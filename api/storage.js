const fs = require('fs');
const path = require('path');

const localStore = new Map();
const LOCAL_PERSIST_FILE = path.join('/tmp', 'drm_vault_store.json');

try {
  if (fs.existsSync(LOCAL_PERSIST_FILE)) {
    const raw = fs.readFileSync(LOCAL_PERSIST_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      localStore.set(k, v);
    }
  }
} catch (e) {}

function persistLocalStore() {
  try {
    const obj = {};
    for (const [k, v] of localStore.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(LOCAL_PERSIST_FILE, JSON.stringify(obj), 'utf8');
  } catch (e) {}
}

async function saveImageRecord(token, record) {
  localStore.set(token, record);
  persistLocalStore();
}

async function getImageRecord(token) {
  // Reload from /tmp if not in memory
  if (!localStore.has(token) && fs.existsSync(LOCAL_PERSIST_FILE)) {
    try {
      const raw = fs.readFileSync(LOCAL_PERSIST_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed[token]) localStore.set(token, parsed[token]);
    } catch (e) {}
  }
  return localStore.get(token) || null;
}

async function burnImageRecord(token, reason = 'view_completed') {
  const record = await getImageRecord(token);
  if (!record) return null;

  record.is_burned = true;
  record.isBurned = true;
  record.is_viewed = true;
  record.isViewed = true;
  record.burned_at = new Date().toISOString();
  record.burnedAt = record.burned_at;
  record.burn_reason = reason;
  record.burnReason = reason;

  delete record.encryptedData;
  delete record.iv;
  delete record.authTag;

  localStore.set(token, record);
  persistLocalStore();
  return record;
}

async function listUserImages(userId) {
  const images = [];
  if (fs.existsSync(LOCAL_PERSIST_FILE)) {
    try {
      const raw = fs.readFileSync(LOCAL_PERSIST_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        if (!localStore.has(k)) localStore.set(k, v);
      }
    } catch (e) {}
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
        allowScreenshots: item.allowScreenshots,
        allowDownload: item.allowDownload,
        spotlightMode: item.spotlightMode,
        spotlightIntensity: item.spotlightIntensity || 'full',
        watermarkEnabled: item.watermarkEnabled,
        isViewed: item.isViewed || item.is_viewed,
        viewedAt: item.viewedAt,
        viewerIp: item.viewerIp,
        isBurned: item.isBurned || item.is_burned,
        burnedAt: item.burnedAt
      });
    }
  }
  return images.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function updateImageRecord(token, updates, userId) {
  const record = await getImageRecord(token);
  if (!record) return null;
  if (userId && record.userId !== userId) return null;
  if (record.isBurned || record.isViewed || record.is_burned || record.is_viewed) {
    throw new Error('Cannot edit or extend an image link that has already been viewed or burned.');
  }

  if (updates.viewDuration !== undefined) {
    record.viewDuration = parseInt(updates.viewDuration, 10) || 0;
  }
  if (updates.allowScreenshots !== undefined) {
    record.allowScreenshots = Boolean(updates.allowScreenshots);
  }
  if (updates.allowDownload !== undefined) {
    record.allowDownload = Boolean(updates.allowDownload);
  }
  if (updates.watermarkEnabled !== undefined) {
    record.watermarkEnabled = Boolean(updates.watermarkEnabled);
  }
  if (updates.spotlightMode !== undefined) {
    record.spotlightMode = Boolean(updates.spotlightMode);
  }
  if (updates.spotlightIntensity !== undefined) {
    record.spotlightIntensity = ['small', 'large', 'full'].includes(updates.spotlightIntensity) ? updates.spotlightIntensity : 'full';
  }

  localStore.set(token, record);
  persistLocalStore();
  return record;
}

async function deleteImageRecord(token, userId) {
  const record = await getImageRecord(token);
  if (!record || (userId && record.userId !== userId)) return false;
  localStore.delete(token);
  persistLocalStore();
  return true;
}

module.exports = {
  saveImageRecord,
  getImageRecord,
  burnImageRecord,
  listUserImages,
  deleteImageRecord,
  updateImageRecord
};
