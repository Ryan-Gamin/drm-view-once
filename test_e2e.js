const assert = require('assert');

const TINY_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function runTests() {
  console.log('🧪 Starting End-to-End Tests (Custom Durations, Screenshot & Download Controls)...');

  const BASE_URL = 'http://localhost:8000';

  // 1. Username Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'RyanTester' })
  });
  assert.strictEqual(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.user.username, 'RyanTester');
  const sessionCookie = loginRes.headers.get('set-cookie');
  console.log('✓ Username login succeeded as @' + loginData.user.username);

  // 2. Upload with 15m (900s), Screenshots Allowed, and Download Allowed
  const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      username: 'RyanTester',
      fileData: TINY_PNG_BASE64,
      filename: 'permission_test.png',
      mimeType: 'image/png',
      viewDuration: 900, // 15m
      allowScreenshots: true,
      allowDownload: true,
      spotlightMode: false,
      watermarkEnabled: true
    })
  });
  assert.strictEqual(uploadRes.status, 200);
  const uploadData = await uploadRes.json();
  assert.strictEqual(uploadData.viewDuration, 900, 'Duration should be 900s (15m)');
  assert.strictEqual(uploadData.allowScreenshots, true, 'Screenshots should be allowed');
  assert.strictEqual(uploadData.allowDownload, true, 'Downloads should be allowed');
  const token = uploadData.token;
  console.log('✓ Upload generated link with 15m duration, allowScreenshots=true, allowDownload=true');

  // 3. Status Check
  const statusRes = await fetch(`${BASE_URL}/api/view/${token}/status`);
  assert.strictEqual(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.strictEqual(statusData.viewDuration, 900);
  assert.strictEqual(statusData.allowScreenshots, true);
  assert.strictEqual(statusData.allowDownload, true);
  console.log('✓ Status endpoint verified permissions: allowScreenshots=true, allowDownload=true');

  // 4. Unlock Check
  const unlockRes = await fetch(`${BASE_URL}/api/view/${token}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.strictEqual(unlockRes.status, 200);
  const unlockData = await unlockRes.json();
  assert.strictEqual(unlockData.allowDownload, true, 'Download permission present in unlock payload');
  assert.ok(unlockData.data.startsWith('data:image/png;base64,'));
  console.log('✓ Unlock succeeded and verified download permission.');

  // 5. Subsequent View Attempt -> Redirect to Google!
  const secondRes = await fetch(`${BASE_URL}/api/view/${token}/status`);
  assert.strictEqual(secondRes.status, 410);
  const secondData = await secondRes.json();
  assert.strictEqual(secondData.redirect, 'https://www.google.com');
  console.log('✓ Second attempt correctly triggers redirect to Google.');

  console.log('\n🎉 ALL TESTS PASSED! Duration options, permissions, and Google redirect 100% verified.');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
