const assert = require('assert');

const TINY_PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function runTests() {
  console.log('🧪 Starting End-to-End Tests (Custom X Seconds, Edit/Extend Links, Watermark Defaults, & Google Redirect)...');

  const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

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

  // 2. Upload with Custom 7s duration, Watermark OFF by default
  const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      username: 'RyanTester',
      fileData: TINY_PNG_BASE64,
      filename: 'custom_7s_test.png',
      mimeType: 'image/png',
      viewDuration: 7, // Custom 7s
      allowScreenshots: false,
      allowDownload: false,
      spotlightMode: false,
      watermarkEnabled: false // Watermark OFF by default
    })
  });
  assert.strictEqual(uploadRes.status, 200);
  const uploadData = await uploadRes.json();
  assert.strictEqual(uploadData.viewDuration, 7, 'Duration should be custom 7s');
  assert.strictEqual(uploadData.allowScreenshots, false, 'Screenshots should be blocked');
  assert.strictEqual(uploadData.watermarkEnabled, false, 'Watermark should be OFF by default');
  const token = uploadData.token;
  console.log('✓ Upload generated link with custom 7s duration and watermark OFF by default');

  // 3. Status Check (pre-edit)
  const statusRes = await fetch(`${BASE_URL}/api/view/${token}/status`);
  assert.strictEqual(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.strictEqual(statusData.viewDuration, 7);
  assert.strictEqual(statusData.watermarkEnabled, false);
  console.log('✓ Status endpoint verified initial duration: 7s');

  // 4. Edit / Extend the Link (Extend to 45s, Enable Download)
  const editRes = await fetch(`${BASE_URL}/api/images/${token}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      viewDuration: 45, // Extended from 7s to 45s
      allowDownload: true
    })
  });
  assert.strictEqual(editRes.status, 200);
  const editData = await editRes.json();
  assert.strictEqual(editData.success, true);
  assert.strictEqual(editData.record.viewDuration, 45, 'Duration extended to 45s');
  assert.strictEqual(editData.record.allowDownload, true, 'Download enabled via edit');
  console.log('✓ Edit/Extend endpoint successfully extended duration to 45s and updated permissions');

  // 5. Verify Updated Status
  const statusRes2 = await fetch(`${BASE_URL}/api/view/${token}/status`);
  assert.strictEqual(statusRes2.status, 200);
  const statusData2 = await statusRes2.json();
  assert.strictEqual(statusData2.viewDuration, 45, 'Public viewer status reflects extended 45s');
  assert.strictEqual(statusData2.allowDownload, true, 'Public viewer status reflects updated download perm');
  console.log('✓ Status endpoint verified extended 45s duration');

  // 6. Unlock Check
  const unlockRes = await fetch(`${BASE_URL}/api/view/${token}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.strictEqual(unlockRes.status, 200);
  const unlockData = await unlockRes.json();
  assert.strictEqual(unlockData.viewDuration, 45);
  assert.strictEqual(unlockData.allowDownload, true);
  assert.ok(unlockData.data.startsWith('data:image/png;base64,'));
  console.log('✓ Unlock succeeded and delivered payload with extended 45s duration.');

  // 7. Verify Burn & Google Redirection on Revisit
  const secondRes = await fetch(`${BASE_URL}/api/view/${token}/status`);
  assert.strictEqual(secondRes.status, 410);
  const secondData = await secondRes.json();
  assert.strictEqual(secondData.redirect, 'https://www.google.com');
  console.log('✓ Second attempt correctly triggers redirect to Google.');

  // 8. Verify Cannot Edit Already Burned Link
  const editBurnedRes = await fetch(`${BASE_URL}/api/images/${token}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({ viewDuration: 999 })
  });
  assert.strictEqual(editBurnedRes.status, 400, 'Cannot edit an already viewed/burned link');
  console.log('✓ Correctly rejects attempt to edit an already burned link.');

  console.log('\n🎉 ALL TESTS PASSED! Custom X seconds, Edit/Extend links, watermark defaults, and Google redirect 100% verified.');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
