#!/bin/bash
# Removes .bkenvback (and the OpenAI/other secrets in it) from git history
# so GitHub secret scanning will allow the push.
# Run from repo root: ./scripts/remove-bkenvback-from-history.sh

set -e
cd "$(git rev-parse --show-toplevel)"

echo "Stashing any local changes..."
git stash push --include-untracked -m "before remove .bkenvback from history" || true

echo "Removing .bkenvback from all commits on main..."
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch .bkenvback' --prune-empty main

echo "Cleaning up backup refs..."
rm -rf .git/refs/original/

echo "Restoring stashed changes (if any)..."
git stash pop || true

echo "Done. Next steps:"
echo "  1. Add .bkenvback to .gitignore if not already (so it's never committed again)"
echo "  2. Force push:  git push --force-with-lease origin main"
echo "  3. Rotate your OpenAI API key at https://platform.openai.com (the old one was in history)"
