# 🔒 DRM View-Once Vault

A confidential, view-once image sharing application with **Google Sign-In**, **client-side HTML5 Canvas DRM**, **anti-screenshot shields**, **dynamic forensic watermarking**, and **instant server-side shredding upon unlock**.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/Ryan-Gamin/drm-view-once)

---

## 🛡️ DRM & Anti-Screenshot Protections

Standard web images (`<img src="...">`) allow right-clicking, copying, dragging to desktop, and inspecting network requests. **DRM View-Once Vault** defeats this through multi-layered browser defense mechanisms:

1. **Atomic Burn-on-Read (True Single-View)**
   - Uploaded images are encrypted on the server with AES-256-GCM.
   - When the recipient opens the link and clicks **Unlock**, the server decrypts the image payload in memory and **instantly shreds the file/blob from disk and database**.
   - Any refresh, second request, or link replay receives a strict `410 Gone / Ephemeral Purged` response.
2. **Pure HTML5 Canvas Rendering (Zero DOM Images)**
   - The image is never injected as an `<img>` tag or exposed via a static asset URL.
   - Slices are painted directly onto an offscreen and display `<canvas>`, with memory cleared immediately once the viewing session expires.
3. **Active Window Defocus / Snipping Tool Shield**
   - Whenever the window loses focus (`blur`, `visibilitychange`, or overlay activation from Windows Snipping Tool `Win+Shift+S`, macOS `Cmd+Shift+4`, ShareX, or Greenshot), the canvas is instantly erased to pure black and an opaque fullscreen security alert obscures the viewport.
4. **Key Combination Interception**
   - Intercepts `PrintScreen`, `Meta+Shift+S`, `Ctrl+P` (Print), `Ctrl+S` (Save), `Ctrl+C` (Copy), and DevTools hotkeys (`F12`, `Ctrl+Shift+I`).
   - Wipes the system clipboard immediately to prevent clipboard paste leaks.
5. **Interactive Hold-to-Reveal / Spotlight Lens Mode**
   - Optional uploader setting: hides the whole image behind an opaque darkness veil. The recipient must press and hold down the mouse or touch screen to reveal only the area under the moving circular lens.
   - Makes taking an external smartphone camera photo of the entire image impossible in a single shot.
6. **Dynamic Moving Forensic Watermark**
   - An animated canvas overlay renders the recipient's live IP address, UTC timestamp down to the second, and unique session token diagonally across the image. Any physical camera photo carries an indisputable forensic identity trail.
7. **Anti-Print & DevTools Detection**
   - Strict CSS `@media print { * { display: none !important; } }`.
   - Continuous window dimension and debugger timing checks that trigger immediate self-destruct if browser developer tools are opened.

---

## 🚀 One-Click Deploy to Netlify

Click the button below to fork and deploy directly to Netlify:

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/Ryan-Gamin/drm-view-once)

### Environment Variables on Netlify (Optional)
In your Netlify Site Settings > **Environment variables**:
- `GOOGLE_CLIENT_ID`: Your Google OAuth 2.0 Web Client ID from Google Cloud Console.
- `JWT_SECRET`: Random 32-byte secret string for signed session cookies.
- `ENCRYPTION_SECRET`: AES-256-GCM master encryption key.

*(Note: The app also includes a built-in 1-Click Demo Google User account so you can test the entire upload, QR code, and DRM flow right away without configuring Google Cloud first!)*

---

## 🔑 Setting Up Google Sign-In (OAuth 2.0)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and navigate to **APIs & Services > OAuth consent screen**.
3. Set user type to **External** and enter your App Name and Support Email.
4. Go to **Credentials > Create Credentials > OAuth client ID**.
5. Select **Web application**.
6. Add your site's domains to **Authorized JavaScript origins**:
   - `http://localhost:8000` (for local development)
   - `https://<your-site>.netlify.app`
7. Copy the generated **Client ID** and add it to your environment as `GOOGLE_CLIENT_ID`.

---

## 💻 Local Development

```bash
# Clone the repository
git clone https://github.com/Ryan-Gamin/drm-view-once.git
cd drm-view-once

# Install dependencies
npm install

# Run the local server
npm start
# Server starts at http://localhost:8000

# Run automated end-to-end integration tests
node test_e2e.js
```

---

## 📁 Repository Structure

```
drm-view-once/
├── netlify.toml               # Netlify build, routing, redirects & headers
├── netlify/
│   └── functions/
│       ├── auth.js            # Google OAuth token verification & demo session
│       ├── upload.js          # Encrypted upload & view-once token generator
│       ├── view.js            # Atomic unlock, decryption & single-view shredding
│       ├── images.js          # User dashboard link management & revocation
│       ├── crypto.js          # AES-256-GCM symmetric encryption
│       └── storage.js         # Ephemeral store (Netlify Blobs + local fallback)
├── public/
│   ├── index.html             # Upload dashboard UI
│   ├── viewer.html            # Secure view-once Canvas DRM player
│   ├── css/
│   │   └── style.css          # Cyberpunk stealth styling & print shields
│   └── js/
│       ├── app.js             # Uploader & Google Identity client
│       ├── viewer.js          # Anti-screenshot canvas DRM engine
│       └── qrcode.min.js      # Self-contained QR code generator
├── server.js                  # Local Express server adapting Netlify functions
├── test_e2e.js                # Integration test suite
└── package.json
```

---

## ⚖️ License
MIT License. Created by [Ryan-Gamin](https://github.com/Ryan-Gamin).
