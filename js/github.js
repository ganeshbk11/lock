/**
 * GitHub REST API Client for Vault
 * Communicates directly with api.github.com over HTTPS using Fine-Grained PAT.
 */

const GITHUB_API_BASE = 'https://api.github.com';
const VAULT_FILE_PATH = 'vault.enc.json';

// Utility for encoding UTF-8 strings to standard base64 for GitHub contents API
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Utility for decoding base64 from GitHub contents API (which may contain newlines)
function base64ToUtf8(base64) {
  const cleanBase64 = base64.replace(/\s/g, '');
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Fetches the encrypted vault file and its commit SHA from GitHub.
 * Returns { exists: false, sha: null, data: null } if the file hasn't been created yet (404).
 */
export async function fetchVaultFile(owner, repo, pat) {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${VAULT_FILE_PATH}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${pat.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.status === 404) {
    return { exists: false, sha: null, data: null };
  }

  if (!res.ok) {
    const errorText = await res.text();
    let message = `GitHub API error (${res.status})`;
    try {
      const errJson = JSON.parse(errorText);
      message += `: ${errJson.message}`;
    } catch {
      message += `: ${errorText}`;
    }
    throw new Error(message);
  }

  const json = await res.json();
  const rawDecoded = base64ToUtf8(json.content);
  const parsedData = JSON.parse(rawDecoded);

  return {
    exists: true,
    sha: json.sha,
    data: parsedData,
  };
}

/**
 * Saves (creates or updates) the encrypted vault file on GitHub.
 * @param {string} owner - GitHub username or org
 * @param {string} repo - Repository name (e.g. 'vault')
 * @param {string} pat - Personal Access Token
 * @param {object} encryptedPackage - { version, salt, iv, ciphertext }
 * @param {string|null} sha - Commit SHA of the current file (null if creating for the first time)
 * @param {string} commitMessage
 */
export async function saveVaultFile(owner, repo, pat, encryptedPackage, sha = null, commitMessage = 'Update encrypted vault') {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${VAULT_FILE_PATH}`;

  const jsonString = JSON.stringify(encryptedPackage, null, 2);
  const contentBase64 = utf8ToBase64(jsonString);

  const payload = {
    message: commitMessage,
    content: contentBase64,
  };

  if (sha) {
    payload.sha = sha;
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${pat.trim()}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 409) {
    const conflictErr = new Error('409 Conflict: Vault file was modified remotely.');
    conflictErr.isConflict = true;
    throw conflictErr;
  }

  if (!res.ok) {
    const errorText = await res.text();
    let message = `Failed to save vault (${res.status})`;
    try {
      const errJson = JSON.parse(errorText);
      message += `: ${errJson.message}`;
    } catch {
      message += `: ${errorText}`;
    }
    throw new Error(message);
  }

  const result = await res.json();
  return {
    success: true,
    newSha: result.content.sha,
  };
}
