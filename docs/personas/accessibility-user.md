# Persona: `accessibility-user`

> **ARIA, headings, landmarks, keyboard-only, focus management.**

The `accessibility-user` persona simulates a user navigating with assistive
technology (screen reader, keyboard-only, voice control) or with motor /
visual impairments. It checks the structural and semantic shape of your
HTML against WCAG-style expectations.

This is the persona that turns "looks accessible" into "is accessible".

## What it tests

- **Heading structure** — exactly one `<h1>`, no skipped levels, headings
  describe sections.
- **Landmarks** — `<header>`, `<nav>`, `<main>`, `<footer>` present and
  used correctly; one `<main>` per page.
- **ARIA correctness** — labels point at existing ids, roles are valid
  for the element, no redundant `role="button"` on a `<button>`.
- **Focus management** — focus is moved into modals on open, returned to
  the trigger on close, never trapped where escape doesn't work.
- **Visible focus indicators** — every interactive element has a visible
  focus ring with sufficient contrast.
- **Alt text** — every meaningful image has descriptive alt; decorative
  images have empty `alt=""`.
- **Form labels** — every input has an associated `<label>` or
  `aria-labelledby`.
- **Color contrast** — at-a-glance check on text vs background.
- **Keyboard-only operability** — every interaction reachable and
  triggerable without a mouse.
- **Screen-reader announcements** — `aria-live` regions for async
  status, error messages associated with the right field.

## When to use

- **Always, if your product has any consumer or B2B users with a
  compliance obligation** (WCAG 2.1 AA is the de-facto floor in most
  jurisdictions).
- **Before launching public-facing pages**.
- **Government, healthcare, finance, education** — legal exposure if
  you skip this.

## When to skip

- Honestly, almost never. The cost of running this persona is low and
  the findings are nearly always actionable.
- Internal-only debug pages with a known single user.

## Sample findings

- "/checkout has no `<h1>`; screen readers will announce the page as
  untitled."
- "Submit button has `aria-label='Submit'` but is also inside a
  `<form aria-labelledby='form-title'>` — the label is redundant and
  drowns out the form context."
- "Closing the cart modal on /products returns focus to `<body>`
  instead of the trigger button — keyboard users lose their place."
- "Body text `#999` on `#fff` background is 2.85:1 — fails WCAG AA
  (requires 4.5:1)."

## How to invoke

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    personas: 'accessibility-user'
```

## Limits

This persona is a useful first pass and catches the long tail of
structural / semantic issues that humans miss. It is **not** a
replacement for:

- Manual screen-reader testing (VoiceOver, NVDA, JAWS).
- An accessibility audit by a specialist.
- WCAG conformance certification.

Treat the report as a triage list, not a compliance document.
