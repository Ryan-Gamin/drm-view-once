const jwt = require('jsonwebtoken');
const { stringifySetCookie } = require('cookie');

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

function makeCookieHeader(userData) {
  const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '30d' });
  return stringifySetCookie({
    name: 'vault_session',
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/'
  });
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const path = event.path;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // GET /api/auth/me
  if (method === 'GET' && path.endsWith('/me')) {
    const user = parseUser(event);
    if (!user || !user.username) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ authenticated: false, user: null })
      };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ authenticated: true, user })
    };
  }

  // POST /api/auth/login (Login with any Username)
  if (method === 'POST' && (path.endsWith('/login') || path.endsWith('/username'))) {
    try {
      const body = JSON.parse(event.body || '{}');
      const rawUsername = body.username ? String(body.username).trim() : '';

      if (!rawUsername || rawUsername.length < 2) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Please enter a username (at least 2 characters).' })
        };
      }

      if (rawUsername.length > 30) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Username cannot exceed 30 characters.' })
        };
      }

      const user = {
        id: 'user_' + rawUsername.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
        username: rawUsername,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(rawUsername)}`
      };

      const setCookie = makeCookieHeader(user);
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Set-Cookie': setCookie
        },
        body: JSON.stringify({ success: true, user })
      };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  // POST /api/auth/logout
  if (method === 'POST' && path.endsWith('/logout')) {
    const clearCookie = stringifySetCookie({
      name: 'vault_session',
      value: '',
      httpOnly: true,
      maxAge: 0,
      path: '/'
    });
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Set-Cookie': clearCookie
      },
      body: JSON.stringify({ success: true })
    };
  }

  return { statusCode: 404, headers, body: JSON.stringify({ error: 'Endpoint not found' }) };
};
