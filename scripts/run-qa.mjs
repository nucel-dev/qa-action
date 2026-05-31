#!/usr/bin/env node
/**
 * Nucel QA Action — QA session runner
 *
 * Connects to a running nucel-qa MCP server, drives a Claude agent through
 * a full QA session, and writes the markdown report to disk.
 *
 * Environment variables (set by action.yml):
 *   ANTHROPIC_API_KEY      — required
 *   QA_URL                 — target URL to test
 *   QA_PERSONAS            — comma-separated personas (empty = all)
 *   QA_MODEL               — Claude model ID
 *   NUCEL_QA_SERVER_URL    — MCP server URL (http://127.0.0.1:18080/mcp)
 *   QA_REPORT_OUTPUT       — path to write the markdown report
 *   GITHUB_OUTPUT          — set by GitHub Actions runner
 */

import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import fs from 'fs';
import {
  parsePersonas,
  extractReport,
  countFindings,
  evaluateSeverityGate,
  formatOutputEntry,
} from './lib.mjs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const {
  ANTHROPIC_API_KEY,
  QA_URL,
  QA_PERSONAS = '',
  QA_MODEL = 'claude-opus-4-6',
  NUCEL_QA_SERVER_URL = 'http://127.0.0.1:18080/mcp',
  QA_REPORT_OUTPUT = '/tmp/nucel-qa-report.md',
  QA_FAIL_ON_SEVERITY = 'none',
  GITHUB_OUTPUT,
} = process.env;

if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set');
  process.exit(1);
}

if (!QA_URL) {
  console.error('Error: QA_URL is not set');
  process.exit(1);
}

// Validate QA_URL is a real http(s) URL early — a bad URL otherwise surfaces as
// an opaque agent failure deep in the session.
try {
  const parsed = new URL(QA_URL);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`unsupported protocol "${parsed.protocol}"`);
  }
} catch (err) {
  console.error(`Error: QA_URL is not a valid http(s) URL: ${QA_URL} (${err.message})`);
  process.exit(1);
}

const personas = parsePersonas(QA_PERSONAS);

// ---------------------------------------------------------------------------
// MCP client setup
// ---------------------------------------------------------------------------
async function connectMcp() {
  const client = new Client({ name: 'nucel-qa-action', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(NUCEL_QA_SERVER_URL));

  console.log(`Connecting to nucel-qa MCP server at ${NUCEL_QA_SERVER_URL}...`);
  await client.connect(transport);
  console.log('Connected to nucel-qa MCP server.');

  return client;
}

// ---------------------------------------------------------------------------
// Convert MCP tools → Anthropic tool format
// ---------------------------------------------------------------------------
function toAnthropicTools(mcpTools) {
  return mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema ?? { type: 'object', properties: {} },
  }));
}

