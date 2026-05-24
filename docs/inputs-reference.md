# Inputs reference

Every input defined in [`action.yml`](../action.yml), with one worked
example per input. For a higher-level overview, see
[`configuration.md`](./configuration.md).

| Input | Required | Default | Type |
|-------|----------|---------|------|
| [`url`](#url) | yes | — | string (URL) |
| [`anthropic-api-key`](#anthropic-api-key) | yes | — | string (secret) |
| [`personas`](#personas) | no | `''` (all 7) | string (comma-separated) |
| [`chrome-flags`](#chrome-flags) | no | `''` | string (space-separated CLI flags) |
| [`comment-on-pr`](#comment-on-pr) | no | `'true'` | string (`'true'` or `'false'`) |
| [`version`](#version) | no | `'latest'` | string (git tag or `'latest'`) |
| [`model`](#model) | no | `'claude-opus-4-6'` | string (Anthropic model ID) |

---

## `url`

The target URL the QA session will navigate to. Passed verbatim to
`qa_start_session` on the nucel-qa MCP server.

The URL must be reachable from the GitHub runner. Three common shapes:

### Self-hosted localhost (most common in PR workflows)

```yaml
- name: Start app
  run: npm start &

- name: Wait for app
  run: npx --yes wait-on http://localhost:3000 --timeout 60000

- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Preview deployment from a PR (e.g. Vercel / Netlify)

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: ${{ steps.vercel-deploy.outputs.preview-url }}
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Static staging URL

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'https://staging.example.com'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## `anthropic-api-key`

API key for the Anthropic Messages API. The action injects it into the
runner script as `ANTHROPIC_API_KEY` and uses it for every
`messages.create()` call inside the agent loop.

Always read from `secrets.*` — never hardcode.

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

The key needs Messages API access for whichever model you select via
[`model`](#model). One full QA run with all 7 personas typically uses on
the order of 200k – 800k tokens of input + output combined, depending on
app size.

For PRs from forks, repo secrets are not exposed by default; either move
QA to a post-merge workflow or use `pull_request_target` (with careful
review of the trigger semantics).

---

## `personas`

Restrict the run to a subset of personas. Empty = all 7. Whitespace is
trimmed and empty entries dropped before being forwarded to nucel-qa.

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    personas: 'accessibility-user,mobile-user'
```

Valid persona IDs:

| ID | Page |
|----|------|
| `new-user` | [docs/personas/new-user.md](./personas/new-user.md) |
| `stupid-user` | [docs/personas/stupid-user.md](./personas/stupid-user.md) |
| `power-user` | [docs/personas/power-user.md](./personas/power-user.md) |
| `impatient-user` | [docs/personas/impatient-user.md](./personas/impatient-user.md) |
| `accessibility-user` | [docs/personas/accessibility-user.md](./personas/accessibility-user.md) |
| `mobile-user` | [docs/personas/mobile-user.md](./personas/mobile-user.md) |
| `seo-bot` | [docs/personas/seo-bot.md](./personas/seo-bot.md) |

Unknown IDs are silently ignored by the server. Verify against
`nucel-qa --help` on the version you've pinned.

---

## `chrome-flags`

Extra flags appended to the `nucel-qa` invocation. Forwarded to the
headless Chrome instance the server spawns. Useful inside containers or
constrained runners.

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://app:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    chrome-flags: '--no-sandbox --disable-dev-shm-usage --disable-gpu'
```

Common flag recipes:

| Scenario | Flags |
|----------|-------|
| Running inside a container as root | `--no-sandbox` |
| Low-memory runners (Docker default `/dev/shm` = 64MB) | `--disable-dev-shm-usage` |
| Self-hosted runner without GPU | `--disable-gpu` |
| All three together | `--no-sandbox --disable-dev-shm-usage --disable-gpu` |

---

## `comment-on-pr`

When `'true'` and the workflow was triggered by a `pull_request` event,
the action posts the markdown report as a PR comment via
`actions/github-script@v7`.

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    comment-on-pr: 'false'
```

Behavioural notes:

- If the event is not `pull_request`, the comment step is silently skipped
  regardless of this flag.
- If the report file is empty (e.g. QA failed to produce output), the
  comment step logs "Report is empty, skipping PR comment" and exits 0
  without posting.
- The workflow must grant `pull-requests: write` permission for the
  comment to be created. See
  [`troubleshooting.md`](./troubleshooting.md#step-post-pr-comment--comment-not-posted).

Set to `'false'` for scheduled / dispatch / `workflow_run` workflows
where no PR context exists.

---

## `version`

Which `nucel-qa` release to download from `nucel-dev/nucel-qa`. Defaults
to `'latest'`, which resolves the most recent release via the GitHub
API at runtime.

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    version: 'v0.2.0'
```

Recommendations:

- **Production CI**: always pin to an explicit tag
  (`version: 'v0.2.0'`). This avoids surprise upgrades when a new
  nucel-qa release changes a tool signature or persona behaviour and
  bypasses the GitHub API rate limit for the `latest` lookup.
- **Dependabot / Renovate**: configure them to track
  `nucel-dev/nucel-qa` releases and PR a bump to this input.
- **`latest`**: fine for evaluation / personal projects.

The downloaded binary is checksum-verified against `checksums.txt` from
the same release when present.

---

## `model`

Claude model ID passed to every `messages.create()` call inside the
agent loop. Defaults to `'claude-opus-4-6'`.

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    model: 'claude-opus-4-7'
```

| Model | When to use |
|-------|-------------|
| `claude-opus-4-6` (default) | Production QA. Highest finding quality, deepest reasoning, highest cost. |
| `claude-opus-4-7` | Latest Opus snapshot — pin once tested on your app. |
| `claude-sonnet-4-x` | ~3-5x cheaper than Opus, ~70-80% of finding depth. Reasonable mid-tier. |
| `claude-haiku-4-x` | Cheapest tier. Suitable for smoke checks, not full QA. |

Cheaper models typically log fewer findings per persona and may need a
higher iteration cap (the agent loop is hardcoded at 80 in
`scripts/run-qa.mjs`). Use Opus for production QA gates; experiment with
Sonnet for nightly scheduled runs to control cost.
