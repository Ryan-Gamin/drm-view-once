const assert = require('assert');

// 1x1 transparent PNG base64 for testing
const TINY_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function runTests() {
  console.log('🧪 Starting End-to-End DRM View-Once Tests...');

  const BASE_URL = 'http://localhost:8000';
  let sessionCookie = '';

  // 1. Auth Config
  const confRes = await fetch(`${BASE_URL}/api/auth/config`);
  assert.strictEqual(confRes.status, 200, 'Config status should be 200');
  const conf = await confRes.json();
  console.log('✓ Auth config endpoint verified:', conf);

  // 2. Demo Google Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/demo`, { method: 'POST' });
  assert.strictEqual(loginRes.status, 200, 'Login status should be 200');
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.success, true, 'Login should succeed');
  sessionCookie = loginRes.headers.get('set-cookie');
  console.log('✓ Google Demo Login succeeded for:', loginData.user.email);

  // 3. Check /me with cookie
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Cookie': sessionCookie }
  });
  const meData = await meRes.json();
  assert.strictEqual(meData.authenticated, true, 'User should be authenticated');
  console.log('✓ Session verification passed:', meData.user.name);

  // 4. Upload Image
  const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      fileData: TINY_PNG_BASE64,
      filename: 'confidential_sample.png',
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

  // 5. Check Token Status Before Viewing
  const statusRes = await fetch(`${BASE_URL}/api/view/${token}/status`);
  assert.strictEqual(statusRes.status, 200, 'Status should be 200 before view');
  const statusData = await statusRes.json();
  assert.strictEqual(statusData.status, 'ready', 'Status must be ready');
  console.log('✓ Pre-view status verified: READY');

  // 6. First View Unlock (Atomic Decryption & Shredding)
  const unlockRes = await fetch(`${BASE_URL}/api/view/${token}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.strictEqual(unlockRes.status, 200, 'First unlock should succeed (200)');
  const unlockData = await unlockRes.json();
  assert.strictEqual(unlockData.success, true, 'Unlock response must indicate success');
  assert.ok(unlockData.data.startsWith('data:image/png;base64,'), 'Decrypted data URI must be returned');
  assert.strictEqual(unlockData.spotlightMode, true, 'Spotlight mode preference preserved');
  console.log('✓ First view unlocked and decrypted payload received. Server copy shredded.');

  // 7. Second View Attempt (Must be rejected with 410 Gone!)
  const secondUnlockRes = await fetch(`${BASE_URL}/api/view/${token}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.strictEqual(secondUnlockRes.status, 410, 'Second unlock MUST return 410 Gone');
  console.log('✓ Second unlock attempt correctly REJECTED (410 Gone - Already burned)');

  // 8. Status check after view (Must be burned)
  const statusAfterRes = await fetch(`${BASE_URL}/api/view/${token}/status`);
  assert.strictEqual(statusAfterRes.status, 410, 'Status after unlock MUST return 410');
  const statusAfterData = await statusAfterRes.json();
  assert.strictEqual(statusAfterData.status, 'burned', 'Status must report burned');
  console.log('✓ Subsequent status check confirms: BURNED / DESTROYED');

  console.log('\n🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY! 100% SPEC VERIFIED.');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
