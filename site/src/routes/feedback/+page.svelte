<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const formatDate = (value: string | Date) =>
		new Date(value).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});

	const formatRating = (value: number) => value.toFixed(1);

	const buildFollowupMailto = (entry: (typeof data.feedback)[number]) => {
		const subject = encodeURIComponent('Follow-up on your feedback for My Atom');
		const body = encodeURIComponent(
			[
				`Hi ${entry.feedbackGiver.name},`,
				'',
				'Thank you for your feedback on My Atom.',
				'',
				`Your overall rating: ${formatRating(entry.overallRating)}/5`,
				'',
				'We wanted to follow up and learn more about your experience.',
				'',
				'Best,',
				'My Atom team'
			].join('\n')
		);

		return `mailto:${entry.feedbackGiver.email}?subject=${subject}&body=${body}`;
	};
</script>

<div class="museum-shell">
	<section class="museum-frame p-4 md:p-6 lg:p-8">
		<header class="museum-panel rounded-3xl border px-5 py-5 shadow-[var(--museum-shadow)] md:px-7 md:py-6">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div>
					<p class="museum-kicker">Admin Only</p>
					<h1 class="museum-title mt-1">Feedback Review</h1>
					<p class="mt-2 text-sm text-[var(--museum-subtext)]">
						Review every submitted feedback entry across all users.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<a href={resolve('/dashboard')} class="museum-button rounded-full px-4 py-2 text-sm font-semibold">Dashboard</a>
					<a href={resolve('/')} class="museum-button rounded-full px-4 py-2 text-sm font-semibold">Back to exhibit</a>
				</div>
			</div>
		</header>

		<section class="museum-panel mt-5 flex min-h-0 flex-col rounded-2xl border p-5 md:p-6">
			<div class="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--museum-stroke)] pb-4">
				<div>
					<h2 class="text-2xl">All Feedback</h2>
					<p class="mt-2 text-sm text-[var(--museum-subtext)]">
						Showing {data.feedback.length} submitted feedback entr{data.feedback.length === 1 ? 'y' : 'ies'}.
					</p>
				</div>
				<form method="GET" action={resolve('/feedback')} class="flex items-center gap-2">
					<label class="text-sm font-medium text-[var(--museum-subtext)]" for="feedback-sort">
						Sort by
					</label>
					<select
						id="feedback-sort"
						name="sort"
						class="rounded-full border border-[var(--museum-stroke)] bg-white/60 px-3 py-2 text-sm"
						onchange={(event) => (event.currentTarget.form as HTMLFormElement).requestSubmit()}
					>
						<option value="newest" selected={data.sort === 'newest'}>Newest</option>
						<option value="highest" selected={data.sort === 'highest'}>Highest rated</option>
						<option value="lowest" selected={data.sort === 'lowest'}>Lowest rated</option>
					</select>
				</form>
			</div>

			{#if data.feedback.length === 0}
				<p class="mt-6 text-sm text-[var(--museum-subtext)]">No feedback has been submitted yet.</p>
			{:else}
				<div class="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
					<div class="grid gap-4">
					{#each data.feedback as entry (entry.id)}
						<article class="rounded-2xl border border-[var(--museum-stroke)] bg-white/45 p-4">
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div>
									<div class="flex items-center gap-2 text-xs tracking-[0.14em] text-[var(--museum-subtext)] uppercase">
										<span>{entry.preference === 'up' ? 'Thumbs up' : 'Thumbs down'}</span>
										<span>•</span>
										<span>{formatDate(entry.createdAt)}</span>
									</div>
									<h3 class="mt-2 text-lg font-semibold">{entry.feedbackGiver.name}</h3>
									<p class="text-sm text-[var(--museum-subtext)]">{entry.feedbackGiver.email}</p>
								</div>
								<div class="text-right">
									<p class="museum-kicker !tracking-[0.12em]">Overall rating</p>
									<p class="mt-1 text-2xl font-semibold tabular-nums">
										{formatRating(entry.overallRating)}
										<span class="text-base text-[var(--museum-subtext)]">/ 5</span>
									</p>
								</div>
							</div>

							<div class="mt-4 grid gap-3 md:grid-cols-3">
								<div class="rounded-xl border border-[var(--museum-stroke)] bg-white/55 px-3 py-3">
									<p class="museum-kicker !tracking-[0.12em]">Correctness</p>
									<p class="mt-1 text-xl font-semibold">{entry.correctness}/5</p>
								</div>
								<div class="rounded-xl border border-[var(--museum-stroke)] bg-white/55 px-3 py-3">
									<p class="museum-kicker !tracking-[0.12em]">Tone</p>
									<p class="mt-1 text-xl font-semibold">{entry.tone}/5</p>
								</div>
								<div class="rounded-xl border border-[var(--museum-stroke)] bg-white/55 px-3 py-3">
									<p class="museum-kicker !tracking-[0.12em]">Understandability</p>
									<p class="mt-1 text-xl font-semibold">{entry.understandability}/5</p>
								</div>
							</div>

							<div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
								<div class="space-y-3">
									<div>
										<p class="museum-kicker !tracking-[0.12em]">Assistant response</p>
										<p class="mt-2 max-h-56 overflow-y-auto rounded-xl border border-[rgba(184,138,71,0.35)] bg-[rgba(184,138,71,0.1)] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] break-words">
											{entry.messageContent}
										</p>
									</div>

									<div>
										<p class="museum-kicker !tracking-[0.12em]">Feedback notes</p>
										<p class="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[var(--museum-stroke)] bg-white/55 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] break-words">
											{entry.explanation?.trim() || 'No explanation provided.'}
										</p>
									</div>
								</div>

								<div class="flex items-start justify-end">
									<a href={buildFollowupMailto(entry)} class="museum-button rounded-full px-4 py-2 text-sm font-semibold">
										Send follow-up email
									</a>
								</div>
							</div>
						</article>
					{/each}
					</div>
				</div>
			{/if}
		</section>
	</section>
</div>
