# Examples

Runnable workflow snippets you can copy into `.github/workflows/` in your own
repository. Each file is a complete, valid workflow — no edits required other
than (a) setting `secrets.ANTHROPIC_API_KEY` and (b) adjusting `npm start` /
`url` if your app doesn't boot on `http://localhost:3000`.

| File | Trigger | What it shows |
|------|---------|---------------|
| [`qa-on-pr.yml`](./.github/workflows/qa-on-pr.yml) | `pull_request` | The simplest setup: build, boot, QA, PR comment. Start here. |
| [`qa-on-deploy.yml`](./.github/workflows/qa-on-deploy.yml) | `workflow_dispatch` + `workflow_run` | Run against a deployed staging URL. No PR comment; artifact + optional Slack notification. |
| [`qa-matrix.yml`](./.github/workflows/qa-matrix.yml) | `pull_request` | Each of the 7 personas runs in its own parallel job with isolated artifacts, with a hard gate on accessibility findings. |

## Picking the right shape

- **One-shot PR run**: use `qa-on-pr.yml`. Fastest, cheapest, one report per PR.
- **Per-persona ownership**: use `qa-matrix.yml`. Lets you fail the build on
  accessibility findings without blocking on SEO, and produces 7 isolated
  reports that can be routed to different reviewers.
- **Post-deploy smoke test**: use `qa-on-deploy.yml`. Runs against staging or
  prod canary on a schedule or after a successful deploy.

See [`docs/personas/`](../docs/personas) for what each persona actually does
and [`docs/inputs-reference.md`](../docs/inputs-reference.md) for the full
input surface.
