/**
 * Vault State Management & Smart Merge
 * Manages in-memory decrypted entries, CRUD operations, and conflict-free sync with GitHub.
 */

import { encryptVault, decryptVault } from './crypto.js';
import { fetchVaultFile, saveVaultFile } from './github.js';

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

/**
 * Merges two lists of vault entries using Last-Write-Wins (LWW) by `updatedAt`.
 * Handles created, edited, and deleted (tombstone) entries safely.
 */
export function mergeEntries(localEntries, remoteEntries) {
  const mergedMap = new Map();

  // Load all remote entries first
  for (const entry of remoteEntries) {
    if (entry && entry.id) {
      mergedMap.set(entry.id, entry);
    }
  }

  // Merge local entries
  for (const local of localEntries) {
    if (!local || !local.id) continue;
    const remote = mergedMap.get(local.id);

    if (!remote) {
      // Local has a new entry not yet present in remote
      mergedMap.set(local.id, local);
    } else {
      // Both have the entry: the one with the latest updatedAt timestamp wins
      const localTime = local.updatedAt || 0;
      const remoteTime = remote.updatedAt || 0;
      if (localTime >= remoteTime) {
        mergedMap.set(local.id, local);
      }
    }
  }

  return Array.from(mergedMap.values());
}

export class VaultStore {
  constructor() {
    this.entries = [];
    this.currentSha = null;
    this.masterPassword = null;
    this.config = null; // { owner, repo, pat }
    this.isLocked = true;
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch (err) {
        console.error('Listener error:', err);
      }
    }
  }

  getState() {
    // Only return non-deleted entries for UI consumption
    const activeEntries = this.entries.filter(e => !e.deleted);
    return {
      isLocked: this.isLocked,
      entries: activeEntries,
      hasSha: Boolean(this.currentSha),
    };
  }

  /**
   * Initializes session and unlocks or creates initial vault.
   */
  async unlock(owner, repo, pat, masterPassword) {
    this.config = { owner, repo, pat };
    this.masterPassword = masterPassword;

    // Fetch from GitHub
    const remote = await fetchVaultFile(owner, repo, pat);

    if (remote.exists && remote.data) {
      // Decrypt existing vault
      const decrypted = await decryptVault(remote.data, masterPassword);
      this.entries = Array.isArray(decrypted) ? decrypted : [];
      this.currentSha = remote.sha;
    } else {
      // Brand new vault repository
      this.entries = [];
      this.currentSha = null;
    }

    this.isLocked = false;
    this.notify();
    return this.getState();
  }

  lock() {
    this.entries = [];
    this.currentSha = null;
    this.masterPassword = null;
    this.config = null;
    this.isLocked = true;
    this.notify();
  }

  addEntry({ app, username = '', email = '', password = '', url = '', notes = '' }) {
    if (this.isLocked) throw new Error('Vault is locked');
    const now = Date.now();
    const newEntry = {
      id: generateId(),
      app: app.trim(),
      username: username.trim(),
      email: email.trim(),
      password,
      url: url.trim(),
      notes: notes.trim(),
      deleted: false,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.push(newEntry);
    this.notify();
    return newEntry;
  }

  updateEntry(id, fields) {
    if (this.isLocked) throw new Error('Vault is locked');
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Entry not found');

    this.entries[idx] = {
      ...this.entries[idx],
      ...fields,
      id, // protect id
      updatedAt: Date.now(),
    };
    this.notify();
    return this.entries[idx];
  }

  deleteEntry(id) {
    if (this.isLocked) throw new Error('Vault is locked');
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx === -1) return false;

    // Mark as deleted tombstone so concurrent devices learn about the deletion
    this.entries[idx] = {
      ...this.entries[idx],
      deleted: true,
      updatedAt: Date.now(),
    };
    this.notify();
    return true;
  }

  /**
   * Encrypts and saves to GitHub with automatic 409 conflict detection and smart merge.
   * Retries up to maxRetries if remote changes occurred during write.
   */
  async sync(maxRetries = 3) {
    if (this.isLocked || !this.config || !this.masterPassword) {
      throw new Error('Cannot sync: Vault is locked.');
    }

    const { owner, repo, pat } = this.config;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 1. Encrypt current entries
        const encryptedPackage = await encryptVault(this.entries, this.masterPassword);

        // 2. Push to GitHub with current SHA
        const result = await saveVaultFile(
          owner,
          repo,
          pat,
          encryptedPackage,
          this.currentSha,
          'Sync vault update'
        );

        // Success! Update local SHA
        this.currentSha = result.newSha;
        this.notify();
        return { success: true, sha: this.currentSha, merged: attempt > 1 };

      } catch (err) {
        if (err.isConflict && attempt < maxRetries) {
          console.warn(`[Vault] 409 Conflict on attempt ${attempt}. Running Smart Merge...`);
          
          // Smart Merge Step A: Fetch latest remote blob and sha
          const remote = await fetchVaultFile(owner, repo, pat);
          if (!remote.exists) {
            throw new Error('Conflict error, but remote vault was not found.');
          }

          // Smart Merge Step B: Decrypt remote entries
          const remoteEntries = await decryptVault(remote.data, this.masterPassword);

          // Smart Merge Step C: Merge local entries with remote entries
          this.entries = mergeEntries(this.entries, remoteEntries);
          this.currentSha = remote.sha;

          // Attempt loop continues with merged entries and updated SHA
          continue;
        }

        // Other error or retries exhausted
        throw err;
      }
    }

    throw new Error('Sync failed: maximum conflict retries exceeded.');
  }
}
