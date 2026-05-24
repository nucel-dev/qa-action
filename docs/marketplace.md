# Publishing to the GitHub Marketplace

Checklist and reference for getting `nucel-dev/qa-action` listed on the
[GitHub Marketplace](https://github.com/marketplace?type=actions) and
keeping the listing healthy across releases.

This is an internal-facing doc — consumers of the action don't need to
read it. Maintainers do.

---

## Eligibility checklist

GitHub requires every Marketplace action to meet a baseline set of
constraints. Confirm each before submitting:

- [x] Repository is **public**.
- [x] Repository contains an `action.yml` file at the root (we do).
- [x] `action.yml` has `name`, `description`, and `branding` keys.
- [x] `branding.icon` is from the [supported Feather list](https://docs.github.com/en/actions/sharing-automations/creating-actions/metadata-syntax-for-github-actions#branding)
      (we use `shield`).
- [x] `branding.color` is one of `white`, `yellow`, `blue`, `green`,
      `orange`, `red`, `purple`, `gray-dark` (we use `purple`).
- [x] The `name` is unique across the Marketplace (`Nucel QA`).
- [x] A `LICENSE` file is present at the repo root (MIT).
- [x] A `README.md` is present at the repo root and renders correctly.
- [ ] At least one **release** has been published. The Marketplace
      surfaces releases, not commits.
- [ ] Two-factor authentication enabled on the publishing user / org
      (GitHub blocks publishing without it).

---

## Branding

Defined in [`action.yml`](../action.yml):

```yaml
branding:
  icon: 'shield'
  color: 'purple'
```

These two fields drive the colored card you see in the Marketplace
listing. Together they should be visually distinctive — keep the icon
stable across versions to preserve recognition.

If we ever need to change icon/color, do it in a **major-version bump**
(e.g. v2) so existing `@v1` users don't see a surprise rebrand mid-tag.

---

## README requirements

GitHub does not enforce a README schema, but a high-quality Marketplace
listing reliably includes, in this order:

1. **One-line tagline** (we have: "Autonomous AI QA for your CI/CD pipeline.")
2. **What it does** — 3-5 bullet description.
3. **Quick start** — a minimal copy-pasteable workflow that runs in
   under 30 seconds of reading.
4. **Inputs table** — every input with required/default/description.
5. **Outputs table** — every output with description.
6. **Advanced examples** — at least 3 with realistic copy-paste shape.
7. **Requirements** — secrets, runner OS, prerequisites.
8. **License**.

Our [README.md](../README.md) covers all of these. Before every minor
release, eyeball the rendered preview on
`https://github.com/nucel-dev/qa-action` to make sure the snippets still
work and the inputs table matches `action.yml`.

---

## Version tagging

GitHub Marketplace tracks **git tags**, not branches. Two tag conventions
apply:

### Pinned tags (full SemVer)

Every release gets a full `vMAJOR.MINOR.PATCH` tag:

```bash
git tag -a v1.0.0 -m 'v1.0.0'
git tag -a v1.0.1 -m 'v1.0.1'
git tag -a v1.1.0 -m 'v1.1.0'
git push origin v1.0.0 v1.0.1 v1.1.0
```

Users who want absolute determinism pin to these
(`uses: nucel-dev/qa-action@v1.0.0`).

### Floating major tag

Most users will pin to the major (`@v1`). We maintain a **moving** `v1`
tag that points at the latest `v1.x.y`:

```bash
# After cutting v1.0.1:
git tag -fa v1 v1.0.1 -m 'v1 → v1.0.1'
git push origin v1 --force
```

This is the convention every popular action uses
(`actions/checkout@v4`, `actions/setup-node@v4`). Yes, it's a forced
update — that's how the GitHub Actions ecosystem works.

### Major version bumps

`v2` is reserved for **breaking changes**: removing or renaming an
input, changing default behaviour in a non-additive way, changing the
output schema, or any change that would silently break workflows pinned
to `@v1`.

When cutting `v2`:

1. Create the `v2.0.0` tag from `main`.
2. Create a floating `v2` tag.
3. Leave `v1` alone — bug-fixing on the `v1` branch is fine.
4. Update the README to call out the new default.

---

## Version pinning recommendation

We recommend users pin to the floating major tag:

```yaml
uses: nucel-dev/qa-action@v1
```

This trades absolute determinism for automatic bug-fix uptake — most
teams want bug fixes, want minor feature additions, and **don't** want
to see breaking changes without a deliberate `v1 → v2` upgrade.

Users who need bit-for-bit reproducibility (regulated industries,
security-sensitive shops) can pin to a full SHA:

```yaml
uses: nucel-dev/qa-action@a1b2c3d4e5f6...
```

This is the highest assurance — even retagging cannot affect them. The
trade-off is they must manually bump for every bug fix.

For our consumer-facing docs (`README.md`, examples), use `@v1`
everywhere. Mention SHA-pinning in a "Security" section but don't
default to it.

---

## Release checklist (per release)

Per minor / patch release:

1. Update [`CHANGELOG.md`](../CHANGELOG.md) — move `[Unreleased]` items
   under a new `[X.Y.Z]` header. Add a new empty `[Unreleased]` section.
2. Bump `package.json` `version` to `X.Y.Z`. Run `npm install` (no
   args) to refresh the lockfile.
3. Commit on `main`:
   ```bash
   git commit -am 'release: vX.Y.Z'
   ```
4. Tag and push:
   ```bash
   git tag -a vX.Y.Z -m 'vX.Y.Z'
   git push origin main vX.Y.Z
   ```
5. Update the floating major tag:
   ```bash
   git tag -fa vX vX.Y.Z -m "vX → vX.Y.Z"
   git push origin vX --force
   ```
6. Create the GitHub Release from the tag (`gh release create vX.Y.Z`).
   GitHub prompts you to also publish to Marketplace — say yes. Use the
   changelog entry as the release notes.
7. Smoke-test by running [`.github/workflows/test.yml`](../.github/workflows/test.yml)
   on the new tag against the sandbox repo.

Per major release: also bump the `v` floating tag policy as described
above and add a migration section to the README.

---

## Marketplace listing fields

Set these in the **Publish to GitHub Marketplace** flow on the release
page:

| Field | Value |
|-------|-------|
| Primary category | **Code quality** |
| Secondary category | **Testing** |
| Featured action | (only if invited by GitHub) |

Tags / search keywords (set in the release flow):
`qa`, `testing`, `accessibility`, `seo`, `ai`, `claude`, `mcp`,
`browser-testing`, `e2e`.

---

## What not to do

- **Don't** delete tags. Some user out there has pinned to that exact
  version; deleting breaks their build. Yank the release notes instead.
- **Don't** rebase main after a tag has been pushed — the SHA the tag
  points at will diverge from the branch.
- **Don't** publish prerelease (`v1.1.0-beta.1`) tags to the floating
  major (`v1`). Keep prereleases off the moving tag entirely.
- **Don't** change `name` or `branding` casually — the Marketplace card
  is a brand identity.
