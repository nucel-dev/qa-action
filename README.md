# nucel-dev/qa-action

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Autonomous AI QA for your CI/CD pipeline.**

`qa-action` wraps [Nucel QA](https://github.com/nucel-dev/nucel-qa) — a single Rust binary MCP server — and drives Claude through a full QA session on every pull request. Zero Playwright. Zero selectors. Just AI testing your app like a human would.

---

## What it does

1. Downloads the correct `nucel-qa` binary for the runner OS/arch
2. Starts it as a headless MCP server
3. Connects Claude to it and runs a full QA session:
   - Discovers all pages and features
   - Tests with 7 behavioral personas (new-user, stupid-user, power-user, impatient-user, accessibility-user, mobile-user, seo-bot)
   - Logs structured findings with severity
   - Generates a markdown report
4. Posts the report as a PR comment
5. Exposes the report as a step output for downstream steps

---

## Quick start

```yaml
name: QA

on:
  pull_request:

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Start your app however you normally would
      - name: Start app
        run: npm ci && npm run build && npm start &

      - name: Wait for app
        run: npx wait-on http://localhost:3000

      - uses: nucel-dev/qa-action@v1
        with:
          url: 'http://localhost:3000'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

That's it. Claude will discover your app, test every page with 7 personas, and post a detailed findings report as a PR comment.

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | ✅ | — | Target URL to test |
| `anthropic-api-key` | ✅ | — | Anthropic API key for Claude |
| `personas` | | all 7 | Comma-separated personas to run (e.g. `new-user,accessibility-user`) |
| `chrome-flags` | | — | Additional Chrome flags passed to nucel-qa |
| `comment-on-pr` | | `true` | Post QA report as a PR comment |
| `version` | | `latest` | Nucel QA version to install (e.g. `v0.2.0`) |
| `model` | | `claude-opus-4-6` | Claude model to use |
| `fail-on-severity` | | `none` | Fail the workflow when findings at or above this severity are found. One of `none`, `low`, `medium`, `high`, `critical` |

### Available personas

| Persona | Focus |
|---------|-------|
| `new-user` | First impressions, CTA clarity, onboarding |
| `stupid-user` | Garbage input, XSS, double-clicks, breaking forms |
| `power-user` | Keyboard nav, tab order, shortcuts, efficiency |
| `impatient-user` | Rage-clicks, cancel mid-flow, race conditions |
| `accessibility-user` | ARIA, headings, landmarks, keyboard-only, focus |
| `mobile-user` | Touch targets, overflow, responsive layout |
| `seo-bot` | Meta tags, OG, headings, canonical, alt text |

---

## Outputs

| Output | Description |
|--------|-------------|
| `report` | Full QA report in markdown format |
| `report-path` | Path to the written report file |
| `findings-count` | Total number of findings logged |
| `critical-count` | Number of critical-severity findings |
| `high-count` | Number of high-severity findings |

### Using outputs in downstream steps

```yaml
- id: qa
  uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Save report artifact
  uses: actions/upload-artifact@v4
  with:
    name: qa-report
    path: ${{ steps.qa.outputs.report-path }}

- name: Fail if critical findings
  run: |
    COUNT="${{ steps.qa.outputs.critical-count }}"
    echo "Critical findings: $COUNT"
    if [ "$COUNT" -gt 0 ]; then exit 1; fi
```

---

## Failing the workflow on findings

By default the action only fails the workflow when the **QA session itself
errors** (no report could be produced). Findings are reported but do not fail
the build, so you can adopt it without breaking existing pipelines.

To turn findings into a gate, set `fail-on-severity`:

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    fail-on-severity: 'high'   # fail on any high or critical finding
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | QA completed; no findings at/above the `fail-on-severity` threshold |
| `1` | QA session failed (e.g. no report produced, MCP/Anthropic error) |
| `2` | QA completed but findings at/above `fail-on-severity` were found |

---

## Advanced examples

### Run only specific personas

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    personas: 'accessibility-user,mobile-user'
```

### Test a staging environment (no PR comment)

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'https://staging.example.com'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    comment-on-pr: 'false'
```

### Pin to a specific Nucel QA version

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    version: 'v0.2.0'
```

### Full pipeline with app startup

```yaml
name: QA on PR

on:
  pull_request:

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install and build
        run: npm ci && npm run build

      - name: Start app (background)
        run: npm start &

      - name: Wait for app to be ready
        run: npx wait-on http://localhost:3000 --timeout 60000

      - name: Run QA
        id: qa
        uses: nucel-dev/qa-action@v1
        with:
          url: 'http://localhost:3000'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: nucel-qa-report
          path: ${{ steps.qa.outputs.report-path }}
```

---

## Requirements

- **ANTHROPIC_API_KEY** — add to your repo secrets ([Settings → Secrets and variables → Actions](https://docs.github.com/en/actions/security-guides/encrypted-secrets))
- **Chrome** — pre-installed on `ubuntu-latest`, `macos-latest`, `windows-latest` GitHub-hosted runners
- **Node.js 20+** — configured automatically by the action

---

## How it works

```
GitHub Actions runner
├── nucel-qa binary (downloaded from GitHub Releases)
│   └── HTTP MCP server on 127.0.0.1:18080
│       └── Chrome (headless, CDP)
└── run-qa.mjs (Node.js)
    ├── @modelcontextprotocol/sdk — MCP client → nucel-qa
    └── @anthropic-ai/sdk — Claude drives the QA session
        └── Writes markdown report → step output + PR comment
```

Claude connects to nucel-qa via the MCP protocol and calls tools like `qa_start_session`, `qa_navigate`, `qa_run_personas_parallel`, and `qa_generate_report` to conduct the full QA session autonomously.

---

## Documentation

### References

- [docs/inputs-reference.md](docs/inputs-reference.md) — every `action.yml` input with worked examples
- [docs/outputs-reference.md](docs/outputs-reference.md) — every output with downstream-step examples
- [docs/configuration.md](docs/configuration.md) — overview of inputs, outputs, and the internal environment
- [docs/troubleshooting.md](docs/troubleshooting.md) — common failure modes (missing API key, OOM, Chrome not installed, MCP handshake fails)
- [docs/integration-with-nucel-qa.md](docs/integration-with-nucel-qa.md) — architecture diagram and version compatibility matrix

### Personas

One page per persona, explaining when to use and when to skip:

- [docs/personas/](docs/personas/README.md) — index
- [new-user](docs/personas/new-user.md) · [stupid-user](docs/personas/stupid-user.md) · [power-user](docs/personas/power-user.md) · [impatient-user](docs/personas/impatient-user.md) · [accessibility-user](docs/personas/accessibility-user.md) · [mobile-user](docs/personas/mobile-user.md) · [seo-bot](docs/personas/seo-bot.md)

### Examples

Runnable workflow snippets you can copy into your own repo:

- [examples/](examples/README.md) — index
- [qa-on-pr.yml](examples/.github/workflows/qa-on-pr.yml) — basic PR-time QA
- [qa-on-deploy.yml](examples/.github/workflows/qa-on-deploy.yml) — post-deploy verification
- [qa-matrix.yml](examples/.github/workflows/qa-matrix.yml) — multi-persona parallel matrix

### Maintainer docs

- [docs/marketplace.md](docs/marketplace.md) — preparing for and maintaining the GitHub Marketplace listing
- [CHANGELOG.md](CHANGELOG.md) — release history

---

## License

[MIT](LICENSE) — Copyright 2026 Nucel (nucel.dev)
