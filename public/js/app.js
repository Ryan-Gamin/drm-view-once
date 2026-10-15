// DRM View-Once Vault - Dashboard Client
let currentUser = null;
let selectedFile = null;
let selectedFileDataUri = null;
let qrCodeInstance = null;

// DOM Elements
const authContainer = document.getElementById('authContainer');
const loginPromptSection = document.getElementById('loginPromptSection');
const dashboardSection = document.getElementById('dashboardSection');
const demoLoginBtn = document.getElementById('demoLoginBtn');

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewCard = document.getElementById('previewCard');
const previewThumb = document.getElementById('previewThumb');
const previewName = document.getElementById('previewName');
const previewSize = document.getElementById('previewSize');
const removeFileBtn = document.getElementById('removeFileBtn');

const durationSelect = document.getElementById('durationSelect');
const antiScreenshotSelect = document.getElementById('antiScreenshotSelect');
const watermarkToggle = document.getElementById('watermarkToggle');
const spotlightToggle = document.getElementById('spotlightToggle');
const uploadBtn = document.getElementById('uploadBtn');

const linksTableBody = document.getElementById('linksTableBody');
const refreshLinksBtn = document.getElementById('refreshLinksBtn');

const shareModal = document.getElementById('shareModal');
const shareUrlInput = document.getElementById('shareUrlInput');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const copyBtnText = document.getElementById('copyBtnText');
const openLinkBtn = document.getElementById('openLinkBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setupEventListeners();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated && data.user) {
      currentUser = data.user;
      renderLoggedIn();
    } else {
      currentUser = null;
      renderLoggedOut();
      setupGoogleAuth();
    }
  } catch (e) {
    console.error('Auth check error:', e);
    renderLoggedOut();
  }
}

async function setupGoogleAuth() {
  try {
    const res = await fetch('/api/auth/config');
    const config = await res.json();
    const clientId = config.google_client_id;

    if (clientId && window.google) {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential
      });
      const btnWrapper = document.getElementById('googleSignInBtn');
      if (btnWrapper) {
        google.accounts.id.renderButton(btnWrapper, {
          theme: 'filled_blue',
          size: 'large',
          text: 'signin_with',
          shape: 'pill'
        });
      }
    }
  } catch (e) {
    console.warn('Google auth init error:', e);
  }
}

async function handleGoogleCredential(response) {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      renderLoggedIn();
    } else {
      alert('Google authentication failed: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Authentication error: ' + e.message);
  }
}

function renderLoggedIn() {
  authContainer.innerHTML = `
    <div class="user-bar">
      <img src="${currentUser.picture || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + currentUser.id}" class="user-avatar" alt="Avatar">
      <div style="font-size: 0.85rem;">
        <p style="font-weight: 600;">${currentUser.name || 'User'}</p>
        <p style="color: var(--text-muted); font-size: 0.75rem;">${currentUser.email}</p>
      </div>
      <button id="logoutBtn" class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.35rem 0.75rem; margin-left: 0.5rem;">Sign Out</button>
    </div>
  `;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.reload();
  });

  loginPromptSection.style.display = 'none';
  dashboardSection.style.display = 'block';

  loadUserLinks();
}

function renderLoggedOut() {
  authContainer.innerHTML = `
    <div style="font-size: 0.85rem; color: var(--text-muted);">Not signed in</div>
  `;
  loginPromptSection.style.display = 'block';
  dashboardSection.style.display = 'none';
}

function setupEventListeners() {
  // Demo Login
  demoLoginBtn?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        currentUser = data.user;
        renderLoggedIn();
      }
    } catch (e) {
      alert('Demo login failed: ' + e.message);
    }
  });

  // Dropzone clicks & drag-and-drop
  dropzone.addEventListener('click', () => fileInput.click());
  
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetFileSelection();
  });

  // Upload button
  uploadBtn.addEventListener('click', handleUpload);

  // Refresh links
  refreshLinksBtn?.addEventListener('click', loadUserLinks);

  // Modal actions
  closeModalBtn.addEventListener('click', () => shareModal.classList.remove('active'));
  shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) shareModal.classList.remove('active');
  });

  copyLinkBtn.addEventListener('click', () => {
    shareUrlInput.select();
    navigator.clipboard.writeText(shareUrlInput.value);
    copyBtnText.innerText = 'Copied!';
    setTimeout(() => {
      copyBtnText.innerText = 'Copy';
    }, 2000);
  });
}

