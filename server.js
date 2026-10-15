const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');

// Import Netlify function handlers
const authHandler = require('./netlify/functions/auth').handler;
const uploadHandler = require('./netlify/functions/upload').handler;
const viewHandler = require('./netlify/functions/view').handler;
const imagesHandler = require('./netlify/functions/images').handler;

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Helper to adapt Netlify serverless handler to Express req/res
function adaptNetlify(handler) {
  return async (req, res) => {
    const event = {
      httpMethod: req.method,
      path: req.originalUrl.split('?')[0],
      headers: req.headers,
      queryStringParameters: req.query,
      body: JSON.stringify(req.body),
      isBase64Encoded: false
    };

    try {
      const result = await handler(event, {});
      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, value);
        }
      }
      res.status(result.statusCode).send(result.body);
    } catch (e) {
      console.error('Serverless adapter error:', e);
      res.status(500).json({ error: e.message });
    }
  };
}

// API Routes
app.use('/api/auth', adaptNetlify(authHandler));
app.post('/api/upload', adaptNetlify(uploadHandler));
app.use('/api/view', adaptNetlify(viewHandler));
app.use('/api/images', adaptNetlify(imagesHandler));

// Clean URL rewrite for /v/:token
app.get('/v/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🔒 DRM View-Once Vault running at: http://localhost:${PORT}`);
});
