# 🔒 DRM View-Once Vault

A confidential, view-once image sharing application with **Username-Only Sending**, **Client-Side HTML5 Canvas DRM**, **Anti-Screenshot Defocus Shields**, **Dynamic Forensic Watermarking**, **Instant Server-Side Shredding Upon Unlock**, and **Auto-Redirection to Google After Viewing**.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Ryan-Gamin/drm-view-once)

---

## ⚡ How It Works

1. **Pick a Username & Send**:
   - No passwords or third-party sign-in required. Enter any chosen username (e.g. `@Ryan`) and select an image to generate an ephemeral encrypted link.
2. **True Single-View Burn-on-Read**:
   - The encrypted image is permanently shredded from server storage the instant it is unlocked into memory.
3. **Automatic Google Redirection on Viewed Links**:
   - If someone tries to reload, refresh, revisit, or reopen a burned/expired link, they are **immediately redirected to Google (`https://www.google.com`)**.
4. **Flexible Expiration & Permissions**:
   - Duration options: `∞ Infinity` (until closed), `1h`, `45m`, `30m`, `15m`, `10m`, `5m`, `3m`, `60s`, `30s`, `15s`, `10s`, `5s`.
   - Creator can allow or disallow screenshots (strict defocus blackout shield).
   - Creator can enable a native "Download Image" button for the viewer or disallow downloads entirely.
5. **Anti-Screenshot & Canvas Protections**:
   - Slices are rendered on an HTML5 `<canvas>` (no `<img>` tag exists in the DOM).
   - Defocus shield blanks out the canvas instantly whenever window focus is lost (Snipping Tool `Win+Shift+S`, Mac screen grab, external apps).
   - Key combinations (`PrintScreen`, `Meta+Shift+S`, `Ctrl+P`, `Ctrl+S`, `Ctrl+C`, DevTools keys) are blocked and system clipboard is wiped.
   - Dynamic moving forensic watermark bakes the sender's username, recipient's IP, and live UTC timestamp across the canvas.
   - Optional **Spotlight Lens Mode** requires the recipient to press and hold down their cursor/touch to reveal only the area under the moving lens.

---

## ⚠️ Important Security Boundary Note: School / Enterprise Monitoring Software

Software like **Smoothwall, GoGuardian, Securly, or LanSchool** operates at the **operating system and network proxy levels**, completely outside the browser's JavaScript sandbox:

- **OS / Background Agent Capture**: If a school-issued device has a managed extension or desktop agent installed, it captures raw screen framebuffer / desktop output at the OS level. No website in a standard browser can block a root administrative OS process or enterprise extension from capturing the screen.
- **SSL / TLS Inspection**: School firewalls that install custom root certificates (CA) on school devices can perform man-in-the-middle decryption of HTTPS web traffic.
- **Verdict**: In-browser DRM and view-once mechanics successfully protect against normal recipients taking screenshots, copying URLs, or viewing twice on personal devices. However, **never transmit sensitive data on a school-owned device or school network**, as administrative monitoring tools have full kernel/OS-level visibility.

---

## 🚀 One-Click Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Ryan-Gamin/drm-view-once)

---

## 💻 Local Run & Testing

```bash
# Clone
git clone https://github.com/Ryan-Gamin/drm-view-once.git
cd drm-view-once

# Install dependencies
npm install

# Start local server
npm start
# Visit http://localhost:8000

# Run automated tests
node test_e2e.js
```

---

## ⚖️ License
MIT License. Created by [Ryan-Gamin](https://github.com/Ryan-Gamin).
