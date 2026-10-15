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
        isGoogleSender: Boolean(item.isGoogleSender),
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

// --- USER ACCOUNT & USERNAME CLAIM SYSTEM ---
function getClaimedUsernamesMap() {
  if (!localStore.has('__claimed_usernames__')) {
    localStore.set('__claimed_usernames__', {});
  }
  return localStore.get('__claimed_usernames__');
}

function getEphemeralAccountsMap() {
  if (!localStore.has('__ephemeral_accounts__')) {
    localStore.set('__ephemeral_accounts__', {});
  }
  return localStore.get('__ephemeral_accounts__');
}

async function cleanupExpiredAccounts() {
  const now = Date.now();
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  const ephemerals = getEphemeralAccountsMap();
  const expiredUserIds = [];

  for (const [key, account] of Object.entries(ephemerals)) {
    if (account && account.createdAt && (now - account.createdAt > TWELVE_HOURS)) {
      expiredUserIds.push('user_' + key);
      delete ephemerals[key];
    }
  }

  // Shred images from expired ephemeral accounts older than 12 hours
  if (expiredUserIds.length > 0) {
    for (const [key, item] of localStore.entries()) {
      if (item && item.userId && expiredUserIds.includes(item.userId)) {
        if (!item.isGoogleSender) {
          localStore.delete(key);
        }
      }
    }
  }

  persistLocalStore();
}

async function getGoogleUserClaimedUsername(googleUid) {
  const claimed = getClaimedUsernamesMap();
  for (const [uname, record] of Object.entries(claimed)) {
    if (record && record.googleUid === googleUid) {
      return record;
    }
  }
  return null;
}

async function isUsernameClaimed(rawUsername) {
  const clean = String(rawUsername).trim().toLowerCase();
  const claimed = getClaimedUsernamesMap();
  return claimed[clean] || null;
}

async function checkUsernameAvailability(rawUsername, googleUid) {
  await cleanupExpiredAccounts();
  const raw = String(rawUsername || '').trim();
  const clean = raw.toLowerCase();

  if (!raw || raw.length < 2) {
    return { available: false, error: 'Username must be at least 2 characters.' };
  }
  if (raw.length > 30) {
    return { available: false, error: 'Username cannot exceed 30 characters.' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(raw)) {
    return { available: false, error: 'Only letters, numbers, underscores (_), and hyphens (-) are allowed.' };
  }

  const claimed = getClaimedUsernamesMap();
  const existingClaim = claimed[clean];

  if (existingClaim) {
    if (googleUid && existingClaim.googleUid === googleUid) {
      return { available: true, isCurrent: true, message: `@${raw} is already your claimed username.` };
    }
    return { available: false, error: `@${raw} is already taken by another user.` };
  }

  return { available: true, message: `@${raw} is available to claim!` };
}

async function claimUsernameForGoogle(rawUsername, googleData) {
  await cleanupExpiredAccounts();
  const clean = String(rawUsername).trim().toLowerCase();
  const claimed = getClaimedUsernamesMap();

  if (claimed[clean] && claimed[clean].googleUid !== googleData.googleUid) {
    throw new Error(`Username @${rawUsername} is already permanently claimed by another Google account.`);
  }

  // Remove any previously claimed username by this Google UID if changing
  for (const [u, rec] of Object.entries(claimed)) {
    if (rec && rec.googleUid === googleData.googleUid && u !== clean) {
      delete claimed[u];
    }
  }

  const record = {
    username: rawUsername.trim(),
    cleanUsername: clean,
    googleUid: googleData.googleUid,
    email: googleData.email,
    displayName: googleData.displayName || rawUsername,
    photoURL: googleData.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(rawUsername)}`,
    claimedAt: new Date().toISOString(),
    isGoogleVerified: true
  };

  claimed[clean] = record;

  // Remove from ephemeral accounts if present
  const ephemerals = getEphemeralAccountsMap();
  delete ephemerals[clean];

  persistLocalStore();
  return record;
}

async function registerEphemeralUsername(rawUsername) {
  await cleanupExpiredAccounts();
  const clean = String(rawUsername).trim().toLowerCase();
  const claimed = getClaimedUsernamesMap();

  if (claimed[clean]) {
    throw new Error(`Username @${rawUsername} is permanently claimed by a verified Google account. Sign in with Google to use it.`);
  }

  const ephemerals = getEphemeralAccountsMap();
  const now = Date.now();
  const account = {
    username: rawUsername.trim(),
    cleanUsername: clean,
    createdAt: now,
    expiresAt: now + (12 * 60 * 60 * 1000), // 12 hours lifespan
    isGoogleVerified: false
  };

  ephemerals[clean] = account;
  persistLocalStore();
  return account;
}

module.exports = {
  saveImageRecord,
  getImageRecord,
  burnImageRecord,
  listUserImages,
  deleteImageRecord,
  updateImageRecord,
  getGoogleUserClaimedUsername,
  claimUsernameForGoogle,
  registerEphemeralUsername,
  isUsernameClaimed,
  checkUsernameAvailability,
  cleanupExpiredAccounts
};
