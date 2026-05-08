import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from './db';
import { userTokenUsageEvents } from './db/schema';
import { appError } from './errors';
import { err, ok, type ServerResult } from './result';
import { isAdminUser } from './user';
import { env } from '$env/dynamic/private';

const DEFAULT_CHAT_TOKEN_LIMIT = 20_000;
const USAGE_WINDOW_HOURS = 24;
const USAGE_WINDOW_MS = USAGE_WINDOW_HOURS * 60 * 60 * 1000;

export type UsageLimitStatus = {
	allowed: boolean;
	limit: number;
	usedTokens: number;
	remainingTokens: number;
	resetAt: Date;
};

type TokenUsageRecord = {
	userId: string;
	inputTokens: number;
	outputTokens: number;
	source?: string;
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getChatTokenLimit = (): number =>
	parsePositiveInt(env.CHAT_TOKEN_LIMIT_24H, DEFAULT_CHAT_TOKEN_LIMIT);

const getWindowStart = (now = new Date()): Date => new Date(now.getTime() - USAGE_WINDOW_MS);

const getFallbackResetAt = (now = new Date()): Date => new Date(now.getTime() + USAGE_WINDOW_MS);

export const getUsageLimitMessage = (resetAt: Date): string =>
	`You've reached the chat usage limit for this rolling 24-hour period. Your access resets at ${resetAt.toLocaleString(
		'en-US',
		{
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'America/New_York'
		}
	)}.`;

export const getUserUsageLimitStatus = async (
	userId: string,
	estimatedAdditionalTokens = 0,
	now = new Date()
): Promise<ServerResult<UsageLimitStatus>> => {
	try {
		const limit = getChatTokenLimit();
		const windowStart = getWindowStart(now);
		const usageRows = await db
			.select({
				totalTokens: userTokenUsageEvents.totalTokens,
				createdAt: userTokenUsageEvents.createdAt
			})
			.from(userTokenUsageEvents)
			.where(
				and(eq(userTokenUsageEvents.userId, userId), gt(userTokenUsageEvents.createdAt, windowStart))
			)
			.orderBy(asc(userTokenUsageEvents.createdAt));

		const usedTokens = usageRows.reduce((total, row) => total + row.totalTokens, 0);
		const projectedTokens = usedTokens + Math.max(0, estimatedAdditionalTokens);
		const resetAt = usageRows[0]?.createdAt
			? new Date(usageRows[0].createdAt.getTime() + USAGE_WINDOW_MS)
			: getFallbackResetAt(now);

		return ok({
			allowed: projectedTokens <= limit,
			limit,
			usedTokens,
			remainingTokens: Math.max(0, limit - usedTokens),
			resetAt
		});
	} catch (error) {
		return err(appError.internal('Could not load usage limit status', { cause: error }));
	}
};

export const canUserUseChatTokens = async (
	userId: string,
	estimatedAdditionalTokens = 0
): Promise<ServerResult<UsageLimitStatus>> => {
	const adminResult = await isAdminUser(userId);
	if (!adminResult.ok) {
		return err(adminResult.error);
	}

	if (adminResult.data) {
		return ok({
			allowed: true,
			limit: Number.POSITIVE_INFINITY,
			usedTokens: 0,
			remainingTokens: Number.POSITIVE_INFINITY,
			resetAt: getFallbackResetAt()
		});
	}

	const statusResult = await getUserUsageLimitStatus(userId, estimatedAdditionalTokens);
	if (!statusResult.ok) {
		return statusResult;
	}

	if (!statusResult.data.allowed) {
		return err(
			appError.rateLimited(getUsageLimitMessage(statusResult.data.resetAt), {
				limit: statusResult.data.limit,
				usedTokens: statusResult.data.usedTokens,
				remainingTokens: statusResult.data.remainingTokens,
				resetAt: statusResult.data.resetAt.toISOString()
			})
		);
	}

	return statusResult;
};

export const recordTokenUsage = async (input: TokenUsageRecord): Promise<ServerResult<void>> => {
	const inputTokens = Math.max(0, input.inputTokens);
	const outputTokens = Math.max(0, input.outputTokens);
	const totalTokens = inputTokens + outputTokens;

	if (totalTokens <= 0) {
		return ok(undefined);
	}

	try {
		await db.insert(userTokenUsageEvents).values({
			userId: input.userId,
			inputTokens,
			outputTokens,
			totalTokens,
			source: input.source ?? 'chat'
		});

		return ok(undefined);
	} catch (error) {
		return err(appError.internal('Could not record token usage', { cause: error }));
	}
};
