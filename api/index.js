const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { generateToken, encrypt, decrypt } = require('./crypto');
const {
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
} = require('./storage');

const app = express();

app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'drm-vault-jwt-session-secret-key-9988';

function parseUser(req) {
  const cookieHeader = (req.headers && (req.headers.cookie || req.headers.Cookie)) || '';
  const cookies = {};
  cookieHeader.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v.join('='));
  });

  const token = cookies.vault_session || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function stringifyCookie(name, value, options = {}) {
  let str = `${name}=${value}`;
  if (options.maxAge != null) str += `; Max-Age=${options.maxAge}`;
  if (options.path) str += `; Path=${options.path}`;
  if (options.httpOnly) str += '; HttpOnly';
  if (options.secure) str += '; Secure';
  if (options.sameSite) str += `; SameSite=${options.sameSite}`;
  return str;
}

function getClientIp(req) {
  const headers = req.headers || {};
  return (
    headers['x-forwarded-for']?.split(',')[0].trim() ||
    headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

// --- AUTH ROUTES ---
app.get(['/api/auth', '/api/auth/me'], (req, res) => {
  const user = parseUser(req);
  if (!user || !user.username) {
    return res.json({ authenticated: false, user: null });
  }
  return res.json({ authenticated: true, user });
});

app.post(['/api/auth/login', '/api/auth/username'], async (req, res) => {
  const rawUsername = req.body.username ? String(req.body.username).trim() : '';

  if (!rawUsername || rawUsername.length < 2) {
    return res.status(400).json({ error: 'Please enter a username (at least 2 characters).' });
  }

  if (rawUsername.length > 30) {
    return res.status(400).json({ error: 'Username cannot exceed 30 characters.' });
  }

  try {
    const account = await registerEphemeralUsername(rawUsername);
    const user = {
      id: 'user_' + rawUsername.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
      username: rawUsername,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(rawUsername)}`,
      isGoogleVerified: false,
      expiresAt: account.expiresAt
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '12h' });
    const setCookie = stringifyCookie('vault_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 12 * 60 * 60, // 12 hours ephemeral
      path: '/'
    });

    res.setHeader('Set-Cookie', setCookie);
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Real-time username availability check (used by claim handle modal)
app.get('/api/auth/check-username', async (req, res) => {
  const user = parseUser(req);
  const rawUsername = req.query.username ? String(req.query.username).trim() : '';
  const googleUid = req.query.googleUid || (user && user.googleUid);
  const result = await checkUsernameAvailability(rawUsername, googleUid);
  return res.json(result);
});

// Check if a Google user has already claimed a username
app.get('/api/auth/google/status', async (req, res) => {
  const googleUid = req.query.googleUid ? String(req.query.googleUid) : '';
  if (!googleUid) {
    return res.status(400).json({ error: 'googleUid parameter required' });
  }
  const claimedRecord = await getGoogleUserClaimedUsername(googleUid);
  return res.json({
    claimed: Boolean(claimedRecord),
    record: claimedRecord || null
  });
});

// Google Auth sign-in (does NOT auto-claim immediately, lets user pick/change handle)
app.post('/api/auth/google', async (req, res) => {
  const { googleUid, email, displayName, photoURL } = req.body;

  if (!googleUid) {
    return res.status(400).json({ error: 'googleUid is required' });
  }

  try {
    const existingClaim = await getGoogleUserClaimedUsername(googleUid);
    const hasClaimedUsername = Boolean(existingClaim);
    const fallbackHandle = (displayName || (email ? email.split('@')[0] : 'User')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'User';
    const activeUsername = existingClaim ? existingClaim.username : fallbackHandle;

    const user = {
      id: 'google_' + googleUid,
      username: activeUsername,
      hasClaimedUsername,
      email: email || '',
      displayName: displayName || activeUsername,
      avatar: photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(activeUsername)}`,
      isGoogleVerified: true,
      googleUid
    };

    // Google accounts are permanent: 365 days session
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '365d' });
    const setCookie = stringifyCookie('vault_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 365 * 24 * 60 * 60,
      path: '/'
    });

    res.setHeader('Set-Cookie', setCookie);
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Explicit handle claiming (checks availability before claiming)
app.post('/api/auth/google/claim', async (req, res) => {
  const user = parseUser(req);
  const googleUid = req.body.googleUid || (user && user.googleUid);
  const rawUsername = req.body.username || req.body.claimedUsername;

  if (!googleUid) {
    return res.status(401).json({ error: 'You must be signed in with Google to claim a handle.' });
  }

  if (!rawUsername || !String(rawUsername).trim()) {
    return res.status(400).json({ error: 'Please enter a username to claim.' });
  }

  const cleanReq = String(rawUsername).trim();
  const check = await checkUsernameAvailability(cleanReq, googleUid);
  if (!check.available && !check.isCurrent) {
    return res.status(400).json({ error: check.error });
  }

  try {
    const record = await claimUsernameForGoogle(cleanReq, {
      googleUid,
      email: req.body.email || (user && user.email) || '',
      displayName: req.body.displayName || (user && user.displayName) || cleanReq,
      photoURL: req.body.photoURL || (user && user.avatar) || ''
    });

    const updatedUser = {
      id: 'google_' + googleUid,
      username: record.username,
      hasClaimedUsername: true,
      email: record.email,
      displayName: record.displayName,
      avatar: record.photoURL,
      isGoogleVerified: true,
      googleUid
    };

    const token = jwt.sign(updatedUser, JWT_SECRET, { expiresIn: '365d' });
    const setCookie = stringifyCookie('vault_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 365 * 24 * 60 * 60,
      path: '/'
    });

    res.setHeader('Set-Cookie', setCookie);
    return res.json({ success: true, user: updatedUser });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const clearCookie = stringifyCookie('vault_session', '', {
    httpOnly: true,
    maxAge: 0,
    path: '/'
  });
  res.setHeader('Set-Cookie', clearCookie);
  return res.json({ success: true });
});

// --- UPLOAD ROUTE ---
app.post('/api/upload', async (req, res) => {
  try {
    const user = parseUser(req);
    const username = (req.body.username ? String(req.body.username).trim() : null) || (user ? user.username : null);

    if (!username) {
      return res.status(400).json({ error: 'Please enter a username to send an image.' });
    }

    const {
      fileData,
      filename = 'image.png',
      mimeType = 'image/png',
      viewDuration = 30,
      allowScreenshots = false,
      allowDownload = false,
      spotlightMode = false,
      spotlightIntensity = 'full',
      watermarkEnabled = false
    } = req.body;

    if (!fileData) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    const cleanBase64 = fileData.replace(/^data:image\/[a-z0-9+]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length > 25 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 25MB limit' });
    }

    const token = generateToken(24);
    const { encryptedData, iv, authTag } = encrypt(buffer);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const isGoogleSender = Boolean(user && user.isGoogleVerified);

    const record = {
      token,
      userId: user ? user.id : 'user_' + username.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
      senderUsername: username,
      isGoogleSender,
      filename,
      mimeType,
      filesize: buffer.length,
      createdAt: now.toISOString(),
      expiresAt,
      viewDuration: parseInt(viewDuration, 10) || 0,
      allowScreenshots: Boolean(allowScreenshots),
      allowDownload: Boolean(allowDownload),
      spotlightMode: Boolean(spotlightMode),
      spotlightIntensity: ['small', 'large', 'full'].includes(spotlightIntensity) ? spotlightIntensity : 'full',
      watermarkEnabled: Boolean(watermarkEnabled),
      isViewed: false,
      viewedAt: null,
      viewerIp: null,
      isBurned: false,
      burnedAt: null,
      burnReason: null,
      encryptedData,
      iv,
      authTag
    };

    await saveImageRecord(token, record);

    return res.json({
      success: true,
      token,
      senderUsername: username,
      isGoogleSender,
      filename,
      viewDuration: record.viewDuration,
      allowScreenshots: record.allowScreenshots,
      allowDownload: record.allowDownload,
      spotlightMode: record.spotlightMode,
      spotlightIntensity: record.spotlightIntensity,
      watermarkEnabled: record.watermarkEnabled,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt
    });
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// --- VIEW ROUTES ---
app.get('/api/view/:token/status', async (req, res) => {
  const token = req.params.token;
  const record = await getImageRecord(token);

  if (!record) {
    res.setHeader('Location', 'https://www.google.com');
    return res.status(404).json({ status: 'not_found', redirect: 'https://www.google.com' });
  }

  if (record.isBurned || record.isViewed || record.is_burned || record.is_viewed) {
    res.setHeader('Location', 'https://www.google.com');
    return res.status(410).json({
      status: 'burned',
      redirect: 'https://www.google.com',
      message: 'This view-once image has already been viewed.'
    });
  }

  if (record.expiresAt && new Date() > new Date(record.expiresAt)) {
    await burnImageRecord(token, 'expired_before_view');
    res.setHeader('Location', 'https://www.google.com');
    return res.status(410).json({
      status: 'expired',
      redirect: 'https://www.google.com'
    });
  }

  return res.json({
    status: 'ready',
    senderUsername: record.senderUsername || 'Confidential',
    isGoogleSender: Boolean(record.isGoogleSender),
    filename: record.filename,
    filesize: record.filesize,
    viewDuration: record.viewDuration,
    allowScreenshots: Boolean(record.allowScreenshots),
    allowDownload: Boolean(record.allowDownload),
    spotlightMode: Boolean(record.spotlightMode),
    spotlightIntensity: record.spotlightIntensity || 'full',
    watermarkEnabled: Boolean(record.watermarkEnabled)
  });
});

app.post('/api/view/:token/unlock', async (req, res) => {
  const token = req.params.token;
  const record = await getImageRecord(token);

  if (!record) {
    res.setHeader('Location', 'https://www.google.com');
    return res.status(404).json({ error: 'One-time link not found', redirect: 'https://www.google.com' });
  }

  if (record.isBurned || record.isViewed || record.is_burned || record.is_viewed) {
    res.setHeader('Location', 'https://www.google.com');
    return res.status(410).json({
      error: 'This view-once image has already been viewed.',
      redirect: 'https://www.google.com'
    });
  }

  const viewerIp = getClientIp(req);
  record.isViewed = true;
  record.is_viewed = true;
  record.viewedAt = new Date().toISOString();
  record.viewerIp = viewerIp;

  if (!record.encryptedData || !record.iv || !record.authTag) {
    res.setHeader('Location', 'https://www.google.com');
    return res.status(410).json({ error: 'Image data already purged', redirect: 'https://www.google.com' });
  }

  let decryptedBuffer;
  try {
    decryptedBuffer = decrypt(record.encryptedData, record.iv, record.authTag);
  } catch (e) {
    console.error('Decryption failure:', e);
    return res.status(500).json({ error: 'Decryption failed' });
  }

  // ATOMIC SHRED: Purge encrypted data from storage immediately
  await burnImageRecord(token, 'view_unlocked_and_shredded');

  const b64 = decryptedBuffer.toString('base64');
  const dataUri = `data:${record.mimeType || 'image/png'};base64,${b64}`;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-DRM-Protected', 'true');

  return res.json({
    success: true,
    data: dataUri,
    filename: record.filename,
    senderUsername: record.senderUsername || 'Confidential',
    isGoogleSender: Boolean(record.isGoogleSender),
    mimeType: record.mimeType,
    viewDuration: record.viewDuration,
    allowScreenshots: Boolean(record.allowScreenshots),
    allowDownload: Boolean(record.allowDownload),
    spotlightMode: Boolean(record.spotlightMode),
    spotlightIntensity: record.spotlightIntensity || 'full',
    watermarkEnabled: Boolean(record.watermarkEnabled),
    viewerIp,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
  });
});

app.post('/api/view/:token/burn', async (req, res) => {
  const token = req.params.token;
  const reason = req.body?.reason || 'client_burn_trigger';
  await burnImageRecord(token, reason);
  return res.json({ success: true, burned: true, redirect: 'https://www.google.com' });
});

// --- IMAGE MANAGEMENT ROUTES ---
app.get('/api/images', async (req, res) => {
  const user = parseUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Username required' });
  }
  const images = await listUserImages(user.id);
  return res.json({ images });
});

app.delete('/api/images/:token', async (req, res) => {
  const user = parseUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Username required' });
  }
  const token = req.params.token;
  const success = await deleteImageRecord(token, user.id);
  return res.json({ success });
});

app.patch('/api/images/:token', async (req, res) => {
  const user = parseUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Username required' });
  }
  const token = req.params.token;
  try {
    const updated = await updateImageRecord(token, req.body, user.id);
    if (!updated) {
      return res.status(404).json({ error: 'Link not found or access denied' });
    }
    return res.json({
      success: true,
      message: 'Link updated successfully',
      record: {
        token: updated.token,
        filename: updated.filename,
        viewDuration: updated.viewDuration,
        allowScreenshots: updated.allowScreenshots,
        allowDownload: updated.allowDownload,
        watermarkEnabled: updated.watermarkEnabled,
        spotlightMode: updated.spotlightMode,
        spotlightIntensity: updated.spotlightIntensity || 'full'
      }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/images/:token', async (req, res) => {
  const user = parseUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Username required' });
  }
  const token = req.params.token;
  try {
    const updated = await updateImageRecord(token, req.body, user.id);
    if (!updated) {
      return res.status(404).json({ error: 'Link not found or access denied' });
    }
    return res.json({
      success: true,
      message: 'Link updated successfully',
      record: {
        token: updated.token,
        filename: updated.filename,
        viewDuration: updated.viewDuration,
        allowScreenshots: updated.allowScreenshots,
        allowDownload: updated.allowDownload,
        watermarkEnabled: updated.watermarkEnabled,
        spotlightMode: updated.spotlightMode,
        spotlightIntensity: updated.spotlightIntensity || 'full'
      }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = app;
