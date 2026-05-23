# Troubleshooting

Common failure modes when running `nucel-dev/qa-action` in CI, and how to
diagnose them. Issues are grouped by the action step that surfaces them.

---

## Step: `Run QA session` — `Error: ANTHROPIC_API_KEY is not set`

**Symptom**: the runner script exits with code 1 immediately, before any
MCP calls happen.

**Cause**: the `anthropic-api-key` input is empty. Either the secret is
not defined at the repo / org level, or the workflow references the wrong
secret name.

**Fix**:

1. Confirm the secret exists: `gh secret list` (repo) or check
   _Settings → Secrets and variables → Actions_.
2. Confirm the workflow references it by the exact name:
   `${{ secrets.ANTHROPIC_API_KEY }}`.
3. For PRs from forks, repository secrets are **not** exposed by default —
   you'll need to use `pull_request_target` or move QA to a post-merge
   workflow.

---

## Step: `Run QA session` — `Error: QA_URL is not set`

**Symptom**: same as above but missing the target URL.

**Cause**: `url` input is empty.

**Fix**: set `with: url: ...` to a reachable URL. If you're starting an app
in a prior step, make sure it's actually listening before the action runs
(use `npx wait-on http://localhost:3000`).

---

## Step: `Install Nucel QA` — `Error: could not resolve Nucel QA version`

**Symptom**: install step fails when `version` is `latest`.

**Cause**: GitHub API call to
`https://api.github.com/repos/nucel-dev/nucel-qa/releases/latest` returned
no `tag_name` — usually rate-limit (anonymous calls capped at 60/hr per IP)
or the repo is temporarily unavailable.

**Fix**:

- Pin to an explicit version: `version: 'v0.2.0'` (bypasses the API call
  entirely).
- If you must use `latest`, add a retry/backoff in a wrapper workflow.

---

## Step: `Install Nucel QA` — `Unsupported OS` or `Unsupported architecture`

**Symptom**: install step fails before download.

**Cause**: the runner is something other than `linux`, `macOS`, or
`windows` on `x86_64` / `aarch64`. The action does not ship binaries for
other platforms.

**Fix**: use one of the supported `runs-on` values:

- `ubuntu-latest`, `ubuntu-22.04`, `ubuntu-24.04`
- `macos-latest`, `macos-14`, `macos-15`
- `windows-latest`

---

## Step: `Install Nucel QA` — `Checksum mismatch!`

**Symptom**: the downloaded binary does not match `checksums.txt`.

**Cause**: download corruption, MITM, or the release was re-uploaded
after the checksum file was generated.

**Fix**:

1. Re-run the workflow once. Transient CDN corruption is the most common
   cause.
2. If it persists, open an issue at `nucel-dev/nucel-qa` — the release
   asset is likely corrupted upstream.

---

## Step: `Start Nucel QA server` — `nucel-qa process exited unexpectedly`

**Symptom**: the wait loop reports the process is gone before the server
became ready.

**Cause** (most common, in order):

1. **Chrome missing** — the runner has no Chrome / Chromium installed.
   GitHub-hosted runners ship with Chrome pre-installed; self-hosted
   runners may not.
2. **Sandbox failure in container** — running inside Docker without
   `--no-sandbox` causes Chrome to crash on launch.
3. **Port 18080 already bound** — extremely rare on a fresh runner; almost
   only happens on self-hosted reused workers.

**Fix**:

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    chrome-flags: '--no-sandbox --disable-dev-shm-usage'
```

Or pre-install Chrome on self-hosted:

```yaml
- name: Install Chrome
  uses: browser-actions/setup-chrome@v1
