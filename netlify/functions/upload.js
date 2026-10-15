const jwt = require('jsonwebtoken');
const { generateToken, encrypt } = require('./crypto');
const { saveImageRecord } = require('./storage');

const JWT_SECRET = process.env.JWT_SECRET || 'drm-vault-jwt-session-secret-key-9988';

function parseUser(event) {
  const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
  const cookies = {};
  cookieHeader.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v.join('='));
  });

  const token = cookies.vault_session || (event.headers.authorization && event.headers.authorization.replace('Bearer ', ''));
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const user = parseUser(event);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required. Please sign in with Google.' }) };
  }

  try {
    let body = {};
    if (event.isBase64Encoded) {
      body = JSON.parse(Buffer.from(event.body, 'base64').toString('utf8'));
    } else {
      body = JSON.parse(event.body || '{}');
    }

    const {
      fileData,
      filename = 'image.png',
      mimeType = 'image/png',
      viewDuration = 30,
      spotlightMode = false,
      watermarkEnabled = true,
      antiScreenshotLevel = 'strict'
    } = body;

    if (!fileData) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No image data provided' }) };
    }

    // Strip data URI prefix if present
    const cleanBase64 = fileData.replace(/^data:image\/[a-z0-9+]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length > 25 * 1024 * 1024) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'File size exceeds 25MB limit' }) };
    }

    const token = generateToken(24);
    const { encryptedData, iv, authTag } = encrypt(buffer);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const record = {
      token,
      userId: user.id,
      userEmail: user.email,
      filename,
      mimeType,
      filesize: buffer.length,
      createdAt: now.toISOString(),
      expiresAt,
      viewDuration: parseInt(viewDuration, 10) || 30,
      spotlightMode: Boolean(spotlightMode),
      watermarkEnabled: Boolean(watermarkEnabled),
      antiScreenshotLevel,
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        token,
        filename,
        viewDuration: record.viewDuration,
        spotlightMode: record.spotlightMode,
        watermarkEnabled: record.watermarkEnabled,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt
      })
    };
  } catch (e) {
    console.error('Upload error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
