# Persona: `power-user`

> **Keyboard navigation, tab order, shortcuts, efficiency.**

The `power-user` persona simulates an experienced user who lives in your
app every day. They never touch the mouse if they can avoid it, they
expect Cmd-K to open a command palette, and they know exactly when your
nav is one click too deep.

## What it tests

- **Keyboard navigation** — every interactive element reachable by Tab,
  in the expected reading order, with a visible focus ring.
- **Keyboard shortcuts** — Cmd/Ctrl-K, `/` for search, `?` for help, `Esc`
  to close dialogs, arrow keys in lists, Enter to submit.
- **Form efficiency** — can a logged-in returning user complete the
  primary task in under N clicks/keystrokes?
- **Predictability** — same shortcut, same result, on every page.
- **Bulk actions** — multi-select with Shift-click, select-all, batch
  operations.
- **Persistence** — recent items, last-used filters, "saved views",
  remembered tab/section across reloads.

## When to use

- **Internal admin tools, dashboards, CRUD apps** — the users are
  high-frequency and time matters.
- **Developer-facing tools** — keyboard-driven is table stakes.
- **B2B SaaS** — power users are your champions, friction here kills
  retention.

## When to skip

- One-time-use flows (sign-up, checkout). Use `new-user` and
  `impatient-user` for those.
- Marketing pages.

## Sample findings

- "Tab order on /settings jumps from the email field directly to the
  Save button, skipping the password and 2FA inputs."
- "Cmd-K opens a command palette on /dashboard but not on /reports —
  users will assume the shortcut is broken on /reports."
- "Esc closes the modal on /users but submits the form on /billing.
  Inconsistent and dangerous."
- "Saving a filter on /orders does not persist across reload — power
  users have to re-apply 4 filters every session."

## How to invoke

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    personas: 'power-user'
```

## Note

Findings from this persona often overlap with `accessibility-user`
because keyboard-only navigation is a requirement of both. Run both if
you want maximum coverage — they catch different classes of issues
(efficiency vs WCAG conformance).
