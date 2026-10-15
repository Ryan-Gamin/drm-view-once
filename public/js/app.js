// DRM View-Once Vault - Dashboard Client (Username-Only Flow with Custom Permissions)
let currentUsername = localStorage.getItem('drm_username') || '';
let selectedFile = null;
let selectedFileDataUri = null;
let qrCodeInstance = null;

// DOM Elements
const userHeaderContainer = document.getElementById('userHeaderContainer');
const usernamePromptSection = document.getElementById('usernamePromptSection');
const dashboardSection = document.getElementById('dashboardSection');
const usernameForm = document.getElementById('usernameForm');
const usernameInput = document.getElementById('usernameInput');
const watermarkUsernamePreview = document.getElementById('watermarkUsernamePreview');

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewCard = document.getElementById('previewCard');
const previewThumb = document.getElementById('previewThumb');
const previewName = document.getElementById('previewName');
const previewSize = document.getElementById('previewSize');
const removeFileBtn = document.getElementById('removeFileBtn');

const durationSelect = document.getElementById('durationSelect');
const allowScreenshotsToggle = document.getElementById('allowScreenshotsToggle');
const screenshotPermText = document.getElementById('screenshotPermText');
const allowDownloadToggle = document.getElementById('allowDownloadToggle');
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
  setupEventListeners();
  if (currentUsername) {
    await loginWithUsername(currentUsername, false);
  } else {
    showUsernamePrompt();
  }
});

async function loginWithUsername(name, save = true) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name })
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentUsername = data.user.username;
      if (save) localStorage.setItem('drm_username', currentUsername);
      renderActiveUser();
      loadUserLinks();
    } else {
      showUsernamePrompt();
    }
  } catch (e) {
    currentUsername = name;
    renderActiveUser();
  }
}

function showUsernamePrompt() {
  usernamePromptSection.style.display = 'block';
  dashboardSection.style.display = 'none';
  userHeaderContainer.innerHTML = '';
}

function renderActiveUser() {
  usernamePromptSection.style.display = 'none';
  dashboardSection.style.display = 'block';

  if (watermarkUsernamePreview) {
    watermarkUsernamePreview.innerText = currentUsername;
  }

  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUsername)}`;

  userHeaderContainer.innerHTML = `
    <div class="user-bar">
      <img src="${avatarUrl}" class="user-avatar" alt="Avatar">
      <div style="font-size: 0.85rem;">
        <p style="font-weight: 700; color: var(--accent-cyan);">@${currentUsername}</p>
        <p style="color: var(--text-muted); font-size: 0.75rem;">Sender Active</p>
      </div>
      <button id="switchUserBtn" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.25rem 0.6rem; margin-left: 0.5rem;">
        Change
      </button>
    </div>
  `;

  document.getElementById('switchUserBtn')?.addEventListener('click', () => {
    localStorage.removeItem('drm_username');
    currentUsername = '';
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    showUsernamePrompt();
    usernameInput.value = '';
    usernameInput.focus();
  });
}

function setupEventListeners() {
  usernameForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = usernameInput.value.trim();
    if (val) {
      await loginWithUsername(val, true);
    }
  });

  allowScreenshotsToggle?.addEventListener('change', () => {
    if (screenshotPermText) {
      screenshotPermText.innerText = allowScreenshotsToggle.checked
        ? 'Allow Screenshots (Shield Disabled)'
        : 'Disallow Screenshots (Strict Shield)';
    }
  });

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

  uploadBtn.addEventListener('click', handleUpload);
  refreshLinksBtn?.addEventListener('click', loadUserLinks);

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
  if (!selectedFile || !selectedFileDataUri || !currentUsername) return;

  uploadBtn.disabled = true;
  uploadBtn.innerHTML = `
    <svg style="animation: spin 1s linear infinite;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
    <span>Encrypting & Generating Link...</span>
  `;

  try {
    const payload = {
      username: currentUsername,
      fileData: selectedFileDataUri,
      filename: selectedFile.name,
      mimeType: selectedFile.type,
      viewDuration: parseInt(durationSelect.value, 10),
      allowScreenshots: allowScreenshotsToggle.checked,
      allowDownload: allowDownloadToggle.checked,
      spotlightMode: spotlightToggle.checked,
      watermarkEnabled: watermarkToggle.checked
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

    showShareModal(data.token);
    resetFileSelection();
    loadUserLinks();
  } catch (e) {
    alert('Upload error: ' + e.message);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
      <span>Generate View-Once DRM Link</span>
    `;
  }
}

function showShareModal(token) {
  const shareUrl = `${window.location.origin}/v/${token}`;
  shareUrlInput.value = shareUrl;
  openLinkBtn.href = shareUrl;

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

function formatDuration(sec) {
  if (!sec || sec === 0) return '∞ (Infinity)';
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h`;
  if (sec >= 60) return `${Math.floor(sec / 60)}m`;
  return `${sec}s`;
}

async function loadUserLinks() {
  try {
    const res = await fetch('/api/images');
    const data = await res.json();
    const images = data.images || [];

    if (images.length === 0) {
      linksTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No uploads yet. Create your first view-once link above!</td>
        </tr>
      `;
      return;
    }

    linksTableBody.innerHTML = images.map(img => {
      let badge = '<span class="badge badge-active">Active</span>';
      if (img.isBurned || img.isViewed) {
        badge = '<span class="badge badge-burned">Burned → Redirects to Google</span>';
      }

      const createdDate = new Date(img.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const durationText = formatDuration(img.viewDuration);
      const screenshotsAllowed = img.allowScreenshots ? '<span style="color: var(--accent-green);">Allowed</span>' : '<span style="color: var(--accent-red);">Blocked</span>';
      const downloadAllowed = img.allowDownload ? '<span style="color: var(--accent-green);">Yes</span>' : '<span style="color: var(--text-muted);">No</span>';

      return `
        <tr>
          <td style="font-weight: 600; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${img.filename}
          </td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${createdDate}</td>
          <td>${badge}</td>
          <td style="color: var(--accent-cyan); font-weight: 600; font-size: 0.85rem;">${durationText}</td>
          <td style="font-size: 0.85rem;">${screenshotsAllowed}</td>
          <td style="font-size: 0.85rem;">${downloadAllowed}</td>
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
  if (!confirm('Are you sure you want to revoke and shred this link immediately? Future visitors will be redirected to Google.')) return;
  try {
    await fetch(`/api/images/${token}`, { method: 'DELETE' });
    loadUserLinks();
  } catch (e) {
    alert('Failed to delete: ' + e.message);
  }
};
