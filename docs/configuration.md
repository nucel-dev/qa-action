# Configuration

Reference for every input, output, and environment knob exposed by
`nucel-dev/qa-action`. Pair this with the [Quick start in the
README](../README.md) and [docs/integration-with-nucel-qa.md](./integration-with-nucel-qa.md)
for end-to-end wiring.

---

## Inputs

All inputs are passed via the `with:` block on the action step.

### `url` (required)

- **Type**: string (URL)
- **Default**: — (must be provided)
- **Description**: The target URL the QA session will navigate to. This is
  passed verbatim to `qa_start_session` on the nucel-qa MCP server.

```yaml
with:
  url: 'http://localhost:3000'
```

Use a reachable URL from the runner. For self-hosted apps, start them in a
prior step and `wait-on` the port before invoking the action. For staging /
preview deployments, point directly at the public URL.

### `anthropic-api-key` (required)

- **Type**: string (secret)
- **Default**: — (must be provided)
- **Description**: API key for the Anthropic Messages API. The action uses it
  to instantiate `new Anthropic({ apiKey })` and drive the agentic loop.

```yaml
with:
  anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

Never hardcode this — always read from `secrets.*`. The key needs Messages
API access for whichever model you select (see `model` below).

### `personas` (optional)

- **Type**: string (comma-separated list)
- **Default**: `''` (empty → run all 7 personas)
- **Description**: Restrict the QA run to a subset of personas. Whitespace is
  trimmed; empty entries are dropped.

```yaml
with:
  personas: 'accessibility-user,mobile-user'
```

Valid persona IDs:

| ID | Focus |
|----|-------|
| `new-user` | First impressions, CTA clarity, onboarding |
| `stupid-user` | Garbage input, XSS, double-clicks, breaking forms |
| `power-user` | Keyboard nav, tab order, shortcuts, efficiency |
| `impatient-user` | Rage-clicks, cancel mid-flow, race conditions |
| `accessibility-user` | ARIA, headings, landmarks, keyboard-only, focus |
| `mobile-user` | Touch targets, overflow, responsive layout |
| `seo-bot` | Meta tags, OG, headings, canonical, alt text |

These IDs are delegated to `nucel-qa`. Unknown IDs are silently ignored by
the server — verify with `nucel-qa --help` for the version you've pinned.

### `chrome-flags` (optional)

- **Type**: string (space-separated CLI flags)
- **Default**: `''`
- **Description**: Extra flags appended to the `nucel-qa` invocation. These
  are forwarded to the headless Chrome instance the server spawns.

```yaml
with:
  chrome-flags: '--no-sandbox --disable-dev-shm-usage'
```

Useful when running inside containers or constrained runners (Docker
in CI, low-memory hosts).

### `comment-on-pr` (optional)

- **Type**: string (`'true'` | `'false'`)
- **Default**: `'true'`
- **Description**: When `'true'` and the workflow was triggered by a
  `pull_request` event, the action posts the markdown report as a PR
  comment via `actions/github-script@v7`.

```yaml
with:
  comment-on-pr: 'false'
```

If the event is not a pull request, the comment step is skipped regardless
of this flag. Setting `false` is the right call for scheduled or
manually-dispatched workflows.

### `version` (optional)

- **Type**: string (release tag or `latest`)
- **Default**: `'latest'`
- **Description**: Which `nucel-qa` release to download from
  `nucel-dev/nucel-qa`. Pin this in CI to avoid surprise upgrades.

```yaml
with:
  version: 'v0.2.0'
```

When `latest`, the action calls the GitHub API to resolve the latest tag.
The downloaded asset is checksum-verified against `checksums.txt` when
present in the release.

### `model` (optional)

- **Type**: string (Anthropic model ID)
- **Default**: `'claude-opus-4-6'`
- **Description**: Claude model passed to every `messages.create()` call
  inside the agent loop.

```yaml
with:
  model: 'claude-opus-4-7'
```

Cheaper models (Haiku, Sonnet) will work but typically log fewer findings
per persona and may need a higher iteration cap. Opus is recommended for
production QA.

---

## Outputs

Set via `${{ steps.<id>.outputs.<name> }}`.

| Output | Type | Description |
|--------|------|-------------|
| `report` | string (markdown) | Full QA report extracted from `<report>...</report>` in Claude's final turn |
| `report-path` | string (path) | Absolute path to the report file on the runner (`/tmp/nucel-qa-report.md`) |
| `findings-count` | string (integer) | Heuristic count of severity-tagged finding rows (matches `^\s*[|]?\s*(critical|high|medium|low)\s*[|]`) |

Example use:

```yaml
- id: qa
  uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Upload report
  uses: actions/upload-artifact@v4
  with:
    name: nucel-qa-report
    path: ${{ steps.qa.outputs.report-path }}

- name: Echo finding count
  run: echo "Findings = ${{ steps.qa.outputs.findings-count }}"
```

---

## Internal environment

The runner script (`scripts/run-qa.mjs`) reads the following environment
variables, all set automatically by `action.yml`. They are documented here
for completeness — you should not need to override them unless writing a
custom workflow that calls the script directly.

| Variable | Source | Purpose |
|----------|--------|---------|
| `ANTHROPIC_API_KEY` | `inputs.anthropic-api-key` | Anthropic auth |
| `QA_URL` | `inputs.url` | Target URL |
| `QA_PERSONAS` | `inputs.personas` | Persona filter |
| `QA_MODEL` | `inputs.model` | Claude model ID |
| `NUCEL_QA_SERVER_URL` | Fixed `http://127.0.0.1:18080/mcp` | MCP transport |
| `QA_REPORT_OUTPUT` | Fixed `/tmp/nucel-qa-report.md` | Report write path |
| `NUCEL_TRANSPORT` | Fixed `http` | nucel-qa MCP transport mode |
| `NUCEL_QA_HEADLESS` | Fixed `1` | Force headless Chrome |
| `NUCEL_BIND` | Fixed `127.0.0.1:18080` | nucel-qa listen address |
| `GITHUB_OUTPUT` | Provided by GitHub Actions runner | Multiline output write target |

---

## Worked examples

### Pull-request flow with strict version pin

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    version: 'v0.2.0'
    model: 'claude-opus-4-6'
    personas: 'new-user,accessibility-user,seo-bot'
```

### Nightly scheduled run against staging (no PR comment)

```yaml
on:
  schedule:
    - cron: '0 3 * * *'

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: nucel-dev/qa-action@v1
        with:
          url: 'https://staging.example.com'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          comment-on-pr: 'false'
```

### Container runner with extra Chrome flags

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://app:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    chrome-flags: '--no-sandbox --disable-dev-shm-usage --disable-gpu'
```