function handleFileSelected(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file (PNG, JPG, WEBP, GIF).');
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    alert('Image file size must be under 25MB.');
    return;
  }

  selectedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    selectedFileDataUri = e.target.result;
    previewThumb.src = selectedFileDataUri;
    previewName.innerText = file.name;
    previewSize.innerText = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

    dropzone.style.display = 'none';
    previewCard.style.display = 'flex';
    uploadBtn.disabled = false;
  };
  reader.readAsDataURL(file);
}

function resetFileSelection() {
  selectedFile = null;
  selectedFileDataUri = null;
  fileInput.value = '';
  dropzone.style.display = 'block';
  previewCard.style.display = 'none';
  uploadBtn.disabled = true;
}

async function handleUpload() {
  if (!selectedFile || !selectedFileDataUri) return;

  uploadBtn.disabled = true;
  uploadBtn.innerHTML = `
    <svg style="animation: spin 1s linear infinite;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
    <span>Encrypting & Generating Link...</span>
  `;

  try {
    const payload = {
      fileData: selectedFileDataUri,
      filename: selectedFile.name,
      mimeType: selectedFile.type,
      viewDuration: parseInt(durationSelect.value, 10),
      spotlightMode: spotlightToggle.checked,
      watermarkEnabled: watermarkToggle.checked,
      antiScreenshotLevel: antiScreenshotSelect.value
    };

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Upload failed');
    }

    // Success! Show share modal
    showShareModal(data.token);
    resetFileSelection();
    loadUserLinks();
  } catch (e) {
    alert('Upload error: ' + e.message);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
      <span>Create View-Once DRM Link</span>
    `;
  }
}

function showShareModal(token) {
  const shareUrl = `${window.location.origin}/v/${token}`;
  shareUrlInput.value = shareUrl;
  openLinkBtn.href = shareUrl;

  // Render QR Code
  const qrContainer = document.getElementById('qrcode');
  qrContainer.innerHTML = '';
  if (window.QRCode) {
    qrCodeInstance = new QRCode(qrContainer, {
      text: shareUrl,
      width: 160,
      height: 160,
      colorDark: '#090a0f',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  shareModal.classList.add('active');
}

async function loadUserLinks() {
  try {
    const res = await fetch('/api/images');
    const data = await res.json();
    const images = data.images || [];

    if (images.length === 0) {
      linksTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No uploads yet. Create your first view-once link above!</td>
        </tr>
      `;
      return;
    }

    linksTableBody.innerHTML = images.map(img => {
      let badge = '<span class="badge badge-active">Active (Unopened)</span>';
      if (img.isBurned || img.isViewed) {
        badge = '<span class="badge badge-burned">Burned / Shredded</span>';
      }

      const createdDate = new Date(img.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const durationText = img.viewDuration > 0 ? `${img.viewDuration}s` : 'Tab Close';

      return `
        <tr>
          <td style="font-weight: 600; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${img.filename}
          </td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${createdDate}</td>
          <td>${badge}</td>
          <td style="color: var(--text-muted); font-size: 0.85rem;">${durationText}</td>
          <td style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${img.viewerIp || '—'}</td>
          <td>
            <button onclick="deleteLink('${img.token}')" class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
              Revoke
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error('Failed to load links:', e);
  }
}

window.deleteLink = async (token) => {
  if (!confirm('Are you sure you want to revoke and shred this link immediately?')) return;
  try {
    await fetch(`/api/images/${token}`, { method: 'DELETE' });
    loadUserLinks();
  } catch (e) {
    alert('Failed to delete: ' + e.message);
  }
};
