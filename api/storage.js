// Persistent storage for OneView.
//
// Production: Cloud Firestore via the Firebase Admin SDK (shared across every
// serverless instance and every deploy). Credentials come from the
// FIREBASE_SERVICE_ACCOUNT env var (raw JSON or base64-encoded JSON).
// Firestore security rules should deny all client access; the Admin SDK
// bypasses rules, so only this server can read/write.
//
// Local dev / tests: if no credentials are set, an in-memory adapter with the
// same interface is used.
//
// Collections:
//   images/{token}                  image metadata (no ciphertext)
//   images/{token}/chunks/{i}       ciphertext split into <=900KB chunks
//   claimed_usernames/{clean}       permanent Google-claimed handles
//   ephemeral_accounts/{clean}      12-hour username-only accounts

const CHUNK_SIZE = 900 * 1024; // Firestore docs max out at 1 MiB
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

const COL_IMAGES = 'images';
const COL_CLAIMED = 'claimed_usernames';
const COL_EPHEMERAL = 'ephemeral_accounts';
const chunkCol = (token) => `${COL_IMAGES}/${token}/chunks`;

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(text);
  } catch (e) {
    console.error('FIREBASE_SERVICE_ACCOUNT is set but could not be parsed:', e.message);
    return null;
  }
}

