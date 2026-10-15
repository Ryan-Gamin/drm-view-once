const assert = require('assert');

// 1x1 transparent PNG base64 for testing
const TINY_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function runTests() {
  console.log('🧪 Starting End-to-End DRM View-Once Tests (Username-Only + Google Redirect)...');

  const BASE_URL = 'http://localhost:8000';
  let sessionCookie = '';

  // 1. Username Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'RyanTester' })
  });
  assert.strictEqual(loginRes.status, 200, 'Login status should be 200');
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.success, true, 'Login should succeed');
  assert.strictEqual(loginData.user.username, 'RyanTester', 'Username should match');
  sessionCookie = loginRes.headers.get('set-cookie');
  console.log('✓ Username login succeeded as @' + loginData.user.username);

  // 2. Upload Image
  const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      username: 'RyanTester',
      fileData: TINY_PNG_BASE64,
      filename: 'confidential_snap.png',
      mimeType: 'image/png',
      viewDuration: 30,
      spotlightMode: true,
      watermarkEnabled: true,
      antiScreenshotLevel: 'strict'
    })
  });
  assert.strictEqual(uploadRes.status, 200, 'Upload status should be 200');
  const uploadData = await uploadRes.json();
  assert.strictEqual(uploadData.success, true, 'Upload should succeed');
  const token = uploadData.token;
  assert.ok(token, 'Token must be present');
  console.log('✓ View-once link generated with token:', token);

  // 3. Status Before Viewing
  const statusRes = await fetch(`${BASE_URL}/api/view/${token}/status`);
  assert.strictEqual(statusRes.status, 200, 'Status should be 200 before view');
  const statusData = await statusRes.json();
  assert.strictEqual(statusData.status, 'ready', 'Status must be ready');
  console.log('✓ Pre-view status verified: READY');

  // 4. First View Unlock
  const unlockRes = await fetch(`${BASE_URL}/api/view/${token}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.strictEqual(unlockRes.status, 200, 'First unlock should succeed (200)');
  const unlockData = await unlockRes.json();
  assert.strictEqual(unlockData.success, true, 'Unlock response must indicate success');
  assert.strictEqual(unlockData.senderUsername, 'RyanTester', 'Sender username present');
  assert.ok(unlockData.data.startsWith('data:image/png;base64,'), 'Decrypted image returned');
  console.log('✓ First view unlocked. Decrypted payload received. Server copy shredded.');

  // 5. Second View Attempt (Must redirect to Google)
  const secondUnlockRes = await fetch(`${BASE_URL}/api/view/${token}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.strictEqual(secondUnlockRes.status, 410, 'Second unlock must return 410');
  const secondData = await secondUnlockRes.json();
  assert.strictEqual(secondData.redirect, 'https://www.google.com', 'Redirect must point to Google');
  console.log('✓ Second unlock attempt rejected with 410 and redirect to Google: ' + secondData.redirect);

  // 6. Status check after view (Must specify redirect to Google)
  const statusAfterRes = await fetch(`${BASE_URL}/api/view/${token}/status`);
  assert.strictEqual(statusAfterRes.status, 410, 'Status after view must return 410');
  const statusAfterData = await statusAfterRes.json();
  assert.strictEqual(statusAfterData.redirect, 'https://www.google.com', 'Status endpoint confirms Google redirect');
  console.log('✓ Status check confirms Google redirect: ' + statusAfterData.redirect);

  // 7. Direct /v/:token page request (Server 302 Redirect to Google)
  const pageRes = await fetch(`${BASE_URL}/v/${token}`, { redirect: 'manual' });
  assert.strictEqual(pageRes.status, 302, 'HTTP request to viewed /v/:token must be 302 redirect');
  assert.strictEqual(pageRes.headers.get('location'), 'https://www.google.com', 'Location header must be Google');
  console.log('✓ Server-side HTTP 302 redirect to Google verified on /v/' + token);

  console.log('\n🎉 ALL TESTS PASSED! Username sender + Google redirect 100% verified.');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
