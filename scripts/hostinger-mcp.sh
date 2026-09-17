#!/usr/bin/env bash
# Launch one of the hostinger-api-mcp stdio servers reliably.
#
# The published package ships src/servers/*.js without the executable bit, and
# the npx cache sometimes ends up with the bin symlinks pointing at
# non-executable files. Claude Code then reports every Hostinger MCP server as
# CONNECTION_CLOSED. This wrapper installs the package into a fixed prefix once,
# fixes the mode bits, and execs the server through node directly.
#
# Usage: scripts/hostinger-mcp.sh <hosting|domains|dns|billing|reach>
set -euo pipefail

server="${1:?server name required: hosting|domains|dns|billing|reach}"
prefix="${HOSTINGER_MCP_PREFIX:-$HOME/.nbm-hostinger-mcp}"
pkg="hostinger-api-mcp"
entry="$prefix/node_modules/$pkg/src/servers/$server.js"

if [ ! -f "$entry" ]; then
  mkdir -p "$prefix"
  npm install --prefix "$prefix" --no-audit --no-fund --silent "$pkg@latest" >&2
fi
chmod +x "$prefix/node_modules/$pkg/src/servers/"*.js 2>/dev/null || true

exec node "$entry"
