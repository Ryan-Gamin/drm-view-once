const jwt = require('jsonwebtoken');
const { stringifySetCookie } = require('cookie');

const JWT_SECRET = process.env.JWT_SECRET || 'drm-vault-jwt-session-secret-key-9988';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

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
  const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '7d' });
  return stringifySetCookie({
    name: 'vault_session',
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/'
  });
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const path = event.path;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  // GET /api/auth/config
  if (method === 'GET' && path.endsWith('/config')) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        google_client_id: GOOGLE_CLIENT_ID,
        demo_mode_available: true
      })
    };
  }

  // GET /api/auth/me
  if (method === 'GET' && path.endsWith('/me')) {
    const user = parseUser(event);
    if (!user) {
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

  // POST /api/auth/google
  if (method === 'POST' && path.endsWith('/google')) {
    try {
      const body = JSON.parse(event.body || '{}');
      const credential = body.credential;
      if (!credential) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing credential token' }) };
      }

      // Verify Google ID token using Google tokeninfo API
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!res.ok) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid Google credential token' }) };
      }
      const data = await res.json();

      const user = {
        id: 'google_' + data.sub,
        email: data.email,
        name: data.name || data.email.split('@')[0],
        picture: data.picture || ''
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

  // POST /api/auth/demo
  if (method === 'POST' && path.endsWith('/demo')) {
    const user = {
      id: 'demo_user_123',
      email: 'ryan.tester@drm-vault.local',
      name: 'Ryan (Demo Google User)',
      picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=ryan_secure'
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

  return { statusCode: 404, headers, body: JSON.stringify({ error: 'Auth endpoint not found' }) };
};
