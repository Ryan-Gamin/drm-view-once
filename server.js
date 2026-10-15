const path = require('path');
const express = require('express');
const app = require('./api/index');
const { getImageRecord } = require('./api/storage');

const PORT = process.env.PORT || 8000;

// Rewrite clean /v/:token URLs (if already viewed/burned, redirect directly to Google)
app.get('/v/:token', async (req, res) => {
  const token = req.params.token;
  try {
    const record = await getImageRecord(token);
    if (record && (record.isBurned || record.isViewed || record.is_burned || record.is_viewed)) {
      return res.redirect(302, 'https://www.google.com');
    }
  } catch (e) {}
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🔒 DRM View-Once Vault running at: http://localhost:${PORT}`);
  });
}

module.exports = app;
