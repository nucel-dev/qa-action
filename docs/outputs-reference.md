# Outputs reference

Every output defined in [`action.yml`](../action.yml), with a worked
downstream-step example for each.

| Output | Type | Where it's set |
|--------|------|----------------|
| [`report`](#report) | string (markdown) | `runner-script: setOutput('report', ...)` |
| [`report-path`](#report-path) | string (filesystem path) | `runner-script: setOutput('report_path', ...)` |
| [`findings-count`](#findings-count) | string (integer) | `runner-script: setOutput('findings_count', ...)` |

> Outputs are written via `GITHUB_OUTPUT` using the multiline-delimiter
> syntax — they are safe to read with standard `${{ steps.<id>.outputs.<name> }}`
> expressions even when the report contains newlines.

---

## `report`

The full QA report in markdown, extracted from the `<report>…</report>`
tags in Claude's final assistant turn. If those tags are missing, the
runner falls back to "everything after the first markdown heading".

This is the **same content** that gets posted as the PR comment when
`comment-on-pr: 'true'`.

### Example — render report in a job summary

```yaml
- id: qa
  uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Write to job summary
  env:
    REPORT: ${{ steps.qa.outputs.report }}
  run: |
    {
      echo "## Nucel QA report"
      echo ""
      echo "$REPORT"
    } >> "$GITHUB_STEP_SUMMARY"
```

### Example — fail the build if "Critical" appears in the report

```yaml
- id: qa
  uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Gate on critical findings
  env:
    REPORT: ${{ steps.qa.outputs.report }}
  run: |
    if printf '%s' "$REPORT" | grep -qiE '^\s*\|?\s*critical\s*\|'; then
      echo "::error::Critical findings detected"
      exit 1
    fi
```

> The report is large and can be tens of KB. GitHub Actions output values
> are capped at 1 MB total per step — usually fine, but trim or upload as
> a file (see [`report-path`](#report-path)) if you ever hit the limit.

---

## `report-path`

Absolute path to the markdown report file on the runner filesystem.
Always `/tmp/nucel-qa-report.md` (fixed in `action.yml`). Useful for
uploading as an artifact, attaching to a release, or copying into a
build directory.

### Example — upload as a build artifact

```yaml
- id: qa
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
    if-no-files-found: warn
```

### Example — attach to a draft release

```yaml
- name: Create draft release
  id: release
  uses: actions/create-release@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    tag_name: ${{ github.ref_name }}
    release_name: ${{ github.ref_name }}
    draft: true

- id: qa
  uses: nucel-dev/qa-action@v1
  with:
    url: 'https://staging.example.com'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Attach QA report to release
  uses: actions/upload-release-asset@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    upload_url: ${{ steps.release.outputs.upload_url }}
    asset_path: ${{ steps.qa.outputs.report-path }}
    asset_name: qa-report.md
    asset_content_type: text/markdown
```

### Example — copy into a docs branch

```yaml
- id: qa
  uses: nucel-dev/qa-action@v1
  with:
    url: 'https://staging.example.com'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Commit report to docs branch
  env:
    REPORT_PATH: ${{ steps.qa.outputs.report-path }}
  run: |
    git fetch origin gh-pages
    git worktree add /tmp/gh-pages gh-pages
    cp "$REPORT_PATH" /tmp/gh-pages/latest-qa.md
    cd /tmp/gh-pages
    git add latest-qa.md
    git -c user.name=qa-bot -c user.email=qa@nucel.dev commit -m 'docs: latest QA report'
    git push origin gh-pages
```

---

## `findings-count`

A heuristic integer count of severity-tagged rows in the report. The
runner script (`scripts/run-qa.mjs`) computes it with:

```js
(report.match(/^\s*[|]?\s*(critical|high|medium|low)\s*[|]/gim) ?? []).length
```

I.e. it counts table rows whose first column is a severity keyword. This
is intentionally crude — the goal is to surface "how many findings did
QA log?" as a single scalar for gating and observability, not to
classify them.

### Example — fail the build over a threshold

```yaml
- id: qa
  uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Enforce finding budget
  env:
    FINDINGS: ${{ steps.qa.outputs.findings-count }}
    BUDGET: 5
  run: |
    echo "Findings: $FINDINGS (budget: $BUDGET)"
    if [ "${FINDINGS:-0}" -gt "$BUDGET" ]; then
      echo "::error::QA findings ($FINDINGS) exceed budget ($BUDGET)"
      exit 1
    fi
```

### Example — emit as a metric to Datadog

```yaml
- id: qa
  uses: nucel-dev/qa-action@v1
  with:
    url: 'https://staging.example.com'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Emit metric
  env:
    DD_API_KEY: ${{ secrets.DD_API_KEY }}
    FINDINGS: ${{ steps.qa.outputs.findings-count }}
  run: |
    ts=$(date +%s)
    payload=$(jq -n --argjson v "${FINDINGS:-0}" --argjson ts "$ts" \
      '{series: [{metric: "qa.findings.count", points: [[$ts, $v]], type: "gauge"}]}')
    curl -fsSL -X POST "https://api.datadoghq.com/api/v1/series" \
      -H "DD-API-KEY: $DD_API_KEY" \
      -H 'Content-Type: application/json' \
      --data "$payload"
```

### Example — comment a one-line summary on the PR

```yaml
- id: qa
  uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    comment-on-pr: 'false'   # we'll post a custom comment instead

- uses: actions/github-script@v7
  with:
    script: |
      const findings = '${{ steps.qa.outputs.findings-count }}';
      const emoji = parseInt(findings, 10) === 0 ? ':white_check_mark:' : ':warning:';
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body: `${emoji} Nucel QA logged **${findings}** findings.`,
      });
```

---

## Notes on multi-step composition

All three outputs are set in the same step (`Run QA session` →
`id: qa-run` inside the composite). When you reference the composite
from a calling workflow, the `id` you assign in `with: id:` is the one
to use:

```yaml
- id: qa                      # this is the id you read with steps.qa.outputs.*
  uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- run: echo "${{ steps.qa.outputs.findings-count }}"   # not steps.qa-run
```

Outputs are only set after the QA session completes successfully. If
the script exits non-zero before generating a report, downstream steps
will see empty strings — guard with `${{ steps.qa.outputs.findings-count
|| '0' }}` if you need a default.
