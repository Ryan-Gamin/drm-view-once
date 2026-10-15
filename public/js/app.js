// OneView - Dashboard Client (Username-Only Flow with Custom Permissions & Edit/Extend)
let currentUsername = localStorage.getItem('drm_username') || '';
let selectedFile = null;
let selectedFileDataUri = null;
let qrCodeInstance = null;
let userImagesCache = [];

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
const previewDimensions = document.getElementById('previewDimensions');
const removeFileBtn = document.getElementById('removeFileBtn');

const durationSelect = document.getElementById('durationSelect');
const customDurationBox = document.getElementById('customDurationBox');
const customDurationInput = document.getElementById('customDurationInput');

const allowScreenshotsToggle = document.getElementById('allowScreenshotsToggle');
const screenshotPermText = document.getElementById('screenshotPermText');
const screenshotPermDesc = document.getElementById('screenshotPermDesc');
const allowDownloadToggle = document.getElementById('allowDownloadToggle');
const watermarkToggle = document.getElementById('watermarkToggle');
const spotlightToggle = document.getElementById('spotlightToggle');
const spotlightIntensityContainer = document.getElementById('spotlightIntensityContainer');
const uploadBtn = document.getElementById('uploadBtn');

const linksTableBody = document.getElementById('linksTableBody');
const refreshLinksBtn = document.getElementById('refreshLinksBtn');

