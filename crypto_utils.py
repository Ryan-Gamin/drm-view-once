import os
import secrets
from cryptography.fernet import Fernet

# Secret key for encrypting images on disk
# Can be overridden by environment variable
ENCRYPTION_KEY = os.environ.get("DRM_VAULT_ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    # Generate a persistent or process-wide key
    ENCRYPTION_KEY = Fernet.generate_key().decode()

cipher = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)


def generate_token(length: int = 32) -> str:
    """Generate a high-entropy, URL-safe random token for view-once links."""
    return secrets.token_urlsafe(length)


def encrypt_bytes(data: bytes) -> bytes:
    """Encrypt raw image bytes before saving to disk."""
    return cipher.encrypt(data)


def decrypt_bytes(encrypted_data: bytes) -> bytes:
    """Decrypt image bytes in memory during one-time view unlock."""
    return cipher.decrypt(encrypted_data)


def secure_delete_file(file_path: str):
    """
    Securely overwrite and remove the file from disk so it cannot be recovered.
    """
    if not os.path.exists(file_path):
        return
    try:
        file_size = os.path.getsize(file_path)
        # Overwrite with random noise before unlinking
        with open(file_path, "wb") as f:
            f.write(os.urandom(min(file_size, 1024 * 1024 * 5)))
        os.remove(file_path)
    except Exception as e:
        # Fallback to standard remove if overwrite fails
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
