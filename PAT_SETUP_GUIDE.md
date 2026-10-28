# GitHub Personal Access Token (PAT) Setup Guide for Vault

This guide walks you through creating a Fine-Grained Personal Access Token (PAT) with the exact, minimal permissions required by Vault.

---

## Step 0: Create the Private Repository First

Before creating the token, GitHub needs the destination repository to exist:

1. Open your browser and go to: **[https://github.com/new](https://github.com/new)**
2. Fill in:
   - **Repository name:** `vault`
   - **Visibility:** **Private** *(Never select Public)*
   - **Initialize repository:** Check **Add a README file** (this creates the default main branch and commit)
3. Click **Create repository**.

---

## Step 1: Open Token Creation

1. In the upper-right corner of GitHub, click your **profile photo** $\rightarrow$ **Settings**.
2. Scroll to the bottom of the left-hand navigation sidebar and click **Developer settings**.
3. In the left sidebar, click **Personal access tokens** $\rightarrow$ **Fine-grained tokens**.
4. Click the **Generate new token** button in the top right.

---

## Step 2: Every Setting & Decision Explained

### 1. Token name
- **Value:** `vault-app`
- **Why:** A recognizable name so you know what this token is used for in the future.

### 2. Expiration
- **Recommended Value:** **90 days** or **1 year**
- **Why:** GitHub does not allow fine-grained tokens without an expiration date. 90 days is standard security hygiene. When it expires, GitHub sends an email and you simply click *Regenerate*.

### 3. Description
- **Value:** `Personal access token for client-side Vault password manager`
- **Why:** Optional context note for yourself.

### 4. Resource owner
- **Value:** Select your personal GitHub username.

### 5. Repository access
- **Critical Choice:** Select **"Only select repositories"**
- **Do NOT choose:** *"All repositories"*.
- In the **Select repositories** dropdown, choose **`vault`**.
- **Why:** This isolates the token. Even if your device were ever compromised, the token can only access this single repo, never your other projects or personal code.

---

## Step 3: Permissions

GitHub provides two categories of permissions. Configure them as follows:

### Repository permissions
- Scroll through the list to find **Contents**.
- Change from *No access* to **Access: Read and write**.
  *(This is the only permission needed to read and update `vault.enc.json`)*.
- **Leave every other repository permission as "No access"** (Actions, Issues, Metadata, Pull requests, Secrets, etc. stay *No access*).

### Account permissions
- **Leave everything as "No access"**.

---

## Step 4: Generate and Copy

1. Scroll to the bottom and click **Generate token**.
2. GitHub displays your new token starting with `github_pat_...`.
3. **Copy it immediately** and keep it ready. GitHub will never display it again once you leave this page.
