/**
 * Pure, side-effect-free helpers for the Nucel QA action runner.
 *
 * Kept separate from run-qa.mjs so they can be unit-tested without a network,
 * an MCP server, or the Anthropic API.
 */

/**
 * Parse a comma-separated persona list into a clean array.
 * Empty / whitespace-only input → [] (meaning "all personas").
 *
 * @param {string} raw
 * @returns {string[]}
 */
export function parsePersonas(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Extract the QA report markdown from accumulated model output.
 *
 * Prefers the LAST <report>…</report> block (the model may emit a draft and
 * then a final one). Falls back to everything from the first markdown heading,
 * then to the trimmed text.
 *
 * @param {string} text
 * @returns {string}
 */
export function extractReport(text) {
  if (!text) return '';

  // Match all <report>…</report> blocks; keep the last non-empty one.
  const blocks = [...text.matchAll(/<report>([\s\S]*?)<\/report>/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (blocks.length > 0) return blocks[blocks.length - 1];

  // Fallback: from the first markdown heading onward.
  const headingMatch = text.match(/^#[^\n]*/m);
  if (headingMatch) return text.slice(headingMatch.index).trim();

  return text.trim();
}

/** Severity levels, ordered low → high. */
export const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical'];

/**
 * Count findings per severity from a markdown report.
 *
 * Heuristic: matches table rows / list items whose first cell or token is a
 * known severity word (case-insensitive). Returns a map plus a total.
 *
 * @param {string} report
 * @returns {{ total: number, bySeverity: Record<string, number> }}
 */
export function countFindings(report) {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  if (!report) return { total: 0, bySeverity };

  for (const line of report.split('\n')) {
    // Match "| critical |", "- critical:", "* HIGH —", "critical:" at line start.
    const m = line.match(
      /^\s*[|*-]?\s*\**\s*(critical|high|medium|low)\b\s*\**\s*[|:—-]/i,
    );
    if (m) {
      const sev = m[1].toLowerCase();
      bySeverity[sev] += 1;
    }
  }

  const total =
    bySeverity.critical + bySeverity.high + bySeverity.medium + bySeverity.low;
  return { total, bySeverity };
}

/**
 * Decide whether the QA findings should fail the workflow.
 *
 * @param {{total:number, bySeverity:Record<string,number>}} counts
 * @param {string} failOn  — severity threshold ("none" disables the gate).
 * @returns {{ shouldFail: boolean, reason: string }}
 */
export function evaluateSeverityGate(counts, failOn) {
  const threshold = String(failOn || 'none').trim().toLowerCase();
  if (threshold === 'none' || threshold === '') {
    return { shouldFail: false, reason: 'severity gate disabled (fail-on-severity: none)' };
  }

  const idx = SEVERITY_ORDER.indexOf(threshold);
  if (idx === -1) {
    // Unknown threshold → do not fail, but flag it.
    return {
      shouldFail: false,
      reason: `unknown fail-on-severity value "${failOn}" — gate skipped`,
    };
  }

  // Sum findings at or above the threshold.
  const gated = SEVERITY_ORDER.slice(idx);
  const matched = gated.filter((s) => (counts.bySeverity[s] || 0) > 0);
  const failingCount = gated.reduce((n, s) => n + (counts.bySeverity[s] || 0), 0);

  if (failingCount > 0) {
    return {
      shouldFail: true,
      reason: `${failingCount} finding(s) at or above "${threshold}" (${matched
        .map((s) => `${s}=${counts.bySeverity[s]}`)
        .join(', ')})`,
    };
  }
  return {
    shouldFail: false,
    reason: `no findings at or above "${threshold}"`,
  };
}

/**
 * Produce a delimiter that is guaranteed not to appear in the value, so the
 * GitHub Actions multiline-output heredoc cannot be broken (or injected) by
 * report content.
 *
 * @param {string} value
 * @returns {string}
 */
export function safeDelimiter(value) {
  let delimiter = `ghadelimiter_${Date.now()}`;
  // Extremely unlikely, but guarantee uniqueness against the payload.
  while (String(value).includes(delimiter)) {
    delimiter += Math.random().toString(36).slice(2, 8);
  }
  return delimiter;
}

/**
 * Format a single GitHub Actions multiline output entry.
 *
 * @param {string} name
 * @param {string} value
 * @returns {string}
 */
export function formatOutputEntry(name, value) {
  const v = String(value ?? '');
  const delimiter = safeDelimiter(v);
  return `${name}<<${delimiter}\n${v}\n${delimiter}\n`;
}
