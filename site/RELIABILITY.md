# Reliability Changes

This branch improves reliability around the most failure-prone paths in the app: model provider calls, server-side page data loading, and API error reporting.

## Retryable Work

- Added `src/lib/server/retry.ts` with `retryAsync`, a small abort-aware retry helper.
- Retries use bounded exponential backoff and stop immediately when the caller aborts the request.
- Callers can provide `shouldRetry` so permanent failures are not repeated.

Why: retry behavior should be consistent and explicit. Repeating all failures can hide bugs or duplicate non-idempotent work, so retries are limited to known transient cases.

## Model Provider Calls

- Added `sendOpenRouterChat` in `src/lib/server/openrouter.ts`.
- Routed chat streaming, conversation title generation, guided tour judging, and the legacy `queryModel` helper through that shared OpenRouter wrapper.
- Added retry detection for transient OpenRouter/provider statuses: `408`, `409`, `425`, `429`, `500`, `502`, `503`, and `504`.
- Improved provider-facing error messages for unauthorized, rate-limited, timed-out, and temporarily unavailable responses.

Why: OpenRouter/model calls are external network calls and are the highest-probability transient failure point. Centralizing retries ensures new model calls do not need to reinvent retry logic.

## Page Data Loading

- Wrapped the homepage server load call to `/api/chat/v1` in `retryAsync` for transient fetch-level failures.
- Kept malformed or non-OK API responses as hard failures with descriptive `throwKitError` handling.

Why: internal server fetches can fail because of transient runtime/network issues, but malformed responses should not be retried blindly because they indicate a contract problem.

## API Error Quality

- Preserved the existing normalized API error response shape: `{ success: false, error: { code, message, requestId, details } }`.
- Kept invalid JSON request parsing centralized through `parseJsonRequestBody`, so JSON body routes return `400 BAD_REQUEST` with `Request body must be valid JSON.`
- Kept empty or blank error messages normalized to `Internal server error` instead of leaking blank or `undefined` messages to users.

Why: users need actionable messages and support needs request ids. Empty or undefined errors make both debugging and recovery harder.

## Tests

- Added unit coverage for the retry helper.
- Added OpenRouter retry tests covering transient retry and permanent failure no-retry behavior.
- Updated provider error mapping tests for the more descriptive messages.

Why: reliability behavior is easy to regress unless retry/no-retry boundaries are tested directly.

## Not Changed

- Database writes were not blindly retried. Some writes create messages, conversations, or usage events and may not be safe to repeat without idempotency keys.
- Client-side chat streaming already uses EventSource retry behavior for transport errors. This branch keeps server-side provider retries focused before the stream begins.
- Existing unrelated worktree changes in `src/lib/components/ResponseCard.svelte` were left untouched.
