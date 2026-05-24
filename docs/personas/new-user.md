# Persona: `new-user`

> **First impressions, CTA clarity, onboarding.**

The `new-user` persona simulates someone landing on your site for the very
first time. No prior context, no assumptions about your jargon, no patience
for a confusing first 30 seconds.

## What it tests

- **Above-the-fold clarity** — is the value proposition obvious? Does the
  hero answer "what is this and what do I do here?".
- **Primary CTA discoverability** — can the user find the "sign up", "start",
  or "buy" button without scrolling, searching, or reading.
- **Onboarding flow** — sign-up, first-action, empty-state copy. Does the
  app coach a brand-new user, or dump them into an empty dashboard?
- **Trust signals** — pricing visibility, security/SOC2 badges, real
  testimonials vs lorem-ipsum.
- **Information scent** — do nav labels match what's actually on the
  destination page? Does "Pricing" go to pricing or to a marketing teaser?

## When to use

- **Marketing sites and landing pages** — this is the persona that catches
  bounce-rate killers.
- **Sign-up funnels** — every step before the "aha" moment.
- **Brand-new product launches** — the rest of your team has been staring at
  the UI for months and can't see the obvious confusion any more.

## When to skip

- Internal tools where every user is already trained.
- Authenticated-only flows that have no public surface (use `power-user`
  instead).
- API documentation sites where the audience is technical (use `seo-bot` +
  `accessibility-user`).

## Sample findings

- "Hero CTA reads 'Get started' but tapping it scrolls to the pricing table,
  not the signup form. Users will think the button is broken."
- "Nav item 'Solutions' opens a megamenu with 18 entries and no visual
  hierarchy. A first-time visitor cannot tell which one applies to them."
- "Pricing page hides the 'Free tier' option below a wall of enterprise
  copy. Bounce risk."

## How to invoke

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    personas: 'new-user'
```