// ---------------------------------------------------------------------------
// Call an MCP tool and return the text content
// ---------------------------------------------------------------------------
async function callMcpTool(client, name, args) {
  console.log(`  → ${name}(${JSON.stringify(args ?? {})})`);
  try {
    const result = await client.callTool({ name, arguments: args ?? {} });
    const texts = (result.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    if (texts.length > 500) {
      console.log(`     ← ${texts.slice(0, 500)}…`);
    } else {
      console.log(`     ← ${texts}`);
    }
    return texts;
  } catch (err) {
    const errMsg = `Error calling ${name}: ${err.message}`;
    console.error(`     ✗ ${errMsg}`);
    return errMsg;
  }
}

// ---------------------------------------------------------------------------
// Build the system + user prompts
// ---------------------------------------------------------------------------
function buildPrompt() {
  const personaInstruction =
    personas.length > 0
      ? `Test using only these personas: ${personas.join(', ')}.`
      : 'Test using all available personas.';

  const system = `You are an autonomous QA engineer running inside a CI/CD pipeline. \
Your job is to thoroughly test the given web application, discover its pages and features, \
test systematically with behavioral personas, log all findings, and produce a concise markdown report. \
Be methodical. If a tool call fails, note the error and continue. \
Always end by calling qa_generate_report and qa_end_session.`;

  const user = `Run a full QA session against: ${QA_URL}

${personaInstruction}

Follow this exact sequence:
1. qa_start_session — url="${QA_URL}", name="CI QA Run"
2. Explore the app: navigate, take snapshots, register pages and features
3. qa_mark_discovery_complete
4. qa_run_personas_parallel — to run all personas across discovered pages
5. qa_generate_report — IMPORTANT: save the full markdown output
6. qa_end_session

When you have the report markdown from qa_generate_report, output it VERBATIM inside <report>…</report> tags.
Do not truncate or summarise — the full markdown must appear between the tags.`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// Agentic loop
// ---------------------------------------------------------------------------
async function runAgentLoop(anthropic, mcpClient, tools) {
  const { system, user } = buildPrompt();
  const messages = [{ role: 'user', content: user }];

  // Accumulate ALL assistant text across turns. The <report> block may be
  // emitted in a turn that still ends in tool_use (e.g. before qa_end_session),
  // so we must not rely solely on the final end_turn message.
  const transcript = [];

  let iteration = 0;
  const MAX_ITERATIONS = 80; // safety cap

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n[iteration ${iteration}] Calling Claude...`);

    const response = await anthropic.messages.create({
      model: QA_MODEL,
      max_tokens: 16384,
      system,
      tools,
      messages,
    });

    // Append assistant turn
    messages.push({ role: 'assistant', content: response.content });

    console.log(`  stop_reason: ${response.stop_reason}`);

    // Collect every text block from this turn into the running transcript.
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        transcript.push(block.text);
        console.log(`  Claude: ${block.text.slice(0, 300)}${block.text.length > 300 ? '…' : ''}`);
      }
    }

    if (response.stop_reason === 'end_turn') {
      return transcript.join('\n');
    }

    if (response.stop_reason !== 'tool_use') {
      console.warn(`  Unexpected stop_reason: ${response.stop_reason}`);
      break;
    }

    // Execute all tool calls
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const result = await callMcpTool(mcpClient, block.name, block.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  console.warn('Warning: reached max iterations without end_turn');
  return transcript.join('\n');
}

// ---------------------------------------------------------------------------
// Set a GitHub Actions output (supports multiline via collision-proof delimiter)
// ---------------------------------------------------------------------------
function setOutput(name, value) {
  if (!GITHUB_OUTPUT) return;
  fs.appendFileSync(GITHUB_OUTPUT, formatOutputEntry(name, value));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Nucel QA Action ===');
  console.log(`URL:      ${QA_URL}`);
  console.log(`Personas: ${personas.length > 0 ? personas.join(', ') : 'all'}`);
  console.log(`Model:    ${QA_MODEL}`);
  console.log(`Server:   ${NUCEL_QA_SERVER_URL}`);
  console.log('');

  // Connect MCP
  const mcpClient = await connectMcp();

  // Fetch tools
  const { tools: mcpTools } = await mcpClient.listTools();
  console.log(`Loaded ${mcpTools.length} tools from nucel-qa.`);
  const tools = toAnthropicTools(mcpTools);

  // Create Anthropic client
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Run agentic loop
  const finalOutput = await runAgentLoop(anthropic, mcpClient, tools);

  // Disconnect MCP
  try { await mcpClient.close(); } catch (_) {}

  // Extract report (from accumulated transcript, last <report> block wins)
  const report = extractReport(finalOutput);

  // Count findings by severity.
  const counts = countFindings(report);
  const findingsCount = counts.total;

  // Always write the report file + outputs, even on failure paths, so
  // downstream steps (artifact upload, PR comment) still have something.
  fs.writeFileSync(QA_REPORT_OUTPUT, report || '(no report generated)', 'utf8');
  console.log(`Report written to ${QA_REPORT_OUTPUT}`);

  setOutput('report', report);
  setOutput('report_path', QA_REPORT_OUTPUT);
  setOutput('findings_count', String(findingsCount));
  setOutput('critical_count', String(counts.bySeverity.critical));
  setOutput('high_count', String(counts.bySeverity.high));

  // A missing report means the QA session did NOT complete — fail the workflow
  // rather than silently passing (the previous behaviour always exited 0).
  if (!report) {
    console.error(
      '::error::Nucel QA produced no report — the session did not complete. Check the logs above.',
    );
    process.exit(1);
  }

  console.log(`\nReport length: ${report.length} chars`);
  console.log(
    `Findings: ${findingsCount} total ` +
      `(critical=${counts.bySeverity.critical}, high=${counts.bySeverity.high}, ` +
      `medium=${counts.bySeverity.medium}, low=${counts.bySeverity.low})`,
  );

  // Severity gate: optionally fail the workflow on findings at/above a threshold.
  const gate = evaluateSeverityGate(counts, QA_FAIL_ON_SEVERITY);
  console.log(`Severity gate (fail-on-severity=${QA_FAIL_ON_SEVERITY}): ${gate.reason}`);
  if (gate.shouldFail) {
    console.error(`::error::QA severity gate failed — ${gate.reason}`);
    console.log('\n=== QA session complete (gate failed) ===');
    process.exit(2);
  }

  console.log('\n=== QA session complete ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
