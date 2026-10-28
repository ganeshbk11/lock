/**
 * Vault Application Controller
 * Manages UI transitions, event listeners, clipboard auto-clearing, and synchronization.
 */

import { VaultStore } from './store.js';

const store = new VaultStore();
let clipboardTimeout = null;
let inactivityTimer = null;
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// DOM Elements
const viewUnlock = document.getElementById('view-unlock');
const viewDashboard = document.getElementById('view-dashboard');
const formUnlock = document.getElementById('form-unlock');
const unlockAlert = document.getElementById('unlock-alert');
const btnUnlockSubmit = document.getElementById('btn-unlock-submit');

const ghOwnerInput = document.getElementById('gh-owner');
const ghRepoInput = document.getElementById('gh-repo');
const ghPatInput = document.getElementById('gh-pat');
const masterPwdInput = document.getElementById('master-pwd');

const btnLock = document.getElementById('btn-lock');
const btnOpenAdd = document.getElementById('btn-open-add');
const searchInput = document.getElementById('search-input');
const entriesContainer = document.getElementById('entries-container');
const syncStatus = document.getElementById('sync-status');
const syncText = document.getElementById('sync-text');

// Modal Elements
const modalEntry = document.getElementById('modal-entry');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const btnCancelEntry = document.getElementById('btn-cancel-entry');
const formEntry = document.getElementById('form-entry');
const entryIdInput = document.getElementById('entry-id');
const entryAppInput = document.getElementById('entry-app');
const entryUserInput = document.getElementById('entry-user');
const entryEmailInput = document.getElementById('entry-email');
const entryPwdInput = document.getElementById('entry-pwd');
const entryUrlInput = document.getElementById('entry-url');
const entryNotesInput = document.getElementById('entry-notes');
const btnGeneratePwd = document.getElementById('btn-generate-pwd');
const btnSaveEntry = document.getElementById('btn-save-entry');

// Toast Element
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

/* ---------------- Helper Utilities ---------------- */

function showToast(message, duration = 3000) {
  toastMessage.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function setSyncState(isSyncing, message = 'Synced') {
  const dot = syncStatus.querySelector('.sync-dot');
  if (isSyncing) {
    dot.classList.add('syncing');
    syncText.textContent = 'Syncing...';
  } else {
    dot.classList.remove('syncing');
    syncText.textContent = message;
  }
}

function generateSecurePassword(length = 16) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (!store.getState().isLocked) {
    inactivityTimer = setTimeout(() => {
      lockVault('Vault auto-locked due to inactivity.');
    }, INACTIVITY_TIMEOUT_MS);
  }
}

/* ---------------- UI Renderers ---------------- */

