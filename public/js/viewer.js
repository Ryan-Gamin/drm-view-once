// DRM View-Once Vault - Secure Anti-Screenshot Canvas Viewer Engine
(() => {
  const REDIRECT_TARGET = 'https://www.google.com';

  function redirectToGoogle() {
    window.location.replace(REDIRECT_TARGET);
  }

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
  const screenshotShield = document.getElementById('screenshotShield');
  const unlockBtn = document.getElementById('unlockBtn');
  const burnEarlyBtn = document.getElementById('burnEarlyBtn');
  const resumeViewingBtn = document.getElementById('resumeViewingBtn');
  const nativeDownloadBtn = document.getElementById('nativeDownloadBtn');
  const timerDisplay = document.getElementById('timerDisplay');
  const timerSubtitle = document.getElementById('timerSubtitle');
  const spotlightHint = document.getElementById('spotlightHint');
  const sessionDurationInfo = document.getElementById('sessionDurationInfo');
  const screenshotStatusInfo = document.getElementById('screenshotStatusInfo');
  const senderUsernameDisplay = document.getElementById('senderUsernameDisplay');
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
  let screenshotsAllowed = false;
  let downloadAllowed = false;
  let mousePos = { x: -9999, y: -9999 };
  let isHovering = false;
  let watermarkPos = { x: 50, y: 100, dx: 1.2, dy: 0.9 };
  let isBurned = false;

  document.addEventListener('DOMContentLoaded', async () => {
    setupHoverTracking();
    if (!token || token === 'viewer.html') {
      redirectToGoogle();
      return;
    }
    await checkTokenStatus();
  });

  function formatTime(seconds) {
    if (!seconds || seconds <= 0) return '∞ Infinity';
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    }
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}m ${s.toString().padStart(2, '0')}s`;
    }
    return `${seconds}s`;
  }

  async function checkTokenStatus() {
    try {
      const res = await fetch(`/api/view/${token}/status`);
      const data = await res.json();

      if (res.status === 404 || res.status === 410 || data.status === 'burned' || data.status === 'expired' || data.status === 'not_found') {
        redirectToGoogle();
        return;
      }

      imageMetadata = data;
      showReadyScreen(data);
    } catch (e) {
      redirectToGoogle();
    }
  }

  function showReadyScreen(meta) {
    stateLoading.style.display = 'none';
    stateViewing.style.display = 'none';
    stateReady.style.display = 'block';

    if (meta.senderUsername && senderUsernameDisplay) {
      senderUsernameDisplay.innerText = `@${meta.senderUsername}`;
    }

    screenshotsAllowed = Boolean(meta.allowScreenshots);
    downloadAllowed = Boolean(meta.allowDownload);

    if (screenshotStatusInfo) {
      screenshotStatusInfo.innerHTML = screenshotsAllowed
        ? `<strong>Screenshots:</strong> <span style="color: var(--accent-green);">Enabled by sender</span>`
        : `<strong>Screenshots:</strong> <span style="color: var(--accent-red);">Disabled (Strict shield active)</span>`;
    }

    const dur = meta.viewDuration;
    sessionDurationInfo.innerHTML = dur > 0 
      ? `<strong>Duration:</strong> ${formatTime(dur)} before self-destruct`
      : `<strong>Duration:</strong> ∞ Infinity (until tab/window closed)`;

    setupSecurityShields();
    unlockBtn.addEventListener('click', unlockAndDecrypt);
  }

  async function unlockAndDecrypt() {
    unlockBtn.disabled = true;
    unlockBtn.innerHTML = `
      <svg style="animation: spin 1s linear infinite;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
      <span>Decrypting & Shredding Server Copy...</span>
    `;

    try {
      const res = await fetch(`/api/view/${token}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        redirectToGoogle();
        return;
      }

      const payload = await res.json();
      imageMetadata = payload;
      screenshotsAllowed = Boolean(payload.allowScreenshots);
      downloadAllowed = Boolean(payload.allowDownload);

      const img = new Image();
      img.onload = () => {
        activeImage = img;
        startViewingSession(payload);
      };
      img.onerror = () => {
        redirectToGoogle();
      };
      img.src = payload.data;
    } catch (e) {
      redirectToGoogle();
    }
  }

  function startViewingSession(payload) {
    stateReady.style.display = 'none';
    stateViewing.style.display = 'block';

    isWindowFocused = true;
    screenshotShield.classList.remove('active');

    headerStatusText.innerText = screenshotsAllowed ? 'Screenshots Enabled' : 'DRM Armed';
    headerDot.style.background = '#00ff88';

    // Canvas sizing
    canvas.width = activeImage.naturalWidth;
    canvas.height = activeImage.naturalHeight;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    remainingSeconds = payload.viewDuration !== undefined ? payload.viewDuration : 30;
    isSpotlightActive = Boolean(payload.spotlightMode);

    if (isSpotlightActive) {
      spotlightHint.style.display = 'block';
    }

    // Native Download Button (if allowed by uploader)
    if (downloadAllowed && nativeDownloadBtn) {
      nativeDownloadBtn.style.display = 'inline-flex';
      nativeDownloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = payload.filename || 'view-once-image.png';
        link.href = payload.data;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }

    // Setup Hover Tracking and Security Shields
    setupHoverTracking();
    setupSecurityShields();

    // Start Timer
    if (remainingSeconds > 0) {
      timerDisplay.innerText = formatTime(remainingSeconds);
      timerInterval = setInterval(() => {
        remainingSeconds--;
        timerDisplay.innerText = formatTime(remainingSeconds);
        if (remainingSeconds <= 10) {
          timerDisplay.style.color = '#ff3366';
        }
        if (remainingSeconds <= 0) {
          destroyAndBurn('Viewing timer expired.');
        }
      }, 1000);
    } else {
      timerDisplay.innerText = '∞ Infinity';
      if (timerSubtitle) timerSubtitle.innerText = 'Active until tab is closed';
    }

    renderLoop();

    burnEarlyBtn.addEventListener('click', () => {
      destroyAndBurn('Burned by user request.');
    });
  }

  // --- RENDER LOOP WITH DRM & WATERMARKING ---
  function renderLoop() {
    if (isBurned || !activeImage) return;

    if (isWindowFocused || screenshotsAllowed) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isSpotlightActive) {
        ctx.fillStyle = '#080a0f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const intensity = imageMetadata?.spotlightIntensity || 'full';

        if (isHovering && (intensity === 'full' || mousePos.x >= 0)) {
          if (intensity === 'full') {
            // Whole image, hover to reveal
            ctx.drawImage(activeImage, 0, 0, canvas.width, canvas.height);
          } else {
            // Lens mode: small or large
            const minDim = Math.min(canvas.width, canvas.height);
            const lensRadius = intensity === 'large'
              ? Math.max(280, minDim * 0.45)
              : Math.max(90, minDim * 0.15);

            ctx.save();
            ctx.beginPath();
            ctx.arc(mousePos.x, mousePos.y, lensRadius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(activeImage, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.arc(mousePos.x, mousePos.y, lensRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
            ctx.lineWidth = intensity === 'large' ? 4 : 3;
            ctx.stroke();
            ctx.restore();
          }
        } else {
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          const fontSize = Math.max(16, Math.min(26, Math.floor(canvas.width * 0.035)));
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚡ HOVER OVER IMAGE TO REVEAL', canvas.width / 2, canvas.height / 2);
          ctx.restore();
        }
      } else {
        ctx.drawImage(activeImage, 0, 0, canvas.width, canvas.height);
      }

      if (imageMetadata.watermarkEnabled !== false) {
        drawForensicWatermark();
      }
    } else {
      ctx.fillStyle = '#06080d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    animationFrameId = requestAnimationFrame(renderLoop);
  }

  function drawForensicWatermark() {
    ctx.save();

    watermarkPos.x += watermarkPos.dx;
    watermarkPos.y += watermarkPos.dy;

    if (watermarkPos.x < 20 || watermarkPos.x > canvas.width - 250) watermarkPos.dx *= -1;
    if (watermarkPos.y < 30 || watermarkPos.y > canvas.height - 80) watermarkPos.dy *= -1;

    const ip = imageMetadata.viewerIp || '127.0.0.1';
    const sender = imageMetadata.senderUsername || 'Confidential';
    const nowUtc = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const tokenTrace = token.substring(0, 8);

    ctx.translate(watermarkPos.x, watermarkPos.y);
    ctx.rotate(-0.15);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`FROM: @${sender} • VIEWER: ${ip}`, 0, 0);
    ctx.fillText(`TIME: ${nowUtc}`, 0, 18);
    ctx.fillText(`SESSION: ${tokenTrace} • VIEW ONCE`, 0, 36);

    ctx.restore();
  }

  // --- HOVER TO REVEAL ENGINE ---
  let hoverListenersConfigured = false;
  function setupHoverTracking() {
    if (hoverListenersConfigured) return;
    hoverListenersConfigured = true;

    const handleMove = (clientX, clientY) => {
      if (!canvas || !activeImage) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const inside = (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );

      if (inside) {
        isHovering = true;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        mousePos.x = (clientX - rect.left) * scaleX;
        mousePos.y = (clientY - rect.top) * scaleY;
      } else {
        isHovering = false;
        mousePos = { x: -9999, y: -9999 };
      }
    };

    window.addEventListener('pointermove', (e) => handleMove(e.clientX, e.clientY), { passive: true });
    window.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY), { passive: true });

    window.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isHovering = false;
      mousePos = { x: -9999, y: -9999 };
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      isHovering = false;
      mousePos = { x: -9999, y: -9999 };
    });
  }

  // --- ANTI-SCREENSHOT & DEFENSE SHIELDS ---
  let securityShieldsConfigured = false;
  function setupSecurityShields() {
    if (securityShieldsConfigured) return;
    if (screenshotsAllowed) return;
    securityShieldsConfigured = true;

    const triggerShield = () => {
      if (screenshotsAllowed || isBurned) return;
      isWindowFocused = false;
      screenshotShield.classList.add('active');
      headerStatusText.innerText = 'Shield Active';
      headerDot.style.background = '#ff3366';
      if (ctx && canvas) {
        ctx.fillStyle = '#06080d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      try {
        navigator.clipboard?.writeText('DRM PROTECTED: Screenshots are disabled on OneView.');
      } catch (err) {}
    };

    const dismissShield = () => {
      if (isBurned) return;
      isWindowFocused = true;
      screenshotShield.classList.remove('active');
      headerStatusText.innerText = screenshotsAllowed ? 'Screenshots Enabled' : 'DRM Armed';
      headerDot.style.background = '#00ff88';
    };

    // 1. LITERALLY ANY DETECTED KEY PRESS ACTIVATES SCREENSHOT PROTECTION
    window.addEventListener('keydown', (e) => {
      if (!screenshotsAllowed) {
        e.preventDefault();
        e.stopPropagation();
        triggerShield();
        return false;
      }
    }, true);

    window.addEventListener('keyup', (e) => {
      if (!screenshotsAllowed) {
        e.preventDefault();
        e.stopPropagation();
        triggerShield();
        return false;
      }
    }, true);

    // 2. WHEN PAGE IS FOCUSED (e.g. from background tab, external app, or snipping tool)
    window.addEventListener('focus', () => {
      if (!screenshotsAllowed) {
        triggerShield();
      }
    });

    // 3. DEFOCUS / BLUR / TAB SWITCH / PAGE HIDE / MOUSE LEAVE
    window.addEventListener('blur', triggerShield);
    window.addEventListener('pagehide', triggerShield);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) triggerShield();
    });
    document.addEventListener('mouseleave', () => {
      if (!screenshotsAllowed) triggerShield();
    });

    // 4. Click to Resume Viewing
    resumeViewingBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      dismissShield();
    });
    screenshotShield?.addEventListener('click', (e) => {
      if (e.target === screenshotShield || e.target === resumeViewingBtn) {
        dismissShield();
      }
    });

    ['contextmenu', 'dragstart', 'selectstart', 'copy', 'cut'].forEach(evt => {
      window.addEventListener(evt, (e) => {
        e.preventDefault();
        return false;
      }, true);
    });

    setInterval(() => {
      if (isBurned) return;
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      if (widthThreshold || heightThreshold) {
        destroyAndBurn('DevTools detected.');
      }
    }, 1500);

    window.addEventListener('beforeunload', () => {
      if (!isBurned && activeImage) {
        navigator.sendBeacon(`/api/view/${token}/burn`, JSON.stringify({ reason: 'window_closed' }));
      }
    });
  }

  // --- SELF-DESTRUCT & REDIRECT TO GOOGLE ---
  async function destroyAndBurn(reason) {
    if (isBurned) return;
    isBurned = true;

    if (timerInterval) clearInterval(timerInterval);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    activeImage = null;

    try {
      await fetch(`/api/view/${token}/burn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
    } catch (e) {}

    redirectToGoogle();
  }
})();
