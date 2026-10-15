import sqlite3
import os
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

DB_PATH = os.environ.get("DRM_VAULT_DB", "vault.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table (Google authenticated accounts + demo mode)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id TEXT UNIQUE,
        email TEXT NOT NULL,
        name TEXT,
        picture TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # Ephemeral images table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        original_filename TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        filesize INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        view_duration_seconds INTEGER DEFAULT 30,
        spotlight_mode INTEGER DEFAULT 0,
        watermark_enabled INTEGER DEFAULT 1,
        anti_screenshot_level TEXT DEFAULT 'strict',
        is_viewed INTEGER DEFAULT 0,
        viewed_at TEXT,
        viewer_ip TEXT,
        is_burned INTEGER DEFAULT 0,
        burned_at TEXT,
        burn_reason TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_images_token ON images (token);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_images_user_id ON images (user_id);")

    conn.commit()
    conn.close()


def get_or_create_user(google_id: str, email: str, name: str = "", picture: str = "") -> Dict[str, Any]:
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE google_id = ?", (google_id,))
    row = cursor.fetchone()
    
    now = datetime.now(timezone.utc).isoformat()
    if row:
        cursor.execute(
            "UPDATE users SET email = ?, name = ?, picture = ? WHERE google_id = ?",
            (email, name, picture, google_id)
        )
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE google_id = ?", (google_id,))
        user = dict(cursor.fetchone())
    else:
        cursor.execute(
            "INSERT INTO users (google_id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?)",
            (google_id, email, name, picture, now)
        )
        conn.commit()
        user_id = cursor.lastrowid
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = dict(cursor.fetchone())
        
    conn.close()
    return user


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_image(
    token: str,
    user_id: int,
    original_filename: str,
    stored_path: str,
    mime_type: str,
    filesize: int,
    view_duration_seconds: int = 30,
    spotlight_mode: bool = False,
    watermark_enabled: bool = True,
    anti_screenshot_level: str = "strict",
    expires_in_hours: int = 24
) -> Dict[str, Any]:
    conn = get_db()
    cursor = conn.cursor()
    
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    expires_at = (now_dt + timedelta(hours=expires_in_hours)).isoformat()
    
    cursor.execute("""
    INSERT INTO images (
        token, user_id, original_filename, stored_path, mime_type, filesize,
        created_at, expires_at, view_duration_seconds, spotlight_mode,
        watermark_enabled, anti_screenshot_level, is_viewed, is_burned
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    """, (
        token, user_id, original_filename, stored_path, mime_type, filesize,
        now, expires_at, view_duration_seconds, 1 if spotlight_mode else 0,
        1 if watermark_enabled else 0, anti_screenshot_level
    ))
    
    conn.commit()
    cursor.execute("SELECT * FROM images WHERE token = ?", (token,))
    image = dict(cursor.fetchone())
    conn.close()
    return image


def get_image_by_token(token: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM images WHERE token = ?", (token,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def mark_image_viewed(token: str, viewer_ip: str) -> bool:
    """Mark an image as currently unlocked and being viewed."""
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    
    cursor.execute("""
    UPDATE images 
    SET is_viewed = 1, viewed_at = ?, viewer_ip = ?
    WHERE token = ? AND is_burned = 0 AND is_viewed = 0
    """, (now, viewer_ip, token))
    
    affected = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return affected


def burn_image(token: str, reason: str = "view_completed") -> Optional[str]:
    """
    Permanently mark image burned in DB and return the stored_path so it can be erased.
    """
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    
    cursor.execute("SELECT stored_path, is_burned FROM images WHERE token = ?", (token,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
        
    stored_path = row["stored_path"]
    
    cursor.execute("""
    UPDATE images 
    SET is_burned = 1, burned_at = ?, burn_reason = ?
    WHERE token = ?
    """, (now, reason, token))
    
    conn.commit()
    conn.close()
    return stored_path


def list_user_images(user_id: int) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, token, original_filename, mime_type, filesize, created_at,
           expires_at, view_duration_seconds, spotlight_mode, watermark_enabled,
           anti_screenshot_level, is_viewed, viewed_at, viewer_ip, is_burned, burned_at, burn_reason
    FROM images 
    WHERE user_id = ?
    ORDER BY id DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_user_image(image_id: int, user_id: int) -> Optional[str]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT stored_path FROM images WHERE id = ? AND user_id = ?", (image_id, user_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
        
    stored_path = row["stored_path"]
    cursor.execute("DELETE FROM images WHERE id = ? AND user_id = ?", (image_id, user_id))
    conn.commit()
    conn.close()
    return stored_path