```

To rule out a port collision on a self-hosted runner, restart the worker.

---

## Step: `Start Nucel QA server` — server never becomes ready (30s timeout)

**Symptom**: the wait loop exits without ever seeing `nucel-qa ready
after Xs`, but the process is still alive.

**Cause**: nucel-qa is up but Chrome is slow to launch — usually under
heavy CPU contention or low memory.

**Fix**: switch to a larger runner (`runs-on: ubuntu-latest-4-cores` for
enterprise, or `macos-13-large`). Add the dev-shm flag mentioned above.

---

## Step: `Run QA session` — connection refused / MCP handshake fails

**Symptom**: `Connecting to nucel-qa MCP server at ...` is followed by a
fetch error or stream abort.

**Cause**: the server exited between the wait-loop and the QA step
(usually OOM), or the MCP protocol version on the server is incompatible
with the SDK version pinned in `package.json`.

**Fix**:

- Check the runner logs immediately above the failure for a Chrome / OOM
  panic.
- If the protocol mismatch is suspected, pin `version` to a known-good
  nucel-qa release and re-run.
- Open an issue with the full log if neither applies.

---

## Step: `Run QA session` — runner runs out of memory (OOM)

**Symptom**: the workflow ends with an `Out of memory` error, often
mid-iteration. `findings-count` is missing from outputs.

**Cause**: running 7 personas in parallel against a large app keeps many
Chrome contexts + Claude tool-results in memory at once. The default
`ubuntu-latest` runner has 7 GB.

**Fix**:

- Reduce the persona set: `personas: 'new-user,accessibility-user'`.
- Move to a larger runner tier.
- Pre-build the app rather than running `npm start` inside the same
  workflow (frees Node memory before QA starts).

---

## Step: `Run QA session` — `Warning: reached max iterations without
end_turn`

**Symptom**: the script logs the warning and the report is empty or
truncated.

**Cause**: Claude exceeded the 80-iteration safety cap. Either the app is
genuinely huge, or Claude got stuck in a loop (rare).

**Fix**:

- Restrict scope: target a sub-route (`url: 'http://localhost:3000/checkout'`)
  or reduce personas.
- If recurring, capture the log and open an issue — the prompt may need
  tuning in `scripts/run-qa.mjs`.

---

## Step: `Post PR comment` — comment not posted

**Symptom**: the QA step succeeded, but no PR comment appeared.

**Possible causes**:

1. `comment-on-pr: 'false'` was set.
2. Event was not `pull_request` (e.g., `workflow_dispatch`, `push`,
   `schedule`).
3. `GITHUB_TOKEN` does not have `pull-requests: write` permission on
   org-restricted repos.
4. Report file was empty (the comment step logs "Report is empty,
   skipping PR comment").

**Fix**: ensure your workflow has the right permission block:

```yaml
permissions:
  contents: read
  pull-requests: write
```

For PRs from forks, use `pull_request_target` (with appropriate care
around untrusted code), or post the comment from a follow-up workflow
that runs with full permissions.

---

## Step: `Post PR comment` — `Resource not accessible by integration`

**Symptom**: `actions/github-script` returns a 403.

**Cause**: missing `pull-requests: write` on the workflow or the default
`GITHUB_TOKEN` has been downscoped at the repo/org level.

**Fix**: add the `permissions:` block shown above.

---

## "I'm getting wildly different findings each run"

This is expected — Claude is non-deterministic. Two mitigations:

- Pin `model` to a specific snapshot (e.g., `claude-opus-4-6`) rather
  than a moving alias.
- Treat the report as a signal, not a contract — use `findings-count` as
  a smoke check, not a hard gate.

---

## Debug tips

- The runner script logs every MCP tool call (`→ name(args)`) and a
  500-char preview of each response. Look for repeated errors from the
  same tool.
- `stop_reason: end_turn` means Claude finished cleanly. Anything else
  (`max_tokens`, `tool_use` past the cap) is suspect.
- To reproduce locally:

  ```bash
  cd qa-action
  npm ci
  NUCEL_TRANSPORT=http NUCEL_BIND=127.0.0.1:18080 NUCEL_QA_HEADLESS=1 \
    nucel-qa &
  ANTHROPIC_API_KEY=sk-... \
  QA_URL=http://localhost:3000 \
  node scripts/run-qa.mjs
  ```
