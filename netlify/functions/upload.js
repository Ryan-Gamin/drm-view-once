const jwt = require('jsonwebtoken');
const { generateToken, encrypt } = require('./crypto');
const { saveImageRecord } = require('./storage');

const JWT_SECRET = process.env.JWT_SECRET || 'drm-vault-jwt-session-secret-key-9988';

function parseUser(event) {
  const cookieHeader = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
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

  try {
    let body = {};
    if (event.isBase64Encoded) {
      body = JSON.parse(Buffer.from(event.body, 'base64').toString('utf8'));
    } else {
      body = JSON.parse(event.body || '{}');
    }

    const user = parseUser(event);
    const username = (body.username ? String(body.username).trim() : null) || (user ? user.username : null);

    if (!username) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Please enter a username to send an image.' })
      };
    }

    const {
      fileData,
      filename = 'image.png',
      mimeType = 'image/png',
      viewDuration = 30,
      allowScreenshots = false,
      allowDownload = false,
      spotlightMode = false,
      watermarkEnabled = true
    } = body;

    if (!fileData) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No image data provided' }) };
    }

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
      userId: user ? user.id : 'user_' + username.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
      senderUsername: username,
      filename,
      mimeType,
      filesize: buffer.length,
      createdAt: now.toISOString(),
      expiresAt,
      viewDuration: parseInt(viewDuration, 10) || 0,
      allowScreenshots: Boolean(allowScreenshots),
      allowDownload: Boolean(allowDownload),
      spotlightMode: Boolean(spotlightMode),
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        token,
        senderUsername: username,
        filename,
        viewDuration: record.viewDuration,
        allowScreenshots: record.allowScreenshots,
        allowDownload: record.allowDownload,
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
