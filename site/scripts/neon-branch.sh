#!/usr/bin/env bash

set -e

# ---- CONFIG ----
PROJECT_ID="empty-band-96403801"    # <-- change this
ENV_FILE=".env"                     # your local env file
BRANCH_NAME=${1:-"dev-$(date +%s)"} # auto-name if not provided

echo "🌱 Creating Neon branch: $BRANCH_NAME"

# ---- CREATE BRANCH ----

BRANCH_ID=$(neonctl branches create \
	--project-id "$PROJECT_ID" \
	--name "$BRANCH_NAME" \
	--output json | jq -r '.branch.id')

echo "✅ Branch created: $BRANCH_ID"

# ---- GET CONNECTION STRING ----
CONN_STRING=$(neonctl connection-string --project-id "$PROJECT_ID" --branch-id "$BRANCH_ID")

echo "🔌 Got connection string"

# ---- UPDATE .env ----
if grep -q "DATABASE_URL=" "$ENV_FILE"; then
	sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=$CONN_STRING|" "$ENV_FILE"
else
	echo "DATABASE_URL=$CONN_STRING" >>"$ENV_FILE"
fi

echo "📝 Updated $ENV_FILE"

# ---- OPTIONAL: RUN MIGRATIONS ----
if command -v drizzle-kit &>/dev/null; then
	echo "🚀 Pushing Schema..."
	drizzle-kit push
fi

echo "🎉 Done! You're now using branch: $BRANCH_NAME"
