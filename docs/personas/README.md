# Personas

Nucel QA ships with 7 behavioral personas. Each one models a different
class of user and surfaces a different class of bug. By default the action
runs all 7; you can scope down with the `personas:` input.

| Persona | Focus | Page |
|---------|-------|------|
| `new-user` | First impressions, CTA clarity, onboarding | [new-user.md](./new-user.md) |
| `stupid-user` | Garbage input, XSS, double-clicks, breaking forms | [stupid-user.md](./stupid-user.md) |
| `power-user` | Keyboard nav, tab order, shortcuts, efficiency | [power-user.md](./power-user.md) |
| `impatient-user` | Rage-clicks, cancel mid-flow, race conditions | [impatient-user.md](./impatient-user.md) |
| `accessibility-user` | ARIA, headings, landmarks, keyboard-only, focus | [accessibility-user.md](./accessibility-user.md) |
| `mobile-user` | Touch targets, overflow, responsive layout | [mobile-user.md](./mobile-user.md) |
| `seo-bot` | Meta tags, OG, headings, canonical, alt text | [seo-bot.md](./seo-bot.md) |

## Picking a subset

If you want to keep CI cost low, the **minimum useful set** for most
public-facing apps is:

```yaml
personas: 'new-user,accessibility-user,seo-bot'
```

For B2B / internal tools where there's no SEO surface and onboarding is
out-of-app:

```yaml
personas: 'power-user,accessibility-user,stupid-user'
```

For pure-content sites (blog, marketing) where there's no form to break:

```yaml
personas: 'new-user,seo-bot,accessibility-user,mobile-user'
```

## Combining personas

Many findings live in the seam between two personas:

- `power-user` + `accessibility-user` → keyboard-driven flows + WCAG
  conformance. Run both for any internal tool.
- `impatient-user` + `stupid-user` → adversarial input + adversarial
  timing. Run both before any public launch with a money path.
- `mobile-user` + `accessibility-user` → mobile a11y is its own
  discipline.

## Per-persona ownership

If different teams own different concerns, route per-persona artifacts
to per-team channels. See [`examples/.github/workflows/qa-matrix.yml`](../../examples/.github/workflows/qa-matrix.yml)
for a working setup.
