# Unblock push after GitHub secret scanning

GitHub blocked your push because it detected an API key or secret in your commit history. Follow these steps to unblock and push.

## Step 1: Open the unblock link

1. In your terminal, scroll up in the `git push` error until you see a line that looks like:
   ```
   .../security/secret-scanning/unblock-secret/397frHiD8V8gW3CKO292kbERtyX
   ```
2. Copy the **full URL** (it may be split across lines). It should look like:
   ```
   https://github.com/ramzidaher/Penny/security/secret-scanning/unblock-secret/397frHiD8V8gW3CKO292kbERtyX
   ```
3. Paste that URL into your browser and press Enter.
4. Sign in to GitHub if asked.
5. On the secret-scanning page, choose one of:
   - **Allow push** – if you’ve already rotated/revoked the exposed secret and just want to push.
   - **Rotate secret** – follow GitHub’s link to the provider (e.g. Google, Plaid) to create a new key, then update your `.env` and EAS secrets with the new value.

## Step 2: Push again

In your project folder, run:

```bash
cd /Users/ramzidaher/Projects/finance
git push
```

If the unblock succeeded, the push should go through.

## Step 3: Rotate any exposed secrets (recommended)

Even if you allowed the push, treat the detected secret as exposed:

1. **Identify which secret** – GitHub’s unblock page usually says which service (e.g. Google API key, Plaid secret).
2. **Rotate it** – In that service’s console (Google Cloud, Plaid Dashboard, Firebase, etc.), revoke the old key and create a new one.
3. **Update locally** – Put the new value in `.env` (and in EAS secrets for production builds).

## If you don’t see the unblock URL

- Run `git push` again and look at the **full** output; the URL is often printed above the “remote rejected” line.
- Or go to: **GitHub → Your repo (Penny) → Security → Secret scanning** and check for alerts; open the relevant alert to get the unblock or rotate options.

## Already done in this repo

- `build/` added to `.gitignore` and removed from git tracking.
- Hardcoded Logo key removed from `CompanyLogo.tsx`; it now uses `EXPO_PUBLIC_LOGO_DEV_KEY` from `.env` only.
