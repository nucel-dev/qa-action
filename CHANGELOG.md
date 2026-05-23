# Changelog

All notable changes to `nucel-dev/qa-action` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `docs/configuration.md` — full reference for every input and output.
- `docs/troubleshooting.md` — common failure modes and fixes.
- `docs/integration-with-nucel-qa.md` — architecture diagram and version
  compatibility matrix between the action, `nucel-qa`, and the SDKs.
- `CHANGELOG.md` (this file).

### Notes
- No code, `action.yml`, or `package.json` changes were made in this entry
  — documentation-only update.

---

## [1.0.0] — 2026-04-30

### Added
- Initial release of `nucel-dev/qa-action@v1`.
- Composite GitHub Action that:
  - Downloads the correct `nucel-qa` binary for the runner OS/arch from
    `nucel-dev/nucel-qa` GitHub Releases, with SHA-256 checksum
    verification.
  - Starts `nucel-qa` as a headless MCP server on `127.0.0.1:18080`.
  - Drives a Claude agent loop (`@anthropic-ai/sdk` ^0.39.0,
    `@modelcontextprotocol/sdk` ^1.10.0) through a full QA session
    covering 7 behavioral personas:
    `new-user`, `stupid-user`, `power-user`, `impatient-user`,
    `accessibility-user`, `mobile-user`, `seo-bot`.
  - Writes a markdown report to `/tmp/nucel-qa-report.md` and exposes it
    via the `report`, `report-path`, and `findings-count` outputs.
  - Optionally posts the report as a PR comment when the workflow is
    triggered by `pull_request`.
- Inputs: `url` (required), `anthropic-api-key` (required), `personas`,
  `chrome-flags`, `comment-on-pr`, `version`, `model`.
- Marketplace branding (`icon: shield`, `color: purple`).
- MIT license.

### Internal
- Pinned `actions/setup-node@v4` (Node 20) and `actions/github-script@v7`
  for the composite steps.

[Unreleased]: https://github.com/nucel-dev/qa-action/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nucel-dev/qa-action/releases/tag/v1.0.0
