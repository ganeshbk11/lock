# Vault: Plan

A personal, zero-knowledge password manager. You type a master password, your browser encrypts the data client-side, and the encrypted data is stored directly in a private GitHub repository called `vault`.

## 1. What it does

- Save an entry: application name, user id, email, password, notes/URL
- View, search, edit, delete entries
- Light, clean, responsive UI
- Everything is encrypted in the browser before leaving memory (Zero-Knowledge)
- Direct browser-to-GitHub sync (no backend server needed)

## 2. Architecture Flow

```
Browser (Vanilla JS + Web Crypto API)                 GitHub API (api.github.com)
-------------------------------------                 ---------------------------
1. Type Master Password & GitHub PAT
2. Derive strong key (PBKDF2)
3. Encrypt entire vault (AES-256-GCM)   --- HTTPS --->  Stores single encrypted blob
                                                        `vault.enc.json` in private repo
```

- **Read**: Fetch `vault.enc.json` directly from GitHub $\rightarrow$ Decrypt in browser with master password.
- **Write**: Encrypt updated list $\rightarrow$ Commit `vault.enc.json` directly to GitHub using your Fine-Grained PAT.
- **Rule**: GitHub only ever sees scrambled ciphertext. Plain passwords and master password never leave browser memory.

## 3. The Two Secrets

| Secret | Purpose | Where it lives |
|---|---|---|
| **Master Password** | Derives key to lock/unlock your data | In your head only. Never transmitted, never stored anywhere. |
| **GitHub PAT** | Authorizes reading/writing the private `vault` repo | Typed at unlock, kept in browser session memory only. Scoped strictly to `vault` repo. |

> [!NOTE]
> If you forget your master password, your data cannot be recovered.

## 4. Cryptography Architecture

- **Key Derivation**: PBKDF2 with SHA-256 (600,000 iterations) + random 16-byte salt to derive a 256-bit AES key.
- **Encryption**: AES-256-GCM with a fresh random 12-byte initialization vector (IV/nonce) on every single save.
- **Standard**: Built-in browser `crypto.subtle` (Web Crypto API) — fast, hardware-accelerated, zero external crypto dependencies.

## 5. Storage Layout & Smart Merge

- **Target File**: `vault.enc.json` in root of private `vault` repo.
- **File Structure**:
  ```json
  {
    "version": 1,
    "salt": "<base64-salt>",
    "iv": "<base64-iv>",
    "ciphertext": "<base64-ciphertext>"
  }
  ```
- **Decrypted Payload**:
  ```json
  [
    {
      "id": "uuid-v4",
      "app": "GitHub",
      "username": "user1",
      "email": "user@example.com",
      "password": "secretPassword!",
      "updatedAt": 1700000000000
    }
  ]
  ```
- **Smart Merge (Conflict Resolution)**:
  - GitHub requires the latest commit `sha` to update a file.
  - If a save receives `409 Conflict` (meaning another device saved in the meantime):
    1. Fetch the latest `vault.enc.json` and its `sha` from GitHub.
    2. Decrypt the incoming remote entries.
    3. Merge local changes with remote entries (keyed by `id`, latest `updatedAt` wins).
    4. Re-encrypt and push back with the new `sha`.

## 6. Tech Stack

- **Frontend**: Vanilla HTML5, Modern CSS, Vanilla JavaScript (ES modules).
- **Backend**: None (pure client-side static application).
- **Hosting Options**: GitHub Pages, Cloudflare Pages, or run locally via any local static server / `index.html`.
- **API**: GitHub REST API (`https://api.github.com/repos/{owner}/vault/contents/vault.enc.json`).

## 7. Build Phases

### Phase 1: Core Engine Proof-of-Concept
- In-browser crypto helper: `deriveKey()`, `encryptVault()`, `decryptVault()`.
- Direct GitHub API client: `getVaultFile(pat, repo)`, `saveVaultFile(pat, repo, content, sha)`.
- *Done when*: Test script can derive key, encrypt text, save to GitHub, fetch it back, and decrypt it.

### Phase 2: State Management & Smart Merge
- Implement in-memory vault store (list of entries).
- Add entry, update entry, delete entry.
- Implement automated 409 Conflict retry & merge logic.
- *Done when*: Simulated concurrent edits merge cleanly without data loss.

### Phase 3: Minimal User Interface
- Unlock / Setup view: Input master password, GitHub username/repo, and PAT.
- Vault view: Clean list of entries, search/filter bar, "Add Entry" modal/form.
- Copy password to clipboard with auto-clear timeout.
- *Done when*: Full add, view, search, and copy flow works in browser.

### Phase 4: Polish & Security Hardening
- Auto-lock vault on user inactivity (e.g. 5 or 15 minutes timer).
- Password generator with customizable length/symbols.
- Import/Export backup feature (JSON).
- Responsive mobile & desktop CSS styling.

## 8. Security Checklist

- [ ] Repository is private.
- [ ] GitHub PAT is Fine-Grained with strictly `Contents: Read and Write` scoped only to `vault`.
- [ ] PAT and Master Password are kept in JavaScript memory only (never saved to `localStorage`).
- [ ] Fresh random IV generated on every save.
- [ ] Clipboard cleared automatically after 30 seconds.
- [ ] No external third-party scripts or CDNs (zero supply-chain risk).
