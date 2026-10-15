import os
import secrets
import base64
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, Request, Response, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

import database as db
import crypto_utils as crypto

# Initialize DB
db.init_db()

# Directory configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "css"), exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "js"), exist_ok=True)
os.makedirs(TEMPLATE_DIR, exist_ok=True)

# Configuration & Secrets
SESSION_SECRET = os.environ.get("SESSION_SECRET", secrets.token_hex(32))
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
session_serializer = URLSafeTimedSerializer(SESSION_SECRET)

app = FastAPI(title="DRM View-Once Vault", description="Secure, view-once image sharing with anti-screenshot DRM protection")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATE_DIR)


# Helper: Get current user from signed cookie
def get_current_user(request: Request) -> Optional[dict]:
    session_cookie = request.cookies.get("session_token")
    if not session_cookie:
        return None
    try:
        data = session_serializer.loads(session_cookie, max_age=86400 * 7) # 7 days
        user_id = data.get("user_id")
        if not user_id:
            return None
        return db.get_user_by_id(user_id)
    except (BadSignature, SignatureExpired):
        return None


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


# --- AUTH ENDPOINTS ---

@app.get("/api/auth/config")
async def get_auth_config():
    return {
        "google_client_id": GOOGLE_CLIENT_ID,
        "demo_mode_available": True
    }


@app.get("/api/auth/me")
async def get_auth_me(request: Request):
    user = get_current_user(request)
    if not user:
        return {"authenticated": False, "user": None}
    return {
        "authenticated": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "picture": user["picture"]
        }
    }


@app.post("/api/auth/google")
async def auth_google(request: Request, response: Response):
    """
    Verify Google ID Token from Google Identity Services.
    """
    body = await request.json()
    credential = body.get("credential")
    if not credential:
        raise HTTPException(status_code=400, detail="Missing credential token")

    # Verify ID token with Google's public tokeninfo endpoint
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": credential},
                timeout=10.0
            )
            if res.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid Google token")
            token_data = res.json()
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Failed to verify Google token: {str(e)}")

    google_id = token_data.get("sub")
    email = token_data.get("email")
    name = token_data.get("name", email.split("@")[0] if email else "User")
    picture = token_data.get("picture", "")

    if not google_id or not email:
        raise HTTPException(status_code=400, detail="Malformed token payload from Google")

    # If GOOGLE_CLIENT_ID is configured, verify aud match
    if GOOGLE_CLIENT_ID and token_data.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Google Client ID mismatch")

    user = db.get_or_create_user(google_id, email, name, picture)
    token = session_serializer.dumps({"user_id": user["id"]})

    # Set secure HTTP-only cookie
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=86400 * 7
    )
    return {"success": True, "user": user}


@app.post("/api/auth/demo")
async def auth_demo(response: Response):
    """
    Quick 1-Click Demo Login so testing is effortless without waiting to configure Google Cloud.
    """
    demo_google_id = "demo_google_account_998877"
    demo_email = "ryan.demo@secure-vault.io"
    demo_name = "Ryan (Demo Google User)"
    demo_picture = "https://api.dicebear.com/7.x/bottts/svg?seed=ryan_secure"

    user = db.get_or_create_user(demo_google_id, demo_email, demo_name, demo_picture)
    token = session_serializer.dumps({"user_id": user["id"]})

    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=86400 * 7
    )
    return {"success": True, "user": user}


@app.post("/api/auth/logout")
async def auth_logout(response: Response):
    response.delete_cookie("session_token")
    return {"success": True}


# --- UPLOAD & MANAGEMENT ENDPOINTS ---

