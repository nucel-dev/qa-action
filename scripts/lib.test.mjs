/**
 * Unit tests for scripts/lib.mjs — runs on the Node built-in test runner.
 *
 *   node --test scripts/lib.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePersonas,
  extractReport,
  countFindings,
  evaluateSeverityGate,
  formatOutputEntry,
  safeDelimiter,
  SEVERITY_ORDER,
} from './lib.mjs';

// ---------------------------------------------------------------------------
// parsePersonas
// ---------------------------------------------------------------------------
test('parsePersonas: empty/undefined → []', () => {
  assert.deepEqual(parsePersonas(''), []);
  assert.deepEqual(parsePersonas(undefined), []);
  assert.deepEqual(parsePersonas('   '), []);
});

test('parsePersonas: trims, splits, drops empties', () => {
  assert.deepEqual(parsePersonas('new-user, seo-bot ,, power-user'), [
    'new-user',
    'seo-bot',
    'power-user',
  ]);
});

// ---------------------------------------------------------------------------
// extractReport
// ---------------------------------------------------------------------------
test('extractReport: pulls content from <report> tags', () => {
  const text = 'blah blah\n<report>\n# QA Report\nbody\n</report>\ntrailing';
  assert.equal(extractReport(text), '# QA Report\nbody');
});

test('extractReport: prefers the LAST report block (final over draft)', () => {
  const text =
    '<report>draft</report> middle <report>\n# Final\nreal\n</report>';
  assert.equal(extractReport(text), '# Final\nreal');
});

test('extractReport: ignores empty report blocks', () => {
  const text = '<report>real one</report><report>   </report>';
  assert.equal(extractReport(text), 'real one');
});

test('extractReport: falls back to first markdown heading', () => {
  const text = 'preamble noise\n# Heading\nstuff below';
  assert.equal(extractReport(text), '# Heading\nstuff below');
});

test('extractReport: empty input → empty string', () => {
  assert.equal(extractReport(''), '');
  assert.equal(extractReport(undefined), '');
});

// ---------------------------------------------------------------------------
// countFindings
// ---------------------------------------------------------------------------
test('countFindings: empty report → all zero', () => {
  const c = countFindings('');
  assert.equal(c.total, 0);
  assert.deepEqual(c.bySeverity, { critical: 0, high: 0, medium: 0, low: 0 });
});

test('countFindings: table rows', () => {
  const report = [
    '| Severity | Finding |',
    '|----------|---------|',
    '| critical | XSS in search |',
    '| High | Missing alt text |',
    '| medium | Slow load |',
    '| low | Minor copy |',
  ].join('\n');
  const c = countFindings(report);
  assert.deepEqual(c.bySeverity, { critical: 1, high: 1, medium: 1, low: 1 });
  assert.equal(c.total, 4);
});

test('countFindings: list-style findings', () => {
  const report = [
    '- critical: data loss',
    '* HIGH — broken auth',
    '- low: typo',
  ].join('\n');
  const c = countFindings(report);
  assert.equal(c.bySeverity.critical, 1);
  assert.equal(c.bySeverity.high, 1);
  assert.equal(c.bySeverity.low, 1);
  assert.equal(c.total, 3);
});

test('countFindings: does not match severity words mid-sentence', () => {
  const report = 'This page has a critical mass of users and high traffic.';
  const c = countFindings(report);
  assert.equal(c.total, 0);
});

// ---------------------------------------------------------------------------
// evaluateSeverityGate
// ---------------------------------------------------------------------------
const counts = (o) => ({
  total: Object.values(o).reduce((a, b) => a + b, 0),
  bySeverity: { critical: 0, high: 0, medium: 0, low: 0, ...o },
});

test('gate: none → never fails', () => {
  const r = evaluateSeverityGate(counts({ critical: 5 }), 'none');
  assert.equal(r.shouldFail, false);
});

test('gate: empty string treated as disabled', () => {
  assert.equal(evaluateSeverityGate(counts({ critical: 5 }), '').shouldFail, false);
});

test('gate: critical threshold fails on critical only', () => {
  assert.equal(evaluateSeverityGate(counts({ critical: 1 }), 'critical').shouldFail, true);
  assert.equal(evaluateSeverityGate(counts({ high: 3 }), 'critical').shouldFail, false);
});

test('gate: high threshold fails on high AND critical', () => {
  assert.equal(evaluateSeverityGate(counts({ high: 1 }), 'high').shouldFail, true);
  assert.equal(evaluateSeverityGate(counts({ critical: 1 }), 'high').shouldFail, true);
  assert.equal(evaluateSeverityGate(counts({ medium: 9 }), 'high').shouldFail, false);
});

test('gate: medium threshold fails on medium+ but not low', () => {
  assert.equal(evaluateSeverityGate(counts({ medium: 1 }), 'medium').shouldFail, true);
  assert.equal(evaluateSeverityGate(counts({ low: 9 }), 'medium').shouldFail, false);
});

test('gate: low threshold fails on any finding', () => {
  assert.equal(evaluateSeverityGate(counts({ low: 1 }), 'low').shouldFail, true);
  assert.equal(evaluateSeverityGate(counts({}), 'low').shouldFail, false);
});

test('gate: case-insensitive threshold', () => {
  assert.equal(evaluateSeverityGate(counts({ critical: 1 }), 'CRITICAL').shouldFail, true);
});

test('gate: unknown threshold does not fail but is flagged', () => {
  const r = evaluateSeverityGate(counts({ critical: 9 }), 'bogus');
  assert.equal(r.shouldFail, false);
  assert.match(r.reason, /unknown/);
});

test('gate: reason includes the matched severities', () => {
  const r = evaluateSeverityGate(counts({ critical: 2, high: 1 }), 'high');
  assert.match(r.reason, /critical=2/);
  assert.match(r.reason, /high=1/);
});

// ---------------------------------------------------------------------------
// formatOutputEntry / safeDelimiter
// ---------------------------------------------------------------------------
test('formatOutputEntry: well-formed heredoc', () => {
  const entry = formatOutputEntry('report', 'hello\nworld');
  assert.match(entry, /^report<<ghadelimiter_\d+\nhello\nworld\nghadelimiter_\d+\n$/);
});

test('safeDelimiter: never collides with payload', () => {
  const base = `ghadelimiter_${Date.now()}`;
  // payload that contains the naive delimiter; safeDelimiter must avoid it.
  const payload = `prefix ${base} suffix`;
  const d = safeDelimiter(payload);
  assert.equal(payload.includes(d), false);
});

test('formatOutputEntry: handles null/undefined value', () => {
  assert.match(formatOutputEntry('x', undefined), /^x<<.*\n\n.*\n$/s);
});

// ---------------------------------------------------------------------------
// SEVERITY_ORDER sanity
// ---------------------------------------------------------------------------
test('SEVERITY_ORDER is low→high', () => {
  assert.deepEqual(SEVERITY_ORDER, ['low', 'medium', 'high', 'critical']);
});
