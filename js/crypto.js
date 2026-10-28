/**
 * Vault Cryptography Module
 * Uses Web Crypto API (SubtleCrypto)
 * - Key derivation: PBKDF2 with SHA-256 (600,000 iterations)
 * - Encryption: AES-256-GCM with fresh 12-byte IV per encryption
 */

const PBKDF2_ITERATIONS = 600000;

// Base64 helper utilities
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives an AES-GCM 256-bit key from a plaintext master password and a salt.
 */
export async function deriveKey(masterPassword, saltBuffer) {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts arbitrary JS data (usually an array of entry objects).
 * Returns a self-contained JSON-friendly object with salt, iv, and ciphertext.
 */
export async function encryptVault(data, masterPassword) {
  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(JSON.stringify(data));

  // Fresh 16-byte salt and 12-byte IV for every encryption
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(masterPassword, salt);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );

  return {
    version: 1,
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertextBuffer),
  };
}

/**
 * Decrypts a vault package using the master password.
 * Throws an error if the password is wrong or ciphertext is tampered.
 */
export async function decryptVault(encryptedPackage, masterPassword) {
  if (!encryptedPackage || !encryptedPackage.salt || !encryptedPackage.iv || !encryptedPackage.ciphertext) {
    throw new Error('Invalid vault package format.');
  }

  const saltBuffer = base64ToBuffer(encryptedPackage.salt);
  const ivBuffer = base64ToBuffer(encryptedPackage.iv);
  const ciphertextBuffer = base64ToBuffer(encryptedPackage.ciphertext);

  const key = await deriveKey(masterPassword, saltBuffer);

  const decryptedBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    key,
    ciphertextBuffer
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decryptedBytes));
}
