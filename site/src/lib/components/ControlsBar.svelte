<script lang="ts">
	import {
		simulationValues,
		orbitalViewState,
		setPositiveXYCrossSectionHidden,
		visualizationState,
		bohrSimulationValues,
		getBohrShellDistribution
	} from '$lib/chat.svelte';

	let nMax = 5;
	let nMin = 1;
	const nChoices = Array.from({ length: nMax - nMin + 1 }, (_, idx) => nMin + idx);

	let lChoices = $derived(Array.from({ length: simulationValues.n }, (_, idx) => idx));
	let mChoices = $derived(
		Array.from({ length: simulationValues.l * 2 + 1 }, (_, idx) => idx - simulationValues.l)
	);
	let hidePositiveQuadrant = $derived(orbitalViewState.hidePositiveXYCrossSection);

	$effect(() => {
		const maxL = simulationValues.n - 1;
		if (simulationValues.l > maxL) simulationValues.l = maxL;
	});

	$effect(() => {
		if (simulationValues.m > simulationValues.l) simulationValues.m = simulationValues.l;
		if (simulationValues.m < -simulationValues.l) simulationValues.m = -simulationValues.l;
	});

	const setN = (value: number) => {
		simulationValues.n = value;
	};
	const setL = (value: number) => {
		simulationValues.l = value;
	};
	const setM = (value: number) => {
		simulationValues.m = value;
	};
	const clampAtomicNumber = (next: number) => {
		bohrSimulationValues.atomicNumber = Math.max(1, Math.min(20, next));
	};

	let atomicNumber = $derived(bohrSimulationValues.atomicNumber);
	let shellDistribution = $derived.by(() => getBohrShellDistribution(atomicNumber));
	let shellSummary = $derived(shellDistribution.join(', '));

	const mode = $derived(visualizationState.mode);

	const btnActive =
		'border-[rgba(44,61,75,0.95)] bg-[rgba(44,61,75,0.95)] text-[rgba(243,229,205,0.98)]';
	const btnInactive =
		'border-[rgba(44,61,75,0.68)] bg-transparent text-[rgba(44,61,75,0.95)] hover:bg-[rgba(44,61,75,0.1)]';
	const pillBtn = 'rounded border px-1.5 py-0.5 text-[11px] leading-4 font-medium transition hover:cursor-pointer';
	const stdBtn = 'rounded border px-2 py-0.5 text-[11px] leading-4 font-medium transition hover:cursor-pointer';
	const disBtn = 'disabled:opacity-45 disabled:hover:bg-transparent';
	const boBtn = `rounded border border-[rgba(44,61,75,0.68)] px-2 py-0.5 text-[11px] leading-4 text-[rgba(44,61,75,0.95)] hover:cursor-pointer hover:bg-[rgba(44,61,75,0.1)]`;
	const label =
		'text-[11px] font-semibold tracking-wide text-[rgba(44,61,75,0.95)] uppercase';
		const subtext = 'text-[11px] text-[rgba(44,61,75,0.72)]';
</script>

<div class="z-20 bg-[var(--museum-surface)] px-3 py-2 md:px-4 md:py-2.5">
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[rgba(44,61,75,0.95)]">
		{#if mode === 'orbital'}
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<div class="flex flex-wrap items-center gap-1.5">
				<span class={label}>n</span>
				{#each nChoices as value}
					<button
						type="button"
						class="{pillBtn} {simulationValues.n === value ? btnActive : btnInactive}"
						onclick={() => setN(value)}
					>
						{value}
					</button>
				{/each}
			</div>

			<div class="flex flex-wrap items-center gap-1.5">
				<span class={label}>l</span>
				{#each lChoices as value}
					<button
						type="button"
						class="{pillBtn} {simulationValues.l === value ? btnActive : btnInactive}"
						onclick={() => setL(value)}
					>
						{value}
					</button>
				{/each}
			</div>

			<div class="flex flex-wrap items-center gap-1.5">
				<span class={label}>m</span>
				{#each mChoices as value}
					<button
						type="button"
						class="{pillBtn} {simulationValues.m === value ? btnActive : btnInactive}"
						onclick={() => setM(value)}
					>
						{value}
					</button>
				{/each}
			</div>

			<div class="flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					class="{stdBtn} {hidePositiveQuadrant ? btnActive : btnInactive}"
					onclick={() => setPositiveXYCrossSectionHidden(!hidePositiveQuadrant)}
				>
					{hidePositiveQuadrant ? 'Show +X/+Y cross section' : 'Hide +X/+Y cross section'}
				</button>
			</div>
			</div>
		{:else}
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					class="{boBtn} {disBtn}"
					onclick={() => clampAtomicNumber(atomicNumber - 1)}
					disabled={atomicNumber <= 1}
				>
					-1
				</button>

				<span class={label}>Bohr model 3D &middot; Z={atomicNumber}</span>

				<button
					type="button"
					class="{boBtn} {disBtn}"
					onclick={() => clampAtomicNumber(atomicNumber + 1)}
					disabled={atomicNumber >= 20}
				>
					+1
				</button>

				<span class={subtext}>Shells: {shellSummary}</span>
			</div>
		{/if}

		<button
			type="button"
			class="{stdBtn} {mode === 'orbital' ? btnInactive : btnActive}"
			onclick={() => (visualizationState.mode = mode === 'orbital' ? 'bohr' : 'orbital')}
		>
			Switch to {mode === 'orbital' ? 'Bohr' : 'Orbital'}
		</button>
	</div>
</div>
