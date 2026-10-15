const jwt = require('jsonwebtoken');
const { listUserImages, deleteImageRecord } = require('./storage');

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
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const user = parseUser(event);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
  }

  // GET /api/images
  if (event.httpMethod === 'GET') {
    const images = await listUserImages(user.id);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ images })
    };
  }

  // DELETE /api/images/:token
  if (event.httpMethod === 'DELETE') {
    const segments = event.path.split('/').filter(Boolean);
    const token = segments[segments.length - 1];
    if (!token) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token required' }) };
    }
    const success = await deleteImageRecord(token, user.id);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success })
    };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