const shareModal = document.getElementById('shareModal');
const shareUrlInput = document.getElementById('shareUrlInput');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const copyBtnText = document.getElementById('copyBtnText');
const openLinkBtn = document.getElementById('openLinkBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

// Edit / Extend Modal Elements
const editModal = document.getElementById('editModal');
const editFilenameDisplay = document.getElementById('editFilenameDisplay');
const editTokenInput = document.getElementById('editTokenInput');
const editDurationSelect = document.getElementById('editDurationSelect');
const editCustomDurationBox = document.getElementById('editCustomDurationBox');
const editCustomDurationInput = document.getElementById('editCustomDurationInput');
const editAllowScreenshotsToggle = document.getElementById('editAllowScreenshotsToggle');
const editScreenshotPermText = document.getElementById('editScreenshotPermText');
const editScreenshotPermDesc = document.getElementById('editScreenshotPermDesc');
const editAllowDownloadToggle = document.getElementById('editAllowDownloadToggle');
const editWatermarkToggle = document.getElementById('editWatermarkToggle');
const editSpotlightToggle = document.getElementById('editSpotlightToggle');
const editSpotlightIntensityContainer = document.getElementById('editSpotlightIntensityContainer');
const saveEditBtn = document.getElementById('saveEditBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const closeEditModalBtn = document.getElementById('closeEditModalBtn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  if (currentUsername) {
    await loginWithUsername(currentUsername, false);
  } else {
    showUsernamePrompt();
  }
});

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  const kb = bytes / 1024;
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (mb < 0.1) {
    return `${kb.toFixed(1)} KB (${mb.toFixed(3)} MB)`;
  } else if (mb < 1) {
    return `${kb.toFixed(1)} KB (${mb.toFixed(2)} MB)`;
  } else {
    return `${mb.toFixed(2)} MB (${kb.toFixed(0)} KB)`;
  }
}

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
        ? 'Screenshots are disabled'
        : 'Screenshots are enabled';
    }
    if (screenshotPermDesc) {
      screenshotPermDesc.innerText = allowScreenshotsToggle.checked
        ? 'Strict defocus shield active: blocks Snipping Tool, Win+Shift+S, and PrintScreen'
        : 'Shield disabled: viewers may take screenshots freely';
    }
  });

  spotlightToggle?.addEventListener('change', () => {
    if (spotlightIntensityContainer) {
      spotlightIntensityContainer.style.display = spotlightToggle.checked ? 'block' : 'none';
    }
  });

  editAllowScreenshotsToggle?.addEventListener('change', () => {
    if (editScreenshotPermText) {
      editScreenshotPermText.innerText = editAllowScreenshotsToggle.checked
        ? 'Screenshots are disabled'
        : 'Screenshots are enabled';
    }
    if (editScreenshotPermDesc) {
      editScreenshotPermDesc.innerText = editAllowScreenshotsToggle.checked
        ? 'Strict defocus shield active: blocks Snipping Tool, Win+Shift+S, and PrintScreen'
        : 'Shield disabled: viewers may take screenshots freely';
    }
  });

  editSpotlightToggle?.addEventListener('change', () => {
    if (editSpotlightIntensityContainer) {
      editSpotlightIntensityContainer.style.display = editSpotlightToggle.checked ? 'block' : 'none';
    }
  });

  durationSelect?.addEventListener('change', () => {
    if (customDurationBox) {
      customDurationBox.style.display = durationSelect.value === 'custom' ? 'block' : 'none';
      if (durationSelect.value === 'custom') {
        customDurationInput?.focus();
      }
    }
  });

  editDurationSelect?.addEventListener('change', () => {
    if (editCustomDurationBox) {
      editCustomDurationBox.style.display = editDurationSelect.value === 'custom' ? 'block' : 'none';
      if (editDurationSelect.value === 'custom') {
        editCustomDurationInput?.focus();
      }
    }
  });

  // Direct Clipboard Paste Listener (Ctrl+V after Win+Shift+S)
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          const ext = item.type.split('/')[1] || 'png';
          const file = new File([blob], `screenshot_${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
          handleFileSelected(file);
          break;
        }
      }
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

  // Edit / Extend Modal Listeners
  closeEditModalBtn?.addEventListener('click', () => editModal.classList.remove('active'));
  cancelEditBtn?.addEventListener('click', () => editModal.classList.remove('active'));
  editModal?.addEventListener('click', (e) => {
    if (e.target === editModal) editModal.classList.remove('active');
  });

  saveEditBtn?.addEventListener('click', handleSaveEdit);
}

function compressImage(img, mimeType) {
  return new Promise((resolve) => {
    const maxDim = 2560;
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const outMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    const outUri = canvas.toDataURL(outMime, 0.88);
    const sizeInBytes = Math.round((outUri.length - outUri.indexOf(',') - 1) * 0.75);
    resolve({ optimizedUri: outUri, optimizedSize: sizeInBytes });
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
    const dataUri = e.target.result;
    const testImg = new Image();
    testImg.onload = () => {
      // If image is larger than 3MB, optimize/compress to prevent 413 Payload Too Large on Vercel
      if (file.size > 3 * 1024 * 1024) {
        compressImage(testImg, file.type).then(({ optimizedUri, optimizedSize }) => {
          selectedFileDataUri = optimizedUri;
          previewThumb.src = optimizedUri;
          previewName.innerText = file.name;
          previewSize.innerText = formatFileSize(optimizedSize) + ' (Optimized)';
          if (previewDimensions) {
            previewDimensions.innerText = `${testImg.naturalWidth} × ${testImg.naturalHeight} px`;
          }
        });
      } else {
        selectedFileDataUri = dataUri;
        previewThumb.src = dataUri;
        previewName.innerText = file.name;
        previewSize.innerText = formatFileSize(file.size);
        if (previewDimensions) {
          previewDimensions.innerText = `${testImg.naturalWidth} × ${testImg.naturalHeight} px`;
        }
      }

      dropzone.style.display = 'none';
      previewCard.style.display = 'flex';
      uploadBtn.disabled = false;
    };
    testImg.src = dataUri;
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
  if (previewSize) previewSize.innerText = '';
  if (previewDimensions) previewDimensions.innerText = '';
}

async function handleUpload() {
  if (!selectedFile || !selectedFileDataUri || !currentUsername) return;

  let finalDuration = 30;
  if (durationSelect.value === 'custom') {
    finalDuration = parseInt(customDurationInput.value, 10);
    if (!finalDuration || finalDuration <= 0) {
      alert('Please enter a valid number of seconds for custom duration.');
      customDurationInput.focus();
      return;
    }
  } else {
    finalDuration = parseInt(durationSelect.value, 10);
  }

  uploadBtn.disabled = true;
  uploadBtn.innerHTML = `
    <svg style="animation: spin 1s linear infinite;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
    <span>Encrypting & Generating Link...</span>
  `;

  try {
    const intensity = document.querySelector('input[name="spotlightIntensity"]:checked')?.value || 'small';
    const payload = {
      username: currentUsername,
      fileData: selectedFileDataUri,
      filename: selectedFile.name,
      mimeType: selectedFile.type,
      viewDuration: finalDuration,
      allowScreenshots: !allowScreenshotsToggle.checked,
      allowDownload: allowDownloadToggle.checked,
      spotlightMode: spotlightToggle.checked,
      spotlightIntensity: intensity,
      watermarkEnabled: watermarkToggle.checked // Off by default
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
      <span>Generate OneView Link</span>
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
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${sec}s`;
}

