# Integration with `nucel-qa`

`qa-action` is a thin orchestrator. The actual QA work — browsing the
app, taking snapshots, running personas, generating reports — lives in
the [`nucel-dev/nucel-qa`](https://github.com/nucel-dev/nucel-qa) Rust
binary. This document explains the contract between the two and how
versions line up.

---

## Architecture

```
GitHub Actions runner (ubuntu-latest / macos-latest / windows-latest)
│
├── Install Nucel QA (composite step)
│   └── curl GitHub Releases → ~/.local/bin/nucel-qa
│       └── checksum-verified against checksums.txt
│
├── Set up Node.js (actions/setup-node@v4, node-version: 20)
│
├── Install action dependencies (npm ci --production)
│   ├── @anthropic-ai/sdk         ← Claude Messages API client
│   └── @modelcontextprotocol/sdk ← MCP client (HTTP streamable transport)
│
├── Start Nucel QA server
│   └── nucel-qa &                ← background, env: NUCEL_TRANSPORT=http
│                                          NUCEL_BIND=127.0.0.1:18080
│                                          NUCEL_QA_HEADLESS=1
│       └── spawns headless Chrome via CDP
│
├── Run QA session  ──────────────────────────────────────┐
│   └── node scripts/run-qa.mjs                           │
│       │                                                 │
│       │  ┌──────────────────────────────────────────┐   │
│       │  │       agent loop (≤ 80 iterations)       │   │
│       │  │                                          │   │
│       └──┤ anthropic.messages.create(model, tools)  │   │
│          │             │                            │   │
│          │             ▼ stop_reason = tool_use     │   │
│          │   mcpClient.callTool(name, arguments) ───┼───┘
│          │             │
│          │             ▼ HTTP POST /mcp on 127.0.0.1:18080
│          │       (nucel-qa executes the tool)
│          │             │
│          │             ▼ tool_result back to Claude
│          │             │
│          │     loop until stop_reason = end_turn
│          │             │
│          │   extract <report>…</report> markdown
│          └─────────────│──────────────────────────────┐
│                        ▼                              │
│                  /tmp/nucel-qa-report.md              │
│                                                       │
├── Stop Nucel QA server (kill PID)                     │
│                                                       │
└── Post PR comment ────────────────────────────────────┘
    (actions/github-script@v7, gated on pull_request)
```

### Boundaries

- **qa-action** decides _when_ to run, _which_ model to use, _which_
  personas to filter on, and where the report ends up. It does not know
  anything about the testing logic.
- **nucel-qa** owns Chrome, the MCP tool surface (`qa_start_session`,
  `qa_navigate`, `qa_run_personas_parallel`, `qa_generate_report`, etc.),
  the persona definitions, and the report format.
- **Claude** is the glue: it reads tool descriptions exposed by nucel-qa
  and decides which to call in what order, guided by the system prompt
  in `scripts/run-qa.mjs`.

---

## MCP contract

The action talks to nucel-qa over the **MCP streamable HTTP transport**:

- URL: `http://127.0.0.1:18080/mcp` (hardcoded in `action.yml`).
- Client: `@modelcontextprotocol/sdk` v1.10+ → `StreamableHTTPClientTransport`.
- Lifecycle: connect → `listTools()` → forward each tool to Claude as an
  Anthropic tool definition → run the agent loop → `close()`.

The action only relies on:

1. `listTools()` returning an MCP-compliant tool list.
2. `callTool({ name, arguments })` accepting Claude's `tool_use` inputs
   verbatim and returning a `content` array with `{ type: 'text', text }`
   entries.

Any nucel-qa version that holds this contract will work.

---

## Tool sequence (happy path)

The system prompt instructs Claude to follow this sequence, but Claude
is free to interleave additional calls:

1. `qa_start_session` — kicks off the session with the target URL.
2. _Discovery phase_: arbitrary `qa_navigate`, `qa_snapshot`,
   `qa_register_page`, `qa_register_feature` calls.
3. `qa_mark_discovery_complete` — switches the session into testing mode.
4. `qa_run_personas_parallel` — fan-out across discovered pages.
5. `qa_generate_report` — produces the markdown body.
6. `qa_end_session` — closes the session cleanly.

The exact tool surface is defined by the pinned `nucel-qa` version —
check `nucel-qa --help` or its docs for the canonical list.

---

## Version pinning between action and server

Currently the action releases (`v1`, `v1.x`) are **decoupled** from
nucel-qa releases. The `version` input lets you pin nucel-qa
independently:

| Layer | Pin | Where |
|-------|-----|-------|
| Action | `uses: nucel-dev/qa-action@v1` | workflow YAML |
| Server | `version: 'v0.2.0'` | action input |
| Model  | `model: 'claude-opus-4-6'`     | action input |
| Node SDK runtime | `^1.10.0` MCP / `^0.39.0` Anthropic | `package.json` |

### Compatibility matrix

| qa-action | nucel-qa (tested) | MCP SDK | Anthropic SDK | Node |
|-----------|-------------------|---------|---------------|------|
| `v1.0.x`  | `v0.1.x` – `v0.2.x` | `^1.10.0` | `^0.39.0` | `>=20` |

Keep this table updated whenever a server change forces a protocol
revision. If MCP ever breaks backwards compatibility, bump the action's
major version and add a new row.

---

## Failure isolation

| If this fails... | ...the action surfaces it as |
|------------------|------------------------------|
| Binary download | `Install Nucel QA` step error |
| Chrome launch | `nucel-qa process exited unexpectedly` |
| MCP handshake | Connection error in `Run QA session` step |
| Tool call | Logged inline; loop continues per system prompt |
| Claude API | Fatal — script exits non-zero |
| Report empty | `findings-count = 0`, warning logged |
| PR comment | Logged but does not fail the step |

---

## Local reproduction

To replicate exactly what CI does:

```bash
# 1. Install nucel-qa locally
cargo install --git https://github.com/nucel-dev/nucel-qa nucel-qa

# 2. Start the MCP server (same flags as action.yml)
NUCEL_TRANSPORT=http \
NUCEL_BIND=127.0.0.1:18080 \
NUCEL_QA_HEADLESS=1 \
  nucel-qa &

# 3. Install action deps
cd qa-action
npm ci

# 4. Run the script
ANTHROPIC_API_KEY=sk-... \
QA_URL=http://localhost:3000 \
QA_MODEL=claude-opus-4-6 \
NUCEL_QA_SERVER_URL=http://127.0.0.1:18080/mcp \
QA_REPORT_OUTPUT=./report.md \
  node scripts/run-qa.mjs
```

This produces `./report.md` identical to what CI would post on a PR.