function createFirestoreAdapter(serviceAccount) {
  const { initializeApp, getApps, cert } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');

  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch (e) {
    // settings() can only be called once per instance; ignore on warm reuse
  }

  const ref = (col, id) => db.collection(col).doc(String(id));

  return {
    kind: 'firestore',
    async get(col, id) {
      const snap = await ref(col, id).get();
      return snap.exists ? snap.data() : null;
    },
    async set(col, id, data) {
      await ref(col, id).set(data);
    },
    async delete(col, id) {
      await ref(col, id).delete();
    },
    async queryEq(col, field, value) {
      const snap = await db.collection(col).where(field, '==', value).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    async queryLt(col, field, value) {
      const snap = await db.collection(col).where(field, '<', value).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    async transaction(fn) {
      return db.runTransaction(async (t) => {
        const tx = {
          async get(col, id) {
            const snap = await t.get(ref(col, id));
            return snap.exists ? snap.data() : null;
          },
          set(col, id, data) {
            t.set(ref(col, id), data);
          },
          delete(col, id) {
            t.delete(ref(col, id));
          }
        };
        return fn(tx);
      });
    }
  };
}

function createMemoryAdapter() {
  const cols = new Map();
  const colMap = (col) => {
    if (!cols.has(col)) cols.set(col, new Map());
    return cols.get(col);
  };
  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

  const adapter = {
    kind: 'memory',
    async get(col, id) {
      return clone(colMap(col).get(String(id)));
    },
    async set(col, id, data) {
      colMap(col).set(String(id), clone(data));
    },
    async delete(col, id) {
      colMap(col).delete(String(id));
    },
    async queryEq(col, field, value) {
      return [...colMap(col).entries()]
        .filter(([, d]) => d && d[field] === value)
        .map(([id, d]) => ({ id, data: clone(d) }));
    },
    async queryLt(col, field, value) {
      return [...colMap(col).entries()]
        .filter(([, d]) => d && d[field] < value)
        .map(([id, d]) => ({ id, data: clone(d) }));
    },
    async transaction(fn) {
      // Single-threaded event loop: run reads and writes directly.
      const tx = {
        get: (col, id) => adapter.get(col, id),
        set: (col, id, data) => { colMap(col).set(String(id), clone(data)); },
        delete: (col, id) => { colMap(col).delete(String(id)); }
      };
      return fn(tx);
    }
  };
  return adapter;
}

const serviceAccount = loadServiceAccount();
const db = serviceAccount ? createFirestoreAdapter(serviceAccount) : createMemoryAdapter();
if (db.kind === 'memory') {
  console.warn('[storage] FIREBASE_SERVICE_ACCOUNT not set: using in-memory storage (data is NOT shared or persisted).');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cleanName = (raw) => String(raw || '').trim().toLowerCase();

async function writeChunks(token, encryptedData) {
  const chunks = [];
  for (let i = 0; i < encryptedData.length; i += CHUNK_SIZE) {
    chunks.push(encryptedData.slice(i, i + CHUNK_SIZE));
  }
  await Promise.all(chunks.map((data, i) => db.set(chunkCol(token), i, { data })));
  return chunks.length;
}

async function readChunks(token, count) {
  const parts = await Promise.all(
    Array.from({ length: count }, (_, i) => db.get(chunkCol(token), i))
  );
  if (parts.some((p) => !p)) return null;
  return parts.map((p) => p.data).join('');
}

async function deleteChunks(token, count) {
  if (!count) return;
  await Promise.all(Array.from({ length: count }, (_, i) => db.delete(chunkCol(token), i)));
}

async function deleteImageCompletely(token, record) {
  await deleteChunks(token, record && record.chunkCount);
  await db.delete(COL_IMAGES, token);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

async function saveImageRecord(token, record) {
  const { encryptedData, ...meta } = record;
  const chunkCount = encryptedData ? await writeChunks(token, encryptedData) : 0;
  await db.set(COL_IMAGES, token, { ...meta, chunkCount });
}

async function getImageRecord(token) {
  if (!token) return null;
  const meta = await db.get(COL_IMAGES, token);
  if (!meta) return null;
  if (meta.chunkCount > 0) {
    const encryptedData = await readChunks(token, meta.chunkCount);
    if (encryptedData) meta.encryptedData = encryptedData;
  }
  return meta;
}

async function burnImageRecord(token, reason = 'view_completed') {
  const record = await db.get(COL_IMAGES, token);
  if (!record) return null;

  await deleteChunks(token, record.chunkCount);

  const burnedAt = new Date().toISOString();
  const updated = { ...record };
  delete updated.iv;
  delete updated.authTag;
  delete updated.encryptedData;
  Object.assign(updated, {
    chunkCount: 0,
    is_burned: true,
    isBurned: true,
    is_viewed: true,
    isViewed: true,
    burned_at: burnedAt,
    burnedAt,
    burn_reason: reason,
    burnReason: reason
  });

  await db.set(COL_IMAGES, token, updated);
  return updated;
}

async function listUserImages(userId) {
  const rows = await db.queryEq(COL_IMAGES, 'userId', userId);
  return rows
    .map(({ data: item }) => ({
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
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function updateImageRecord(token, updates, userId) {
  const record = await db.get(COL_IMAGES, token);
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

  await db.set(COL_IMAGES, token, record);
  return record;
}

async function deleteImageRecord(token, userId) {
  const record = await db.get(COL_IMAGES, token);
  if (!record || (userId && record.userId !== userId)) return false;
  await deleteImageCompletely(token, record);
  return true;
}

// ---------------------------------------------------------------------------
// User accounts & username claims
// ---------------------------------------------------------------------------

async function cleanupExpiredAccounts() {
  try {
    const expired = await db.queryLt(COL_EPHEMERAL, 'createdAt', Date.now() - TWELVE_HOURS);
    for (const { id } of expired) {
      await db.delete(COL_EPHEMERAL, id);
      // Shred images from the expired ephemeral account
      const images = await db.queryEq(COL_IMAGES, 'userId', 'user_' + id.replace(/[^a-z0-9_-]/g, '_'));
      for (const { id: token, data } of images) {
        if (!data.isGoogleSender) await deleteImageCompletely(token, data);
      }
    }
  } catch (e) {
    console.error('[storage] cleanupExpiredAccounts failed:', e.message);
  }
}

async function getGoogleUserClaimedUsername(googleUid) {
  if (!googleUid) return null;
  const rows = await db.queryEq(COL_CLAIMED, 'googleUid', googleUid);
  return rows.length ? rows[0].data : null;
}

async function isUsernameClaimed(rawUsername) {
  return db.get(COL_CLAIMED, cleanName(rawUsername));
}

async function checkUsernameAvailability(rawUsername, googleUid) {
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

  const existingClaim = await db.get(COL_CLAIMED, clean);
  if (existingClaim) {
    if (googleUid && existingClaim.googleUid === googleUid) {
      return { available: true, isCurrent: true, message: `@${raw} is already your claimed username.` };
    }
    return { available: false, error: `@${raw} is already taken by another user.` };
  }

  return { available: true, message: `@${raw} is available to claim!` };
}

async function claimUsernameForGoogle(rawUsername, googleData) {
  const clean = cleanName(rawUsername);
  const previous = await getGoogleUserClaimedUsername(googleData.googleUid);

  // Transaction: the availability check and the write happen atomically, so
  // two people can never claim the same handle at the same moment.
  return db.transaction(async (tx) => {
    const existing = await tx.get(COL_CLAIMED, clean);
    if (existing && existing.googleUid !== googleData.googleUid) {
      throw new Error(`Username @${rawUsername} is already permanently claimed by another Google account.`);
    }

    const record = {
      username: String(rawUsername).trim(),
      cleanUsername: clean,
      googleUid: googleData.googleUid,
      email: googleData.email || '',
      displayName: googleData.displayName || String(rawUsername).trim(),
      photoURL: googleData.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(rawUsername)}`,
      claimedAt: new Date().toISOString(),
      isGoogleVerified: true
    };

    // Release the user's previous handle if they are changing it
    if (previous && previous.cleanUsername && previous.cleanUsername !== clean) {
      tx.delete(COL_CLAIMED, previous.cleanUsername);
    }
    tx.set(COL_CLAIMED, clean, record);
    // Evict any ephemeral session holding this name
    tx.delete(COL_EPHEMERAL, clean);
    return record;
  });
}

async function registerEphemeralUsername(rawUsername) {
  await cleanupExpiredAccounts();
  const clean = cleanName(rawUsername);

  return db.transaction(async (tx) => {
    const claimed = await tx.get(COL_CLAIMED, clean);
    if (claimed) {
      throw new Error(`Username @${String(rawUsername).trim()} is permanently claimed by a verified Google account. Sign in with Google to use it.`);
    }

    const now = Date.now();
    const account = {
      username: String(rawUsername).trim(),
      cleanUsername: clean,
      createdAt: now,
      expiresAt: now + TWELVE_HOURS,
      isGoogleVerified: false
    };
    tx.set(COL_EPHEMERAL, clean, account);
    return account;
  });
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
  cleanupExpiredAccounts,
  storageKind: db.kind
};
