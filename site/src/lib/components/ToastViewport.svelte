<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { dismissToast, toasts } from '$lib/toast.svelte';

	const toneClass: Record<string, string> = {
		info: 'border-[rgba(39,80,86,0.36)] bg-[linear-gradient(180deg,rgba(245,240,232,0.96),rgba(238,229,215,0.95))] text-[var(--museum-text)]',
		success:
			'border-[rgba(70,123,86,0.36)] bg-[linear-gradient(180deg,rgba(243,240,228,0.97),rgba(230,237,219,0.96))] text-[var(--museum-text)]',
		warning:
			'border-[rgba(184,138,71,0.44)] bg-[linear-gradient(180deg,rgba(248,242,227,0.98),rgba(241,230,206,0.97))] text-[var(--museum-text)]',
		error:
			'border-[rgba(146,76,59,0.46)] bg-[linear-gradient(180deg,rgba(248,236,231,0.98),rgba(241,220,211,0.97))] text-[var(--museum-text)]',
	};

	const toneBadgeClass: Record<string, string> = {
		info: 'bg-[rgba(39,80,86,0.12)] text-[rgba(39,80,86,0.9)] border-[rgba(39,80,86,0.35)]',
		success: 'bg-[rgba(70,123,86,0.13)] text-[rgba(56,96,68,0.9)] border-[rgba(70,123,86,0.35)]',
		warning: 'bg-[rgba(184,138,71,0.15)] text-[rgba(122,86,36,0.95)] border-[rgba(184,138,71,0.4)]',
		error: 'bg-[rgba(146,76,59,0.14)] text-[rgba(116,54,38,0.95)] border-[rgba(146,76,59,0.4)]',
	};
</script>

<div class="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
	{#each toasts as toast (toast.id)}
		<article
			class={`pointer-events-auto rounded-xl border px-4 py-3.5 shadow-[0_14px_30px_rgba(44,42,38,0.22)] backdrop-blur ${toneClass[toast.tone] ?? toneClass.info}`}
			in:fly={{ y: -10, duration: 150 }}
			out:fade={{ duration: 120 }}
		>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase {toneBadgeClass[toast.tone] ?? toneBadgeClass.info}">
						{toast.tone}
					</p>
					<p class="mt-2 text-xs font-semibold tracking-wide uppercase text-[var(--museum-subtext)]">{toast.title}</p>
					<p class="mt-1 text-sm leading-relaxed break-words">{toast.message}</p>
					{#if toast.requestId}
						<p class="mt-2 text-[11px] text-[var(--museum-subtext)]">Request ID: {toast.requestId}</p>
					{/if}
				</div>
				<button
					type="button"
					class="rounded-md border border-[var(--museum-stroke-strong)] bg-[rgba(255,255,255,0.34)] px-2 py-1 text-[11px] font-semibold text-[var(--museum-subtext)] transition hover:cursor-pointer hover:bg-[rgba(255,255,255,0.6)] hover:text-[var(--museum-text)]"
					onclick={() => dismissToast(toast.id)}
				>
					Dismiss
				</button>
			</div>
		</article>
	{/each}
</div>
