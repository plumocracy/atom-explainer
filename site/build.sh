#!/bin/bash
set -e

# Install wasm-pack if not present
if ! command -v wasm-pack &>/dev/null; then
	curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Build WASM
wasm-pack build ./orbital-math --release --target bundler --out-dir ./pkg

# Build site
bun install
bun run build
