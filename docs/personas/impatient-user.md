# Persona: `impatient-user`

> **Rage-clicks, cancel mid-flow, race conditions.**

The `impatient-user` persona simulates somebody on a flaky 3G connection
who doesn't believe your loading spinner. They tap the button again. And
again. They hit back as soon as a request feels slow. They close the
modal while it's still animating in. This persona finds the bugs that
hide in your async edges.

## What it tests

- **Rage-clicking** — does double/triple-clicking a submit button fire
  the action multiple times? Does it deduplicate?
- **Cancel mid-flight** — closing a modal, navigating away, or hitting
  back while a request is in flight. Are partial side effects rolled
  back? Are stale responses ignored?
- **Loading-state honesty** — is there a spinner / skeleton / disabled
  state during async work, or does the UI look interactive when it isn't?
- **Optimistic UI failure** — when an optimistic update gets rejected,
  does the UI roll back cleanly or leave the user in an inconsistent
  state?
- **Pagination race** — clicking "next" three times before the first
  page response lands. Does the wrong page render?
- **Re-entrant flows** — opening the same modal twice, starting the
  same wizard while one is in progress.

## When to use

- **Anything with non-trivial network latency** — checkout, file upload,
  AI features, search.
- **Mobile-first apps** — impatience is amplified on small screens.
- **Apps with optimistic UI** — React Query, SWR, Apollo cache mutations.

## When to skip

- Pure static sites with no client-side mutations.
- Synchronous-only flows (no API calls).

## Sample findings

- "Double-tapping 'Pay' on /checkout creates two Stripe charges. No
  idempotency key on the client."
- "Closing the file-upload dialog while the upload is in progress leaves
  a half-uploaded file on the server and a UI that says 'success'."
- "Hitting 'Search' three times in a row renders the first response
  last — older results clobber newer ones."
- "Submitting the form, hitting back, and submitting again from cache
  results in a duplicate row with the same UUID."

## How to invoke

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    personas: 'impatient-user'
```

## Note

To make this persona effective, your app should have enough latency for
race conditions to manifest. Running against `localhost` over loopback
sometimes hides bugs that only appear over real network paths — also run
against staging if you can.