async function loadUserLinks() {
  try {
    const res = await fetch('/api/images');
    const data = await res.json();
    const images = data.images || [];
    userImagesCache = images;

    if (images.length === 0) {
      linksTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No uploads yet. Create your first view-once link above!</td>
        </tr>
      `;
      return;
    }

    linksTableBody.innerHTML = images.map(img => {
      const isBurned = img.isBurned || img.isViewed;
      let badge = '<span class="badge badge-active">Active</span>';
      if (isBurned) {
        badge = '<span class="badge badge-burned">Burned → Google</span>';
      }

      const createdDate = new Date(img.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const durationText = formatDuration(img.viewDuration);
      const screenshotsAllowed = !img.allowScreenshots ? '<span style="color: var(--accent-red);">Disabled</span>' : '<span style="color: var(--accent-green);">Enabled</span>';
      const downloadAllowed = img.allowDownload ? '<span style="color: var(--accent-green);">Yes</span>' : '<span style="color: var(--text-muted);">No</span>';

      const editBtn = isBurned 
        ? `<button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; opacity: 0.4; cursor: not-allowed;" disabled title="Burned links cannot be edited">Edit</button>`
        : `<button onclick="editLink('${img.token}')" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-right: 0.25rem;">Edit / Extend</button>`;

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
          <td style="white-space: nowrap;">
            ${editBtn}
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

window.editLink = (token) => {
  const item = userImagesCache.find(x => x.token === token);
  if (!item) return;
  if (item.isBurned || item.isViewed) {
    alert('This link has already been viewed or burned and cannot be edited.');
    return;
  }

  editTokenInput.value = token;
  editFilenameDisplay.innerText = item.filename || 'image.png';

  const dur = item.viewDuration;
  const standardDurations = ['0', '5', '10', '15', '30', '60', '180', '300', '600', '900', '1800', '2700', '3600'];
  if (standardDurations.includes(String(dur))) {
    editDurationSelect.value = String(dur);
    editCustomDurationBox.style.display = 'none';
  } else {
    editDurationSelect.value = 'custom';
    editCustomDurationInput.value = dur;
    editCustomDurationBox.style.display = 'block';
  }

  // Toggle checked means disabled!
  editAllowScreenshotsToggle.checked = !Boolean(item.allowScreenshots);
  if (editScreenshotPermText) {
    editScreenshotPermText.innerText = editAllowScreenshotsToggle.checked
      ? 'Screenshots are disabled'
      : 'Screenshots are enabled';
  }
  if (editScreenshotPermDesc) {
    editScreenshotPermDesc.innerText = editAllowScreenshotsToggle.checked
      ? 'Strict defocus shield active: blocks Snipping Tool, Win+Shift+S, and PrintScreen'
      : 'Shield disabled: viewers may take screenshots freely';
  }

  editAllowDownloadToggle.checked = Boolean(item.allowDownload);
  editWatermarkToggle.checked = Boolean(item.watermarkEnabled);

  editSpotlightToggle.checked = Boolean(item.spotlightMode);
  if (editSpotlightIntensityContainer) {
    editSpotlightIntensityContainer.style.display = item.spotlightMode ? 'block' : 'none';
  }
  const currentIntensity = item.spotlightIntensity || 'small';
  const intensityRadio = document.querySelector(`input[name="editSpotlightIntensity"][value="${currentIntensity}"]`);
  if (intensityRadio) intensityRadio.checked = true;

  editModal.classList.add('active');
};

async function handleSaveEdit() {
  const token = editTokenInput.value;
  if (!token) return;

  let finalDuration = 30;
  if (editDurationSelect.value === 'custom') {
    finalDuration = parseInt(editCustomDurationInput.value, 10);
    if (!finalDuration || finalDuration <= 0) {
      alert('Please enter a valid number of seconds.');
      editCustomDurationInput.focus();
      return;
    }
  } else {
    finalDuration = parseInt(editDurationSelect.value, 10);
  }

  saveEditBtn.disabled = true;
  saveEditBtn.innerText = 'Saving...';

  try {
    const editIntensity = document.querySelector('input[name="editSpotlightIntensity"]:checked')?.value || 'small';
    const res = await fetch(`/api/images/${token}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        viewDuration: finalDuration,
        allowScreenshots: !editAllowScreenshotsToggle.checked,
        allowDownload: editAllowDownloadToggle.checked,
        spotlightMode: editSpotlightToggle.checked,
        spotlightIntensity: editIntensity,
        watermarkEnabled: editWatermarkToggle.checked
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update link');
    }

    editModal.classList.remove('active');
    loadUserLinks();
  } catch (e) {
    alert('Edit error: ' + e.message);
  } finally {
    saveEditBtn.disabled = false;
    saveEditBtn.innerText = 'Save & Update Link';
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
