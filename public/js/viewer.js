// DRM View-Once Vault - Secure Anti-Screenshot Canvas Viewer Engine
(() => {
  // Extract token from URL
  function extractToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const queryToken = urlParams.get('t');
    if (queryToken) return queryToken;

    const parts = window.location.pathname.split('/').filter(Boolean);
    const vIndex = parts.indexOf('v');
    if (vIndex !== -1 && parts[vIndex + 1]) {
      return parts[vIndex + 1];
    }
    return parts[parts.length - 1] || null;
  }

  const token = extractToken();

  // DOM Elements
  const stateLoading = document.getElementById('stateLoading');
  const stateReady = document.getElementById('stateReady');
  const stateViewing = document.getElementById('stateViewing');
  const stateBurned = document.getElementById('stateBurned');
  const screenshotShield = document.getElementById('screenshotShield');
  const burnedReasonText = document.getElementById('burnedReasonText');
  const unlockBtn = document.getElementById('unlockBtn');
  const burnEarlyBtn = document.getElementById('burnEarlyBtn');
  const timerDisplay = document.getElementById('timerDisplay');
  const spotlightHint = document.getElementById('spotlightHint');
  const sessionDurationInfo = document.getElementById('sessionDurationInfo');
  const headerStatusText = document.getElementById('headerStatusText');
  const headerDot = document.getElementById('headerDot');
  const canvas = document.getElementById('drmCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // State Variables
  let imageMetadata = null;
  let activeImage = null;
  let remainingSeconds = 30;
  let timerInterval = null;
  let animationFrameId = null;
  let isWindowFocused = true;
  let isSpotlightActive = false;
  let mousePos = { x: -9999, y: -9999 };
  let isMouseDown = false;
  let watermarkPos = { x: 50, y: 100, dx: 1.2, dy: 0.9 };
  let isBurned = false;

  // Initialize
  document.addEventListener('DOMContentLoaded', async () => {
    if (!token || token === 'viewer.html') {
      showBurned('No view-once token provided in URL.');
      return;
    }
    setupSecurityShields();
    await checkTokenStatus();
  });

  async function checkTokenStatus() {
    try {
      const res = await fetch(`/api/view/${token}/status`);
      const data = await res.json();

      if (res.status === 404) {
        showBurned('This link does not exist or has already been shredded.');
        return;
      }

      if (res.status === 410 || data.status === 'burned' || data.status === 'expired') {
        showBurned(data.message || 'This view-once image has already been viewed and permanently purged from server memory.');
        return;
      }

      imageMetadata = data;
      showReadyScreen(data);
    } catch (e) {
      console.error('Status check error:', e);
      showBurned('Unable to connect to security vault: ' + e.message);
    }
  }

  function showReadyScreen(meta) {
    stateLoading.style.display = 'none';
    stateBurned.style.display = 'none';
    stateViewing.style.display = 'none';
    stateReady.style.display = 'block';

    const dur = meta.viewDuration;
    sessionDurationInfo.innerHTML = dur > 0 
      ? `<strong>Duration:</strong> ${dur} seconds timer before self-destruct`
      : `<strong>Duration:</strong> Active until tab or window is closed`;

    unlockBtn.addEventListener('click', unlockAndDecrypt);
  }

  async function unlockAndDecrypt() {
    unlockBtn.disabled = true;
    unlockBtn.innerHTML = `
      <svg style="animation: spin 1s linear infinite;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
      <span>Decrypting & Shredding Server Copy...</span>
    `;

    try {
      // ATOMIC UNLOCK & SHRED CALL
      const res = await fetch(`/api/view/${token}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const err = await res.json();
        showBurned(err.error || 'Failed to unlock image. It may have already been consumed.');
        return;
      }

      const payload = await res.json();
      imageMetadata = payload;

      // Load image into memory (never attached to DOM)
      const img = new Image();
      img.onload = () => {
        activeImage = img;
        startViewingSession(payload);
      };
      img.onerror = () => {
        showBurned('Error decoding decrypted image stream.');
      };
      img.src = payload.data;
    } catch (e) {
      showBurned('Vault communication failure: ' + e.message);
    }
  }

  function startViewingSession(payload) {
    stateReady.style.display = 'none';
    stateViewing.style.display = 'block';

    headerStatusText.innerText = 'DRM Active';
    headerDot.style.background = '#00ff88';

    // Canvas sizing with high DPI support
    const maxW = Math.min(window.innerWidth - 40, 850);
    const scale = maxW / activeImage.naturalWidth;
    canvas.width = activeImage.naturalWidth;
    canvas.height = activeImage.naturalHeight;

    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    remainingSeconds = payload.view_duration_seconds || payload.viewDuration || 30;
    isSpotlightActive = Boolean(payload.spotlight_mode || payload.spotlightMode);

    if (isSpotlightActive) {
      spotlightHint.style.display = 'block';
    }

    // Start Timer
    if (remainingSeconds > 0) {
      timerDisplay.innerText = `${remainingSeconds}s`;
      timerInterval = setInterval(() => {
        remainingSeconds--;
        timerDisplay.innerText = `${remainingSeconds}s`;
        if (remainingSeconds <= 5) {
          timerDisplay.style.color = '#ff3366';
        }
        if (remainingSeconds <= 0) {
          destroyAndBurn('Viewing timer expired. Media destroyed.');
        }
      }, 1000);
    } else {
      timerDisplay.innerText = 'Tab Session';
    }

    // Start Render Loop
    renderLoop();

    // Burn early button
    burnEarlyBtn.addEventListener('click', () => {
      destroyAndBurn('Destroyed by user request.');
    });
  }

  // --- RENDER LOOP WITH DRM & WATERMARKING ---
  function renderLoop() {
    if (isBurned || !activeImage) return;

    if (isWindowFocused) {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isSpotlightActive) {
        // Spotlight Lens Mode:
        // Darken canvas and only draw lens when mouse/touch is pressed
        ctx.fillStyle = '#080a0f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (isMouseDown && mousePos.x >= 0) {
          ctx.save();
          ctx.beginPath();
          const lensRadius = Math.max(80, canvas.width * 0.12);
          ctx.arc(mousePos.x, mousePos.y, lensRadius, 0, Math.PI * 2);
          ctx.clip();

          // Draw revealed slice
          ctx.drawImage(activeImage, 0, 0, canvas.width, canvas.height);
          ctx.restore();

          // Draw lens border
          ctx.save();
          ctx.beginPath();
          ctx.arc(mousePos.x, mousePos.y, lensRadius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        } else {
          // Draw subtle instructional text on canvas
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.font = 'bold 22px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('⚡ PRESS & HOLD TO REVEAL WITH SPOTLIGHT LENS', canvas.width / 2, canvas.height / 2);
          ctx.restore();
        }
      } else {
        // Standard DRM Mode: Draw full image
        ctx.drawImage(activeImage, 0, 0, canvas.width, canvas.height);
      }

      // Draw Dynamic Moving Forensic Watermark
      if (imageMetadata.watermark_enabled !== false && imageMetadata.watermarkEnabled !== false) {
        drawForensicWatermark();
      }
    } else {
      // Obscure completely when window is defocused
      ctx.fillStyle = '#06080d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    animationFrameId = requestAnimationFrame(renderLoop);
  }

  function drawForensicWatermark() {
    ctx.save();

    // Animate watermark position
    watermarkPos.x += watermarkPos.dx;
    watermarkPos.y += watermarkPos.dy;

    if (watermarkPos.x < 20 || watermarkPos.x > canvas.width - 250) watermarkPos.dx *= -1;
    if (watermarkPos.y < 30 || watermarkPos.y > canvas.height - 80) watermarkPos.dy *= -1;

    // Watermark text
    const ip = imageMetadata.viewer_ip || imageMetadata.viewerIp || '127.0.0.1';
    const nowUtc = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const tokenTrace = token.substring(0, 8);

    // Diagonal floating watermark
    ctx.translate(watermarkPos.x, watermarkPos.y);
    ctx.rotate(-0.15);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`VIEWER IP: ${ip}`, 0, 0);
    ctx.fillText(`TIMESTAMP: ${nowUtc}`, 0, 18);
    ctx.fillText(`TOKEN: ${tokenTrace} • CONFIDENTIAL`, 0, 36);

    ctx.restore();
  }

  // --- ANTI-SCREENSHOT & DEFENSE SHIELDS ---
  function setupSecurityShields() {
    // 1. Window Blur & Visibility Defocus Shield
    const handleBlur = () => {
      isWindowFocused = false;
      screenshotShield.classList.add('active');
      headerStatusText.innerText = 'Defocus Shielded';
      headerDot.style.background = '#ff3366';
      if (ctx && canvas) {
        ctx.fillStyle = '#06080d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    const handleFocus = () => {
      if (isBurned) return;
      isWindowFocused = true;
      screenshotShield.classList.remove('active');
      headerStatusText.innerText = 'DRM Active';
      headerDot.style.background = '#00ff88';
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        handleBlur();
      } else {
        handleFocus();
      }
    });

    // 2. Intercept Screen Capture & Dev Key Combos
    window.addEventListener('keydown', (e) => {
      const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;
      const isSnippingWin = (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'S' || e.key === 's');
      const isPrintCmd = (e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P');
      const isSaveCmd = (e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S');
      const isDevTools = e.key === 'F12' || ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c'));

      if (isPrintScreen || isSnippingWin || isPrintCmd || isSaveCmd || isDevTools) {
        e.preventDefault();
        e.stopPropagation();

        // Clear clipboard
        try {
          navigator.clipboard?.writeText('DRM PROTECTED: Screenshots and copying are prohibited.');
        } catch (err) {}

        // Black out
        handleBlur();
        setTimeout(handleFocus, 2000);
        return false;
      }
    }, true);

    // 3. Disable Context Menu, Drag & Copy
    ['contextmenu', 'dragstart', 'selectstart', 'copy', 'cut'].forEach(evt => {
      window.addEventListener(evt, (e) => {
        e.preventDefault();
        return false;
      }, true);
    });

    // 4. Mouse & Touch Tracking for Spotlight Lens Mode
    const updateCoord = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      mousePos.x = (clientX - rect.left) * scaleX;
      mousePos.y = (clientY - rect.top) * scaleY;
    };

    canvas.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      updateCoord(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      updateCoord(e.clientX, e.clientY);
    });

    // Touch support for mobile devices
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        isMouseDown = true;
        updateCoord(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      isMouseDown = false;
    });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        updateCoord(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    // 5. DevTools Detection Loop (burn if DevTools opened)
    setInterval(() => {
      if (isBurned) return;
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      if (widthThreshold || heightThreshold) {
        destroyAndBurn('Developer inspection tools detected.');
      }
    }, 1500);

    // 6. Beacon Burn on Page Unload
    window.addEventListener('beforeunload', () => {
      if (!isBurned && activeImage) {
        navigator.sendBeacon(`/api/view/${token}/burn`, JSON.stringify({ reason: 'window_closed' }));
      }
    });
  }

  // --- SELF-DESTRUCT & SHRED ---
  async function destroyAndBurn(reason) {
    if (isBurned) return;
    isBurned = true;

    if (timerInterval) clearInterval(timerInterval);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // Scrub canvas memory
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    activeImage = null;

    // Send burn request to server
    try {
      await fetch(`/api/view/${token}/burn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
    } catch (e) {}

    showBurned(reason);
  }

  function showBurned(reason) {
    stateLoading.style.display = 'none';
    stateReady.style.display = 'none';
    stateViewing.style.display = 'none';
    stateBurned.style.display = 'block';
    screenshotShield.classList.remove('active');

    headerStatusText.innerText = 'Purged';
    headerDot.style.background = '#ff3366';

    if (reason) {
      burnedReasonText.innerText = reason;
    }
  }
})();
