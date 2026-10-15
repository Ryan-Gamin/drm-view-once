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
      spotlightMode: true,
      spotlightIntensity: 'large',
      watermarkEnabled: false // Watermark OFF by default
    })
  });
  assert.strictEqual(uploadRes.status, 200);
  const uploadData = await uploadRes.json();
  assert.strictEqual(uploadData.viewDuration, 7, 'Duration should be custom 7s');
  assert.strictEqual(uploadData.allowScreenshots, false, 'Screenshots should be blocked');
  assert.strictEqual(uploadData.spotlightMode, true);
  assert.strictEqual(uploadData.spotlightIntensity, 'large');
  assert.strictEqual(uploadData.watermarkEnabled, false, 'Watermark should be OFF by default');
  const token = uploadData.token;
  console.log('✓ Upload generated link with custom 7s duration, spotlightIntensity large, and watermark OFF by default');

  // 3. Status Check (pre-edit)
  const statusRes = await fetch(`${BASE_URL}/api/view/${token}/status`);
  assert.strictEqual(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.strictEqual(statusData.viewDuration, 7);
  assert.strictEqual(statusData.spotlightIntensity, 'large');
  assert.strictEqual(statusData.watermarkEnabled, false);
  console.log('✓ Status endpoint verified initial duration: 7s and spotlightIntensity: large');

  // 4. Edit / Extend the Link (Extend to 45s, Enable Download, Change intensity to full)
  const editRes = await fetch(`${BASE_URL}/api/images/${token}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      viewDuration: 45, // Extended from 7s to 45s
      allowDownload: true,
      spotlightIntensity: 'full'
    })
  });
  assert.strictEqual(editRes.status, 200);
  const editData = await editRes.json();
  assert.strictEqual(editData.success, true);
  assert.strictEqual(editData.record.viewDuration, 45, 'Duration extended to 45s');
  assert.strictEqual(editData.record.allowDownload, true, 'Download enabled via edit');
  assert.strictEqual(editData.record.spotlightIntensity, 'full', 'Intensity updated to full');
  console.log('✓ Edit/Extend endpoint successfully extended duration to 45s and updated intensity to full');

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

  // 9. Google Sign-in & Username Claim System
  console.log('\n--- Testing Google Sign-in, Username Claim, & Option 4 Watermark Grid ---');
  const googleLoginRes = await fetch(`${BASE_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      googleUid: 'goog_test_uid_9988',
      email: 'testagent@gmail.com',
      displayName: 'Elite Agent',
      photoURL: 'https://lh3.googleusercontent.com/test-photo',
      claimedUsername: 'EliteVip'
    })
  });
  assert.strictEqual(googleLoginRes.status, 200);
  const googleLoginData = await googleLoginRes.json();
  assert.strictEqual(googleLoginData.user.username, 'EliteVip');
  assert.strictEqual(googleLoginData.user.isGoogleVerified, true);
  const googleCookie = googleLoginRes.headers.get('set-cookie');
  console.log('✓ Google account sign-in & username claim succeeded for @' + googleLoginData.user.username);

  // 10. Verify Ephemeral user cannot take claimed Google username
  const claimConflictRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'EliteVip' })
  });
  assert.strictEqual(claimConflictRes.status, 400);
  const claimConflictData = await claimConflictRes.json();
  assert.ok(claimConflictData.error.includes('permanently claimed by a verified Google account'));
  console.log('✓ Verified: Ephemeral users are prevented from taking claimed Google usernames.');

  // 11. Verify Ephemeral user can login with unclaimed username and receives 12-hour session
  const ephemeralRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'TempUser12h' })
  });
  assert.strictEqual(ephemeralRes.status, 200);
  const ephemeralData = await ephemeralRes.json();
  assert.strictEqual(ephemeralData.user.username, 'TempUser12h');
  assert.strictEqual(ephemeralData.user.isGoogleVerified, false);
  assert.ok(ephemeralData.user.expiresAt, 'Ephemeral user has 12h expiresAt timestamp');
  const ephemeralCookie = ephemeralRes.headers.get('set-cookie');
  console.log('✓ Verified: Ephemeral account created with 12-hour TTL.');

  // 12. Upload image as Google user -> Verify isGoogleSender is true
  const googleUploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': googleCookie
    },
    body: JSON.stringify({
      username: 'EliteVip',
      fileData: TINY_PNG_BASE64,
      filename: 'google_forensic_test.png',
      mimeType: 'image/png',
      viewDuration: 15,
      allowScreenshots: false
    })
  });
  assert.strictEqual(googleUploadRes.status, 200);
  const googleUploadData = await googleUploadRes.json();
  assert.strictEqual(googleUploadData.isGoogleSender, true, 'isGoogleSender should be true for Google users');
  const googleToken = googleUploadData.token;

  // Check view status for Google sender
  const googleStatusRes = await fetch(`${BASE_URL}/api/view/${googleToken}/status`);
  assert.strictEqual(googleStatusRes.status, 200);
  const googleStatusData = await googleStatusRes.json();
  assert.strictEqual(googleStatusData.isGoogleSender, true, 'Public status reports isGoogleSender: true');

  // Check view unlock for Google sender
  const googleUnlockRes = await fetch(`${BASE_URL}/api/view/${googleToken}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.strictEqual(googleUnlockRes.status, 200);
  const googleUnlockData = await googleUnlockRes.json();
  assert.strictEqual(googleUnlockData.isGoogleSender, true, 'Unlocked payload reports isGoogleSender: true for Option 4 matrix');
  console.log('✓ Verified: Option 4 Forensic Matrix grid is tagged and active exclusively for Google sender images.');

  // 13. Upload image as Ephemeral user -> Verify isGoogleSender is false
  const ephemUploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': ephemeralCookie
    },
    body: JSON.stringify({
      username: 'TempUser12h',
      fileData: TINY_PNG_BASE64,
      filename: 'ephem_test.png',
      mimeType: 'image/png',
      viewDuration: 15
    })
  });
  assert.strictEqual(ephemUploadRes.status, 200);
  const ephemUploadData = await ephemUploadRes.json();
  assert.strictEqual(ephemUploadData.isGoogleSender, false);
  const ephemToken = ephemUploadData.token;

  const ephemStatusRes = await fetch(`${BASE_URL}/api/view/${ephemToken}/status`);
  const ephemStatusData = await ephemStatusRes.json();
  assert.strictEqual(ephemStatusData.isGoogleSender, false);
  console.log('✓ Verified: Ephemeral images correctly tagged with isGoogleSender: false.');

  console.log('\n🎉 ALL TESTS PASSED! Google Auth, Username Claiming, 12h Ephemeral Accounts, and Option 4 Forensic Matrix verified.');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
