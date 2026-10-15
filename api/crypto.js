const crypto = require('crypto');

const SECRET = process.env.ENCRYPTION_SECRET || 'drm-view-once-secure-vault-encryption-secret-key';
const KEY = crypto.createHash('sha256').update(SECRET).digest();

function generateToken(length = 24) {
  return crypto.randomBytes(length).toString('base64url');
}

function encrypt(buffer) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

function decrypt(encryptedBase64, ivHex, authTagHex) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    KEY,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final()
  ]);
  return decrypted;
}

module.exports = {
  generateToken,
  encrypt,
  decrypt
};
