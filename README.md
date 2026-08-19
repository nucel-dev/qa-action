# nucel-dev/qa-action

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A GitHub Actions action that runs an exploratory QA pass over a running web app.
It installs [Nucel QA](https://github.com/nucel-dev/nucel-qa) — a Rust MCP server
that drives headless Chrome — connects Claude to it over MCP, and lets the model
browse the app, log findings, and produce a markdown report. The report is
exposed as a step output and can be posted as a pull-request comment.

There are no selectors and no test files to maintain. That is the trade-off, in
both directions: you don't write or update scripts, and you don't get
deterministic assertions. Treat the output as a review, not as a test suite.

---

## Status: alpha, and currently not installable

Read this before adopting the action.

**The install step cannot succeed today.** `action.yml` downloads a release
asset from `github.com/nucel-dev/nucel-qa/releases`. That repository is private
and has **no published releases** — `GET /repos/nucel-dev/nucel-qa/releases`
returns an empty list and `/releases/latest` returns 404. With the default
`version: latest`, resolving the tag fails; with an explicit tag, the asset
download 404s. Either way the action fails on its first step.

Publishing releases is necessary but not sufficient. `nucel-dev/nucel-qa` needs
to publish assets named `nucel-qa-<arch>-<os>` (plus an optional
`checksums.txt`) that are reachable from the runner — which today also means
making the repository public, since the install step downloads unauthenticated.
With that done the run gets past step 1 and then fails at step 2, on the
readiness probe below. Both have to be fixed before a run reaches the QA
session.

**The readiness probe cannot succeed either.** After starting the server,
`action.yml` polls `curl -sf http://127.0.0.1:18080/mcp` for 30 seconds.
`nucel-qa` mounts its MCP service at `/mcp` in stateful mode, so a bare `GET`
reaches rmcp's GET handler — and rmcp 1.7.0, the version pinned in `nucel-qa`'s
`Cargo.lock`, rejects it. `curl` sends `Accept: */*`, and the handler answers
`406 Not Acceptable: Client must accept text/event-stream`. `curl -f` treats
4xx as failure, so `READY` is never set to 1. Sending the header the handler
asks for does not help: it then answers `400 Bad Request: Session ID is
required`. There is no plain health endpoint to probe. After 30 attempts the
step prints `Error: nucel-qa did not become ready within 30s` and exits 1.

**Nothing downstream of the install step has been exercised.** The
[`smoke-test`](.github/workflows/test.yml) workflow has a job that runs the
action against a sandbox URL. That job is not skipped — it runs and reports
success. The four steps inside it that do the real work (`Resolve sandbox URL`,
`Run action (self-test)`, `Verify outputs are populated`, `Upload smoke-test
report`) are each gated on `steps.check-key.outputs.skip != 'true'`, and no
`ANTHROPIC_API_KEY` secret is configured, so all four have been skipped on every
run to date while the job stayed green.

That distinction is the trap: a skipped job is visibly absent, whereas a green
job that skipped its own work looks like a pass. Green CI on this repository
means the YAML parses, dependencies install, and the unit tests in
`scripts/lib.test.mjs` pass — it does not mean the action works end to end.

**Specific things known or believed not to work:**

| Area | State |
|------|-------|
| Installing `nucel-qa` | Broken — no releases to download (above) |
| Finding counts and `fail-on-severity` | Unreliable — see [Severity counting](#severity-counting-is-unreliable) |
| `chrome-flags` input | No effect on Chrome — see [Inputs](#inputs) |
| `personas` input | Advisory only — passed in the prompt, not enforced |
| macOS and Windows runners | Untested; the report path and teardown assume POSIX |
| Server readiness probe | Broken — a bare `GET /mcp` answers 406, never 2xx (above) |

Everything below describes what the code does. Where behaviour is unverified,
it says so.

---

## What it does

1. Detects the runner OS/arch and downloads the matching `nucel-qa` binary from
   GitHub Releases, verifying `checksums.txt` when one is published (if it is
   absent, verification is silently skipped).
2. Starts `nucel-qa` as a background HTTP MCP server on `127.0.0.1:18080`
   (`NUCEL_TRANSPORT=http`, `NUCEL_QA_HEADLESS=1`) and polls for readiness for up
   to 30 seconds.
3. Runs `scripts/run-qa.mjs`, which connects an MCP client to the server, loads
   the server's tool list, and drives a Claude agent loop (max 80 iterations,
   16384 max tokens per turn) that navigates the app, runs personas, and calls
   `qa_generate_report`.
4. Writes the report to `/tmp/nucel-qa-report.md` and sets step outputs.
5. Stops the server, then optionally posts the report as a PR comment.

## Requirements

- **`ANTHROPIC_API_KEY`** as a repository or organization secret. Every run makes
  live Anthropic API calls; cost scales with app size and persona count.
- **Chrome**, pre-installed on GitHub-hosted runners. `nucel-qa` launches it over
  CDP and forces headless in HTTP mode.
- **`permissions: pull-requests: write`** on the job, if you leave
  `comment-on-pr` enabled. The comment step uses the default `GITHUB_TOKEN`,
  which is read-only in many repositories — without the grant the step fails.
- Node.js 20 is installed by the action itself; you don't need `setup-node`.
- A reachable target URL. Boot your app before the action runs — it does not
  start anything for you.

## Quick start

```yaml
name: QA

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write   # needed for comment-on-pr

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start app
        run: npm ci && npm run build && npm start &

      - name: Wait for app
        run: npx wait-on http://localhost:3000 --timeout 60000

      - uses: nucel-dev/qa-action@v1
        with:
          url: 'http://localhost:3000'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

As noted above, this currently fails at the install step, and would fail at the
readiness probe even once `nucel-qa` publishes downloadable releases. Both
blockers are described in [Status](#status-alpha-and-currently-not-installable).

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | yes | — | Target URL. Validated as `http(s)` before the session starts. |
| `anthropic-api-key` | yes | — | Anthropic API key. |
| `personas` | no | all 7 | Comma-separated persona list. **Advisory**: the value is interpolated into the prompt, not passed as an argument to `qa_run_personas_parallel`, so the model may not honour it exactly. |
| `chrome-flags` | no | `''` | **No effect on Chrome today.** The value is appended to the `nucel-qa` command line and expanded unquoted, so it is word-split into `nucel-qa`'s own argv — it is not inert, it just never reaches the browser. `nucel-qa` inspects its arguments only for `--headless`; the Chrome flags themselves are compiled in (`src/browser.rs`). |
| `comment-on-pr` | no | `true` | Post the report as a PR comment. Needs a `pull_request` event **and** every earlier step to have succeeded: the step's `if` carries no status function, so GitHub prepends an implicit `success() &&` and skips it whenever the QA session exited non-zero — including exit 2, the severity gate. See [Exit codes](#exit-codes). Each run adds a **new** comment — it does not update a previous one. |
| `version` | no | `latest` | `nucel-qa` release tag. `latest` resolves via an unauthenticated call to the GitHub API, which is subject to the 60-requests-per-hour anonymous rate limit. |
| `model` | no | `claude-opus-4-6` | Claude model ID. |
| `fail-on-severity` | no | `none` | Fail the workflow on findings at or above this severity: `none`, `low`, `medium`, `high`, `critical`. Any other value is **silently ignored** — the gate is skipped and the step still exits 0. See the caveat below. |

### Available personas

The persona set is defined by `nucel-qa`, not by this action.

| Persona | Focus |
|---------|-------|
| `new-user` | First impressions, CTA clarity, onboarding |
| `stupid-user` | Garbage input, XSS, double-clicks, breaking forms |
| `power-user` | Keyboard nav, tab order, shortcuts, efficiency |
| `impatient-user` | Rage-clicks, cancel mid-flow, race conditions |
| `accessibility-user` | ARIA, headings, landmarks, keyboard-only, focus |
| `mobile-user` | Touch targets, overflow, responsive layout |
| `seo-bot` | Meta tags, OG, headings, canonical, alt text |

One page per persona lives in [`docs/personas/`](docs/personas/README.md).

---

## Outputs

| Output | Description |
|--------|-------------|
| `report` | The report markdown. |
| `report-path` | Path to the written report file (`/tmp/nucel-qa-report.md`). |
| `findings-count` | Total findings counted. See the caveat below. |
| `critical-count` | Critical-severity findings counted. See the caveat below. |
| `high-count` | High-severity findings counted. See the caveat below. |

```yaml
- id: qa
  uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Save report artifact
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: qa-report
    path: ${{ steps.qa.outputs.report-path }}
```

### Severity counting is unreliable

`report`, `report-path`, and the artifact flow above are sound. The three count
outputs and the `fail-on-severity` gate are not, and should be treated as alpha.

`countFindings` in [`scripts/lib.mjs`](scripts/lib.mjs) counts report lines that
begin with a severity **word** — `critical`, `high`, `medium`, or `low` —
followed by a separator. Two things break that against a real report:

- `nucel-qa`'s severity enum is `critical | major | minor | info`, so `high`,
  `medium`, and `low` never appear in a report it generates.
- Its summary rows are written as `| 🔴 Critical | 2 |`. The emoji sits between
  the leading pipe and the word, so even the `critical` row does not match.

Counting a verbatim `nucel-qa` report therefore returns zero for every severity.
The counts are non-zero only when the model happens to restate findings in a
severity-first list or table of its own. Do not gate a merge on
`fail-on-severity` until the counter and the server's severity vocabulary are
reconciled.

There is a second trap in the same area, and it is sharpened by the paragraph
above. `fail-on-severity` accepts `none`, `low`, `medium`, `high`, `critical`;
**any other value is skipped, not rejected.** `evaluateSeverityGate` in
[`scripts/lib.mjs`](scripts/lib.mjs) returns
`unknown fail-on-severity value "…" — gate skipped` and the step exits 0. That
reason is printed to the log with `console.log` — it is not a workflow
annotation, so nothing flags the run. So once you have read that `nucel-qa`'s
own severities are `critical | major | minor | info`, the natural next move —
`fail-on-severity: major` — silently disables the gate you believed you had just
turned on. Use only the five values listed in the input table.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Session completed; no findings at or above `fail-on-severity` were counted |
| `1` | Session failed — no report could be extracted, or an MCP/Anthropic error |
| `2` | Session completed but the severity gate tripped |

The default `fail-on-severity: none` never produces exit code 2, so adopting the
action does not break an existing pipeline. Given the counting problem above,
exit code 2 is currently reachable only by accident.

Exit 2 is also the case where `comment-on-pr` quietly does nothing, and it is
the damaging one. The session completed and a full report is sitting on disk,
but the step exited non-zero, and the **Post PR comment** step's `if` carries no
status function — so GitHub prepends an implicit `success() &&` and skips it.
(The adjacent **Stop Nucel QA server** step spells out `if: always()` for
exactly this reason.) Exit 1 skips the comment as well; there the file holds
only `(no report generated)`, and a fatal error can abort before it is written
at all.

`run-qa.mjs` writes the report file ahead of both failure exits, with a comment
saying it does so "even on failure paths, so downstream steps (artifact upload,
PR comment) still have something" — the step condition in `action.yml` defeats
that intent for the PR comment. So the run that most needs the report on the PR
is the run that will not get one. If you gate on `fail-on-severity`, upload the
report as an artifact with `if: always()` — as in the example above — rather
than relying on the comment.

---

## Examples

### Only some personas

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    personas: 'accessibility-user,mobile-user'
```

### A deployed environment, no PR comment

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'https://staging.example.com'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    comment-on-pr: 'false'
```

### Pinning the `nucel-qa` version

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    version: 'v0.2.0'
```

Complete, copyable workflows are in [`examples/`](examples/README.md):
[`qa-on-pr.yml`](examples/.github/workflows/qa-on-pr.yml) (PR-time),
[`qa-on-deploy.yml`](examples/.github/workflows/qa-on-deploy.yml) (post-deploy),
and [`qa-matrix.yml`](examples/.github/workflows/qa-matrix.yml) (one job per
persona).

---

## How it works

```
GitHub Actions runner
├── nucel-qa binary (from GitHub Releases)
│   └── HTTP MCP server on 127.0.0.1:18080/mcp
│       └── headless Chrome over CDP
└── scripts/run-qa.mjs (Node 20)
    ├── @modelcontextprotocol/sdk — MCP client → nucel-qa
    └── @anthropic-ai/sdk — Claude agent loop
        └── report → step outputs + PR comment
```

`run-qa.mjs` calls `tools/list` on the MCP server and forwards every tool it
finds to Claude, so new `nucel-qa` tools become usable without a release of this
action. The prompt asks for a fixed sequence — `qa_start_session`, explore,
`qa_mark_discovery_complete`, `qa_run_personas_parallel`, `qa_generate_report`,
`qa_end_session` — and asks the model to echo the report verbatim inside
`<report>…</report>` tags. `extractReport` takes the last such block from the
accumulated transcript, falling back to the first markdown heading.

Failed tool calls are returned to the model as text rather than aborting the
loop, so a session degrades rather than crashing. If the loop ends without a
report, the action exits 1.

## Where this fits

- **[`nucel-dev/nucel-qa`](https://github.com/nucel-dev/nucel-qa)** is the
  engine: a Rust MCP server exposing ~50 `qa_*` tools (navigation, snapshots,
  console and network capture, accessibility scans, persona runs, findings
  store, report generation). This repository is a thin GitHub Actions wrapper
  around it plus the agent loop that drives it. `nucel-qa` also ships its own
  bash-based action that runs a fixed tool sequence with no LLM — useful as a
  smoke test of the HTTP transport, not a substitute for this one.
- **The rest of Nucel** (the platform, its Helm charts, its operators) is
  unrelated at runtime. This action targets GitHub Actions and tests any web
  app; nothing in the Nucel platform repositories invokes it, and it is not part
  of Nucel's own CI.

---

## Development

This repository is a composite action: `action.yml` plus two Node scripts. There
is no build step and nothing is bundled — `npm ci --omit=dev` runs on the runner.

```bash
npm ci
npm run lint    # syntax check with node --check
npm test        # unit tests, node --test
```

`scripts/lib.mjs` holds the pure helpers (`parsePersonas`, `extractReport`,
`countFindings`, `evaluateSeverityGate`, `formatOutputEntry`) so they can be
tested without a network, an MCP server, or an API key.
`scripts/run-qa.mjs` holds everything with I/O. Keep that split: new logic
belongs in `lib.mjs` with a test.

**Node version:** `package.json` declares `engines: node >= 22` and the test
runner's glob syntax needs Node 21+, so local development and the CI test job use
Node 22. The action itself installs Node 20 on the runner. That mismatch is not
currently enforced by npm, but it means the scripts must stay Node 20-compatible.

`.github/workflows/test.yml` runs YAML/JSON validation, `npm ci`, lint, and unit
tests on every push and PR, plus a weekly cron. Its third job runs the action
against `https://example.com`; the steps that do so skip themselves when
`ANTHROPIC_API_KEY` is not configured, which so far has been every run. The job
itself still runs and reports success.

### Contributing

- Keep `README.md`, `action.yml`, and `docs/inputs-reference.md` /
  `docs/outputs-reference.md` in agreement when changing the input or output
  surface; the reference docs are the detailed version of the tables above.
- Add a `CHANGELOG.md` entry under `[Unreleased]`.
- If you change anything in `scripts/`, add or update a test in
  `scripts/lib.test.mjs`.
- Changing tool names, persona slugs, or the report format requires a matching
  change in `nucel-qa`. Its
  [`docs/integration-with-qa-action.md`](https://github.com/nucel-dev/nucel-qa/blob/main/docs/integration-with-qa-action.md)
  lists the contracts both sides depend on.

---

## Documentation

**Reference**

- [docs/inputs-reference.md](docs/inputs-reference.md) — every input, with examples
- [docs/outputs-reference.md](docs/outputs-reference.md) — every output, with downstream examples
- [docs/configuration.md](docs/configuration.md) — inputs, outputs, and the internal environment
- [docs/troubleshooting.md](docs/troubleshooting.md) — failure modes by action step
- [docs/integration-with-nucel-qa.md](docs/integration-with-nucel-qa.md) — architecture and version compatibility

**Personas** — [index](docs/personas/README.md) ·
[new-user](docs/personas/new-user.md) ·
[stupid-user](docs/personas/stupid-user.md) ·
[power-user](docs/personas/power-user.md) ·
[impatient-user](docs/personas/impatient-user.md) ·
[accessibility-user](docs/personas/accessibility-user.md) ·
[mobile-user](docs/personas/mobile-user.md) ·
[seo-bot](docs/personas/seo-bot.md)

**Maintainer** — [docs/marketplace.md](docs/marketplace.md) ·
[CHANGELOG.md](CHANGELOG.md)

Note that the docs predate this README and describe the intended behaviour of
the action; where they and the [status section](#status-alpha-and-currently-not-installable)
disagree, the status section is what the code and the live repositories
currently do.

---

## License

[MIT](LICENSE) — Copyright 2026 Nucel (nucel.dev)