function renderEntries(searchTerm = '') {
  const { entries } = store.getState();
  const term = searchTerm.toLowerCase().trim();

  const filtered = entries.filter(e => {
    if (!term) return true;
    return (
      (e.app && e.app.toLowerCase().includes(term)) ||
      (e.username && e.username.toLowerCase().includes(term)) ||
      (e.email && e.email.toLowerCase().includes(term))
    );
  });

  if (entries.length === 0) {
    entriesContainer.innerHTML = `
      <div class="empty-state">
        <h3>Your Vault is empty</h3>
        <p>No passwords stored yet. Click "New Entry" above to add your first encrypted record.</p>
        <button class="btn btn-primary" id="btn-empty-add">+ Add First Password</button>
      </div>
    `;
    const emptyAddBtn = document.getElementById('btn-empty-add');
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', () => openModal());
    return;
  }

  if (filtered.length === 0) {
    entriesContainer.innerHTML = `
      <div class="empty-state">
        <h3>No matching passwords found</h3>
        <p>Try searching for a different application name, username, or email.</p>
      </div>
    `;
    return;
  }

  // Render Grid
  let html = '<div class="entries-grid">';
  for (const entry of filtered) {
    const initial = (entry.app && entry.app[0]) ? entry.app[0].toUpperCase() : 'V';
    const subtitle = entry.username || entry.email || 'No username';

    html += `
      <div class="entry-card" data-id="${entry.id}">
        <div>
          <div class="entry-top">
            <div class="entry-avatar">${escapeHtml(initial)}</div>
            <div class="entry-title-wrap">
              <div class="entry-app" title="${escapeHtml(entry.app)}">${escapeHtml(entry.app)}</div>
              <div class="entry-user" title="${escapeHtml(subtitle)}">${escapeHtml(subtitle)}</div>
            </div>
          </div>

          <div class="entry-password-row">
            <span class="entry-password-val" data-password="${escapeHtml(entry.password)}">••••••••••••</span>
            <div style="display:flex; gap:4px;">
              <button type="button" class="icon-btn btn-reveal" title="Show / Hide Password">👁️</button>
              <button type="button" class="icon-btn btn-copy" title="Copy to clipboard">📋</button>
            </div>
          </div>

          ${entry.url ? `<p style="font-size:0.8rem; margin-bottom:8px;"><a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener" style="color:var(--primary); text-decoration:none;">🔗 ${escapeHtml(entry.url.replace(/^https?:\/\//, ''))}</a></p>` : ''}
          ${entry.notes ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; white-space:pre-wrap;">📝 ${escapeHtml(entry.notes)}</p>` : ''}
        </div>

        <div class="entry-card-actions">
          <div class="entry-card-actions-left">
            <button class="icon-btn btn-edit" title="Edit entry">✏️ Edit</button>
            <button class="icon-btn btn-delete" style="color:var(--danger);" title="Delete entry">🗑️</button>
          </div>
          <span style="font-size:0.75rem; color:var(--text-light);">${formatDate(entry.updatedAt)}</span>
        </div>
      </div>
    `;
  }
  html += '</div>';
  entriesContainer.innerHTML = html;

  attachEntryCardEvents();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function attachEntryCardEvents() {
  // Toggle reveal
  document.querySelectorAll('.btn-reveal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.entry-card');
      const valSpan = card.querySelector('.entry-password-val');
      const actualPwd = valSpan.getAttribute('data-password');
      if (valSpan.textContent === '••••••••••••') {
        valSpan.textContent = actualPwd;
        e.target.textContent = '🔒';
      } else {
        valSpan.textContent = '••••••••••••';
        e.target.textContent = '👁️';
      }
    });
  });

  // Copy password with auto-clear
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('.entry-card');
      const valSpan = card.querySelector('.entry-password-val');
      const actualPwd = valSpan.getAttribute('data-password');

      try {
        await navigator.clipboard.writeText(actualPwd);
        showToast('Password copied! Clipboard clears in 30s.');

        // Schedule clipboard clear after 30 seconds
        if (clipboardTimeout) clearTimeout(clipboardTimeout);
        clipboardTimeout = setTimeout(async () => {
          try {
            await navigator.clipboard.writeText('');
          } catch (_) {}
        }, 30000);
      } catch (err) {
        showToast('Failed to copy to clipboard.');
      }
    });
  });

  // Edit entry
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.entry-card');
      const id = card.getAttribute('data-id');
      const entry = store.getState().entries.find(item => item.id === id);
      if (entry) openModal(entry);
    });
  });

  // Delete entry
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('.entry-card');
      const id = card.getAttribute('data-id');
      const entry = store.getState().entries.find(item => item.id === id);
      if (!entry) return;

      if (confirm(`Are you sure you want to delete the credentials for "${entry.app}"?`)) {
        store.deleteEntry(id);
        renderEntries(searchInput.value);
        await triggerSync();
      }
    });
  });
}

/* ---------------- Modal & CRUD ---------------- */

function openModal(entry = null) {
  formEntry.reset();
  if (entry) {
    modalTitle.textContent = `Edit ${entry.app}`;
    entryIdInput.value = entry.id;
    entryAppInput.value = entry.app || '';
    entryUserInput.value = entry.username || '';
    entryEmailInput.value = entry.email || '';
    entryPwdInput.value = entry.password || '';
    entryUrlInput.value = entry.url || '';
    entryNotesInput.value = entry.notes || '';
  } else {
    modalTitle.textContent = 'New Vault Entry';
    entryIdInput.value = '';
  }
  modalEntry.classList.add('active');
  entryAppInput.focus();
}

function closeModal() {
  modalEntry.classList.remove('active');
  formEntry.reset();
}

async function triggerSync() {
  setSyncState(true);
  try {
    const res = await store.sync();
    setSyncState(false, res.merged ? 'Synced (Merged updates)' : 'Synced');
    return res;
  } catch (err) {
    setSyncState(false, 'Sync failed');
    console.error('Sync failed:', err);
    throw err;
  }
}

/* ---------------- Lock / Unlock Flow ---------------- */

function lockVault(alertMessage = null) {
  store.lock();
  masterPwdInput.value = '';
  ghPatInput.value = '';
  viewDashboard.classList.remove('active');
  viewUnlock.classList.add('active');

  if (alertMessage) {
    unlockAlert.textContent = alertMessage;
    unlockAlert.classList.add('show');
  } else {
    unlockAlert.classList.remove('show');
  }
}

/* ---------------- Event Listeners ---------------- */

// Load cached GitHub owner/repo for convenience
try {
  const savedOwner = localStorage.getItem('vault_gh_owner');
  const savedRepo = localStorage.getItem('vault_gh_repo');
  if (savedOwner) ghOwnerInput.value = savedOwner;
  if (savedRepo) ghRepoInput.value = savedRepo;
} catch (_) {}

// Unlock Form Submission
formUnlock.addEventListener('submit', async (e) => {
  e.preventDefault();
  unlockAlert.classList.remove('show');
  btnUnlockSubmit.disabled = true;
  btnUnlockSubmit.textContent = 'Unlocking & Decrypting...';

  const owner = ghOwnerInput.value.trim();
  const repo = ghRepoInput.value.trim();
  const pat = ghPatInput.value.trim();
  const masterPwd = masterPwdInput.value;

  try {
    await store.unlock(owner, repo, pat, masterPwd);

    // Save non-sensitive metadata for convenience
    try {
      localStorage.setItem('vault_gh_owner', owner);
      localStorage.setItem('vault_gh_repo', repo);
    } catch (_) {}

    // Switch view
    viewUnlock.classList.remove('active');
    viewDashboard.classList.add('active');
    renderEntries();
    resetInactivityTimer();
  } catch (err) {
    unlockAlert.textContent = `Unlock failed: ${err.message}`;
    unlockAlert.classList.add('show');
  } finally {
    btnUnlockSubmit.disabled = false;
    btnUnlockSubmit.textContent = 'Unlock Vault';
  }
});

// Lock Button
btnLock.addEventListener('click', () => {
  lockVault();
});

// Search Filter
searchInput.addEventListener('input', (e) => {
  renderEntries(e.target.value);
});

// Keyboard shortcut '/' to focus search
window.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput && !store.getState().isLocked) {
    e.preventDefault();
    searchInput.focus();
  }
});

// Password generator
btnGeneratePwd.addEventListener('click', () => {
  entryPwdInput.value = generateSecurePassword(18);
  entryPwdInput.type = 'text'; // momentarily show generated password
});

// Modal open/close
btnOpenAdd.addEventListener('click', () => openModal());
modalClose.addEventListener('click', closeModal);
btnCancelEntry.addEventListener('click', closeModal);

// Save Entry (Add or Update)
formEntry.addEventListener('submit', async (e) => {
  e.preventDefault();
  btnSaveEntry.disabled = true;
  const originalBtnText = btnSaveEntry.textContent;
  btnSaveEntry.textContent = 'Encrypting & Saving...';

  const id = entryIdInput.value;
  const payload = {
    app: entryAppInput.value,
    username: entryUserInput.value,
    email: entryEmailInput.value,
    password: entryPwdInput.value,
    url: entryUrlInput.value,
    notes: entryNotesInput.value,
  };

  try {
    if (id) {
      store.updateEntry(id, payload);
    } else {
      store.addEntry(payload);
    }

    // Must wait for GitHub sync to succeed before closing modal
    await triggerSync();

    closeModal();
    renderEntries(searchInput.value);
    showToast(id ? 'Entry updated & saved to GitHub!' : 'New entry saved to GitHub!');
  } catch (err) {
    alert(`Failed to save to GitHub:\n\n${err.message}\n\nPlease verify your repository name and that your PAT has "Contents: Read & Write" permissions.`);
  } finally {
    btnSaveEntry.disabled = false;
    btnSaveEntry.textContent = originalBtnText;
  }
});

// Toggle password visibility helper
document.querySelectorAll('.toggle-pwd').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🔒';
    } else {
      input.type = 'password';
      btn.textContent = '👁️';
    }
  });
});

// Inactivity listeners
['mousemove', 'keydown', 'click', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetInactivityTimer, { passive: true });
});
