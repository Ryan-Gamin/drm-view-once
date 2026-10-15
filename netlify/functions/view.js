const { decrypt } = require('./crypto');
const { getImageRecord, burnImageRecord } = require('./storage');

function getClientIp(event) {
  const headers = event.headers || {};
  return (
    headers['client-ip'] ||
    headers['x-forwarded-for']?.split(',')[0].trim() ||
    headers['x-real-ip'] ||
    '127.0.0.1'
  );
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const path = event.path;

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff'
  };

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  const segments = path.split('/').filter(Boolean);
  const tokenIndex = segments.indexOf('view') + 1;
  const token = segments[tokenIndex];
  const action = segments[tokenIndex + 1] || 'status';

  if (!token) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Token missing' }) };
  }

  // --- ACTION: STATUS ---
  if (method === 'GET' && action === 'status') {
    const record = await getImageRecord(token);
    if (!record) {
      return {
        statusCode: 404,
        headers: { ...corsHeaders, 'Location': 'https://www.google.com' },
        body: JSON.stringify({ status: 'not_found', redirect: 'https://www.google.com' })
      };
    }

    if (record.isBurned || record.isViewed) {
      return {
        statusCode: 410,
        headers: { ...corsHeaders, 'Location': 'https://www.google.com' },
        body: JSON.stringify({
          status: 'burned',
          redirect: 'https://www.google.com',
          message: 'This view-once image has already been viewed.'
        })
      };
    }

    if (record.expiresAt && new Date() > new Date(record.expiresAt)) {
      await burnImageRecord(token, 'expired_before_view');
      return {
        statusCode: 410,
        headers: { ...corsHeaders, 'Location': 'https://www.google.com' },
        body: JSON.stringify({
          status: 'expired',
          redirect: 'https://www.google.com'
        })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        status: 'ready',
        senderUsername: record.senderUsername || 'Confidential',
        filename: record.filename,
        filesize: record.filesize,
        viewDuration: record.viewDuration,
        allowScreenshots: Boolean(record.allowScreenshots),
        allowDownload: Boolean(record.allowDownload),
        spotlightMode: Boolean(record.spotlightMode),
        watermarkEnabled: Boolean(record.watermarkEnabled)
      })
    };
  }

  // --- ACTION: UNLOCK ---
  if (method === 'POST' && action === 'unlock') {
    const record = await getImageRecord(token);
    if (!record) {
      return {
        statusCode: 404,
        headers: { ...corsHeaders, 'Location': 'https://www.google.com' },
        body: JSON.stringify({ error: 'One-time link not found', redirect: 'https://www.google.com' })
      };
    }

    if (record.isBurned || record.isViewed) {
      return {
        statusCode: 410,
        headers: { ...corsHeaders, 'Location': 'https://www.google.com' },
        body: JSON.stringify({
          error: 'This view-once image has already been viewed.',
          redirect: 'https://www.google.com'
        })
      };
    }

    const viewerIp = getClientIp(event);
    record.isViewed = true;
    record.viewedAt = new Date().toISOString();
    record.viewerIp = viewerIp;

    if (!record.encryptedData || !record.iv || !record.authTag) {
      return {
        statusCode: 410,
        headers: { ...corsHeaders, 'Location': 'https://www.google.com' },
        body: JSON.stringify({ error: 'Image data already purged', redirect: 'https://www.google.com' })
      };
    }

    let decryptedBuffer;
    try {
      decryptedBuffer = decrypt(record.encryptedData, record.iv, record.authTag);
    } catch (e) {
      console.error('Decryption failure:', e);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Decryption failed' })
      };
    }

    // ATOMIC SHRED: Purge encrypted data from storage immediately upon unlock
    await burnImageRecord(token, 'view_unlocked_and_shredded');

    const b64 = decryptedBuffer.toString('base64');
    const dataUri = `data:${record.mimeType || 'image/png'};base64,${b64}`;

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'X-DRM-Protected': 'true'
      },
      body: JSON.stringify({
        success: true,
        data: dataUri,
        filename: record.filename,
        senderUsername: record.senderUsername || 'Confidential',
        mimeType: record.mimeType,
        viewDuration: record.viewDuration,
        allowScreenshots: Boolean(record.allowScreenshots),
        allowDownload: Boolean(record.allowDownload),
        spotlightMode: Boolean(record.spotlightMode),
        watermarkEnabled: Boolean(record.watermarkEnabled),
        viewerIp,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
      })
    };
  }

  // --- ACTION: BURN ---
  if (method === 'POST' && action === 'burn') {
    const body = JSON.parse(event.body || '{}');
    const reason = body.reason || 'client_burn_trigger';
    await burnImageRecord(token, reason);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, burned: true, redirect: 'https://www.google.com' })
    };
  }

  return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Action not found' }) };
};
