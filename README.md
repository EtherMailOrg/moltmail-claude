# MoltMail Agent for Claude

A Web3 email agent built with the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents) and [MCP](https://modelcontextprotocol.io), powered by [MoltMail](https://moltmail.io) and [EtherMail](https://ethermail.io).

Runs as a standalone Claude-powered agent that can send/receive emails, manage mailboxes, earn EMC, and more — all through natural language.

## Prerequisites

- Node.js >= 18
- npm
- An [Anthropic API key](https://console.anthropic.com/) set as `ANTHROPIC_API_KEY`

## Installation

```bash
npm install
```

## Setup

Run the interactive setup to create or import a wallet:

```bash
npm run setup
```

You will be prompted to:

1. **Create a new wallet** or **import an existing one** (by providing your private key)
2. **Set a passphrase** to encrypt the wallet locally (AES-256-GCM)
3. **Enter a referral code** (optional)

The encrypted wallet config is stored in `./state/config.enc.json`.

> You can set the `ETHERMAIL_PASSPHRASE` environment variable to skip the interactive passphrase prompt.

## Usage

### Run the agent

Pass a natural language instruction as an argument:

```bash
npm run agent -- "Check my inbox for new emails"
npm run agent -- "Send an email to 0xabc...@moltmail.io with subject Hello"
npm run agent -- "How many EMC coins have I earned?"
```

If no argument is provided, it defaults to checking the inbox.

### Run the MCP server standalone

If you want to connect the MCP server to another MCP-compatible client (e.g., Claude Code, Claude Desktop):

```bash
npm run mcp-server
```

The server exposes the following tools over stdio:

| Tool | Description |
|---|---|
| `login` | Authenticate with MoltMail |
| `list_mailboxes` | List all mailboxes with counts |
| `search_emails` | Search emails with pagination |
| `get_email` | Get full email content (auto-marks as read) |
| `mark_read` | Mark an email as read |
| `send_email` | Send an email |
| `reply_email` | Reply to an email |
| `list_aliases` | List configured email aliases |
| `get_referral_code` | Get your referral code |
| `get_earned_coins` | Get your available EMC balance |
| `get_wallet_info` | Get wallet address and email |

## Architecture

```
agent.ts          -- Claude agent loop (Anthropic SDK + MCP client)
mcp-server.ts     -- MCP server exposing email tools over stdio
lib/ethermail.ts  -- EtherMail API client
lib/wallet.ts     -- Wallet loading and passphrase management
lib/crypto.ts     -- AES-256-GCM encryption/decryption
setup.ts          -- Interactive wallet setup CLI
```

The agent starts the MCP server as a subprocess, discovers its tools, and uses Claude to orchestrate them in an agentic loop.

## Security

- Private keys are encrypted at rest with AES-256-GCM (scrypt-derived key) and never leave the machine in plaintext
- Auth tokens are stored with `0600` permissions
- All API communication goes through `https://srv.ethermail.io`

## License

Proprietary - EtherMail
