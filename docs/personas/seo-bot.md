# Persona: `seo-bot`

> **Meta tags, Open Graph, headings, canonical, alt text.**

The `seo-bot` persona inspects pages the way Googlebot, Bingbot, and the
various social-media link unfurlers do: it reads `<head>`, structural
markup, link metadata, and image attributes — not the visible UX.

This is the persona that prevents the embarrassing "we shipped a redesign
and SEO traffic dropped 40%" scenario.

## What it tests

- **Title and description** — every page has a unique `<title>` and
  `<meta name="description">`, neither truncated by Google's display
  limits.
- **Open Graph** — `og:title`, `og:description`, `og:image`,
  `og:url`, `og:type` present and consistent. Image dimensions hit
  social-platform recommendations (1200x630).
- **Twitter Card** — `twitter:card`, `twitter:title`,
  `twitter:description`, `twitter:image`.
- **Canonical URL** — `<link rel="canonical">` present and pointing at
  the canonical version of the page (handles tracking-parameter
  duplication).
- **Robots & indexability** — no rogue `noindex` on pages that should
  be public; `robots.txt` doesn't block important paths.
- **Structured data / JSON-LD** — schema.org markup present where
  appropriate (Product, Article, Organization, BreadcrumbList) and
  valid.
- **Heading hierarchy** — exactly one `<h1>`, headings describe page
  content (overlaps with `accessibility-user`).
- **Image alt text** — every meaningful image has descriptive alt
  (also overlaps with a11y).
- **Internal linking** — anchor text is descriptive, no "click here"
  links.
- **Hreflang** — present and correct on multilingual sites.
- **Sitemap & robots references** — sitemap.xml linked from robots.txt.

## When to use

- **Public marketing sites, blogs, content sites, e-commerce product
  pages** — anywhere organic search matters.
- **Before any major redesign or migration** — diff the report
  pre/post to catch regressions.
- **Whenever the marketing team complains about traffic drops**.

## When to skip

- Authenticated-only apps (admin tools, SaaS dashboards, intranets) —
  search engines can't see these anyway.
- Internal API documentation behind auth.

## Sample findings

- "/blog/example has no `og:image` — social previews will fall back to
  a 1x1 favicon."
- "Three product pages share the same `<title>` ('Product') — Google
  will pick one canonically and bury the others."
- "Canonical URL on /products/widget points at /products/widget?utm=...
  — locks the canonical to a tracking parameter."
- "Hero image is rendered as a CSS background — invisible to image
  search and missing alt text entirely."
- "JSON-LD Product schema has `price` as a string ('$49.99') instead of
  a number — Google Search Console will flag this as invalid."

## How to invoke

```yaml
- uses: nucel-dev/qa-action@v1
  with:
    url: 'http://localhost:3000'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    personas: 'seo-bot'
```

## Note

The `seo-bot` persona inspects the rendered DOM (after JS execution),
which is what modern crawlers do. If your app is rendered fully
client-side and depends on JS for `<title>` / meta tag injection,
findings here reflect what crawlers actually see — which may differ
from what older link-unfurlers (e.g. Slack's earlier link previews)
fetch from raw HTML.

Pair with `curl -A "Googlebot" https://...` or Google's Rich Results
Test for a second opinion.
