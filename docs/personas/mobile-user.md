# Persona: `mobile-user`

> **Touch targets, overflow, responsive layout.**

The `mobile-user` persona simulates a user on a small touch screen — narrow
viewport, thumb-driven, often one-handed. It is the persona that catches
layouts that look great on a 27" monitor and fall apart on an iPhone SE.

## What it tests

- **Viewport behaviour** — `<meta name="viewport">` set correctly, no
  horizontal scroll on narrow widths.
- **Touch target size** — interactive elements are at least 44x44 CSS
  pixels (Apple HIG) / 48x48 (Material).
- **Tap target spacing** — adjacent buttons not so close that fat-finger
  taps hit the wrong one.
- **Overflow handling** — long words / URLs don't push content outside
  the viewport.
- **Modal & sheet behaviour** — bottom sheets accessible, modals
  scrollable when content exceeds viewport height.
- **Hover-only affordances** — anything that only reveals on hover is
  unreachable on touch.
- **Image scaling** — `max-width: 100%`, no fixed pixel widths breaking
  layout.
- **Font readability** — body text at least 16px to avoid iOS Safari's
  zoom-on-focus on form fields.
- **Mobile-specific keyboards** — `<input type="email|tel|number">`
  used where appropriate.

## When to use

- **Any consumer-facing product** — over half of all web traffic is
  mobile.
- **E-commerce, social, content sites** — mobile is the dominant
  device.
- **Anywhere you have analytics showing mobile traffic > 10%**.

## When to skip

- Internal tools used exclusively on desktop.
- Admin dashboards explicitly desktop-only (but document that decision).

## Sample findings

- "Primary CTA on /signup is 32x28 — below 44x44 minimum. Thumb taps
  miss and hit the 'Login' link beneath it."
- "Hamburger menu icon overlaps the cart icon at 360px viewport; the
  two are touching."
- "Product description text is 13px on /products/:id — iOS Safari zooms
  the viewport on focus to compensate, which jankily breaks layout."
- "Hover-only tooltip exposing the discount code is invisible on touch.
  Mobile users will never discover the discount."
- "Phone-number input uses `type='text'` instead of `type='tel'` —
  mobile keyboards show the wrong layout."

## How to invoke

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    personas: 'mobile-user'
```

## Note

This persona drives a desktop Chrome instance with a narrow viewport
emulation. It does not test on real iOS Safari, where some behaviours
(scroll bounce, viewport meta quirks, momentum scrolling) differ. Pair
with real-device smoke testing before launch.
