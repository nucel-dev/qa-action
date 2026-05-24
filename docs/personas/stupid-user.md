# Persona: `stupid-user`

> **Garbage input, XSS, double-clicks, breaking forms.**

The `stupid-user` persona is the destruction tester. It assumes the user
will type emoji into the price field, paste a 50,000-character novel into
the username box, double-click "Submit" three times before the network
roundtrip, and try a script tag because why not. This is the persona that
finds the bugs your unit tests never will.

Despite the name, this is not about insulting users — it's the technical
term used by Nucel QA for adversarial fuzz-style behaviour against forms
and inputs.

## What it tests

- **Input validation** — empty, oversized, whitespace-only, unicode, RTL
  text, emoji, control characters, leading/trailing spaces.
- **XSS surface** — `<script>`, `<img onerror>`, `javascript:` URLs,
  template-injection (`{{7*7}}`) in any field that gets reflected back.
- **Double-submit / race conditions** — rage-clicking submit, navigating
  away mid-request, hitting back-button after submit.
- **Type confusion** — letters in number fields, negative numbers, `Infinity`,
  decimal in integer-only fields.
- **Boundary conditions** — max length minus one, max length plus one,
  exactly zero, exactly one.
- **Copy-paste hazards** — pasting Word smart-quotes, paste of a
  multi-megabyte image into a textarea.

## When to use

- **Any form-heavy app** — checkout, sign-up, profile, comments, search.
- **Multi-step wizards** — anywhere mid-flow cancellation could leave
  orphan rows in the DB.
- **Before a public launch** — this is your last line of defense before
  the internet finds the same bugs.

## When to skip

- Read-only / documentation sites with no user input.
- Marketing sites without a contact form.

## Sample findings

- "Submit button on /checkout fires the POST twice when double-clicked
  within 200ms — produces two orders with the same idempotency key."
- "`<script>alert(1)</script>` in the 'Display name' field is rendered
  verbatim on the user's profile page. Stored XSS."
- "Quantity field accepts negative numbers; cart total goes negative and
  Stripe rejects the payment intent with a confusing error."

## How to invoke

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    personas: 'stupid-user'
```

## Safety note

This persona generates traffic that looks like an attack. Do not run it
against production environments where you have intrusion-detection or WAF
rules that would block / quarantine the runner IP. Use staging or local.