@app.post("/api/upload")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    view_duration: int = Form(30),
    spotlight_mode: bool = Form(False),
    watermark_enabled: bool = Form(True),
    anti_screenshot_level: str = Form("strict")
):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in with Google.")

    # Validate mime type
    valid_mimes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    content_type = file.content_type or ""
    if content_type.lower() not in valid_mimes:
        raise HTTPException(status_code=400, detail="Only image files (PNG, JPG, WEBP, GIF) are supported.")

    raw_bytes = await file.read()
    if len(raw_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Maximum image size is 25MB.")

    token = crypto.generate_token(32)
    encrypted_bytes = crypto.encrypt_bytes(raw_bytes)
    stored_filename = f"{token}.enc"
    stored_path = os.path.join(UPLOAD_DIR, stored_filename)

    with open(stored_path, "wb") as f:
        f.write(encrypted_bytes)

    image_record = db.create_image(
        token=token,
        user_id=user["id"],
        original_filename=file.filename or "image.png",
        stored_path=stored_path,
        mime_type=content_type,
        filesize=len(raw_bytes),
        view_duration_seconds=view_duration,
        spotlight_mode=spotlight_mode,
        watermark_enabled=watermark_enabled,
        anti_screenshot_level=anti_screenshot_level
    )

    base_url = str(request.base_url).rstrip("/")
    share_url = f"{base_url}/v/{token}"

    return {
        "success": True,
        "token": token,
        "share_url": share_url,
        "original_filename": image_record["original_filename"],
        "view_duration_seconds": image_record["view_duration_seconds"],
        "created_at": image_record["created_at"],
        "expires_at": image_record["expires_at"]
    }


@app.get("/api/images")
async def list_user_images(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    images = db.list_user_images(user["id"])
    return {"images": images}


@app.delete("/api/images/{image_id}")
async def delete_image(request: Request, image_id: int):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    stored_path = db.delete_user_image(image_id, user["id"])
    if stored_path:
        crypto.secure_delete_file(stored_path)
    return {"success": True}


# --- SECURE VIEW-ONCE VAULT ENDPOINTS ---

@app.get("/v/{token}", response_class=HTMLResponse)
async def view_page(request: Request, token: str):
    """
    Renders the secure viewer page.
    """
    image_record = db.get_image_by_token(token)
    if not image_record:
        return templates.TemplateResponse("viewer.html", {
            "request": request,
            "token": token,
            "status": "not_found",
            "message": "This link does not exist or has already been shredded."
        }, status_code=404)

    if image_record["is_burned"] or image_record["is_viewed"]:
        return templates.TemplateResponse("viewer.html", {
            "request": request,
            "token": token,
            "status": "burned",
            "burned_at": image_record["burned_at"] or image_record["viewed_at"],
            "reason": image_record["burn_reason"] or "This one-time image has already been viewed and permanently purged from server memory."
        }, status_code=410)

    # Check expiration
    if image_record["expires_at"]:
        expires_dt = datetime.fromisoformat(image_record["expires_at"])
        if datetime.now(timezone.utc) > expires_dt:
            # Burn it
            path = db.burn_image(token, reason="expired_before_view")
            if path:
                crypto.secure_delete_file(path)
            return templates.TemplateResponse("viewer.html", {
                "request": request,
                "token": token,
                "status": "expired",
                "message": "This one-time link has expired."
            }, status_code=410)

    return templates.TemplateResponse("viewer.html", {
        "request": request,
        "token": token,
        "status": "ready",
        "duration": image_record["view_duration_seconds"],
        "spotlight": bool(image_record["spotlight_mode"]),
        "watermark": bool(image_record["watermark_enabled"]),
        "anti_screenshot": image_record["anti_screenshot_level"]
    })


@app.get("/api/view/{token}/status")
async def view_status(request: Request, token: str):
    image_record = db.get_image_by_token(token)
    if not image_record:
        return JSONResponse({"status": "not_found"}, status_code=404)
    if image_record["is_burned"] or image_record["is_viewed"]:
        return JSONResponse({"status": "burned", "burned_at": image_record["burned_at"]}, status_code=410)
    
    return {
        "status": "ready",
        "duration": image_record["view_duration_seconds"],
        "spotlight": bool(image_record["spotlight_mode"]),
        "watermark": bool(image_record["watermark_enabled"]),
        "anti_screenshot": image_record["anti_screenshot_level"]
    }


@app.post("/api/view/{token}/unlock")
async def unlock_view(request: Request, token: str):
    """
    ATOMIC ONE-TIME UNLOCK:
    - Verifies token is valid and unviewed.
    - Marks is_viewed = 1 and records viewer IP.
    - Decrypts image bytes in memory.
    - IMMEDIATELY shreds and removes the encrypted file from disk!
    - Marks is_burned = 1.
    - Returns image payload with strict anti-cache headers.
    """
    image_record = db.get_image_by_token(token)
    if not image_record:
        raise HTTPException(status_code=404, detail="One-time link not found")

    if image_record["is_burned"] or image_record["is_viewed"]:
        raise HTTPException(
            status_code=410,
            detail="This view-once image has already been viewed and permanently destroyed."
        )

    viewer_ip = get_client_ip(request)

    # Mark viewed atomically
    marked = db.mark_image_viewed(token, viewer_ip)
    if not marked:
        raise HTTPException(status_code=410, detail="Concurrent access detected; link already consumed.")

    stored_path = image_record["stored_path"]
    if not os.path.exists(stored_path):
        raise HTTPException(status_code=404, detail="Image file no longer exists.")

    try:
        with open(stored_path, "rb") as f:
            encrypted_data = f.read()
        decrypted_bytes = crypto.decrypt_bytes(encrypted_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to decrypt secure image payload.")
    finally:
        # ATOMIC SHRED: Immediately destroy the file from server disk!
        crypto.secure_delete_file(stored_path)
        db.burn_image(token, reason="view_unlocked_and_shredded")

    b64_payload = base64.b64encode(decrypted_bytes).decode("ascii")

    response_headers = {
        "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Content-Type-Options": "nosniff",
        "X-DRM-Shield": "active-anti-screenshot",
    }

    return JSONResponse(
        content={
            "success": True,
            "data": f"data:{image_record['mime_type']};base64,{b64_payload}",
            "mime_type": image_record["mime_type"],
            "view_duration_seconds": image_record["view_duration_seconds"],
            "spotlight_mode": bool(image_record["spotlight_mode"]),
            "watermark_enabled": bool(image_record["watermark_enabled"]),
            "anti_screenshot_level": image_record["anti_screenshot_level"],
            "viewer_ip": viewer_ip,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        },
        headers=response_headers
    )


@app.post("/api/view/{token}/burn")
async def burn_token_early(request: Request, token: str):
    """
    Called by client when timer runs out, tab is closed, or security violation occurs.
    """
    body = await request.json() if request.headers.get("content-type") == "application/json" else {}
    reason = body.get("reason", "client_burn_signal")
    stored_path = db.burn_image(token, reason=reason)
    if stored_path:
        crypto.secure_delete_file(stored_path)
    return {"success": True, "burned": True}


# --- DASHBOARD PAGE ---

@app.get("/", response_class=HTMLResponse)
async def index_page(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse("index.html", {
        "request": request,
        "user": user,
        "google_client_id": GOOGLE_CLIENT_ID
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
