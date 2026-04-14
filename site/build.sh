#!/bin/bash
set -e

# Install Rust if not present
if ! command -v rustup &>/dev/null; then
	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
source "$HOME/.cargo/env"

# Install wasm-pack if not present
if ! command -v wasm-pack &>/dev/null; then
	curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Build WASM
wasm-pack build ./orbital-math --release --target web --out-dir ./pkg

# Build site
bun install
bun run build
