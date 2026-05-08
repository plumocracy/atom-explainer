<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import LogOut from '@lucide/svelte/icons/log-out';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import {
		setSimulationValues,
		simulationValues,
		orbitalViewState,
		setPositiveXYCrossSectionHidden,
		visualizationState,
		bohrSimulationValues
	} from '$lib/chat.svelte';

	const nMax = 5;
	const nMin = 1;

	type ControlsBarProps = {
		chatEnabled?: boolean;
		user?: { image?: string | null } | null;
		isAdmin?: boolean;
		showChat?: boolean;
		openChat?: () => void;
	};

	let {
		chatEnabled = false,
		user = null,
		isAdmin = false,
		showChat = false,
		openChat = () => {}
	}: ControlsBarProps = $props();

	let hidePositiveQuadrant = $derived(orbitalViewState.hidePositiveXYCrossSection);
	let mobileQuantumField = $state<'n' | 'l' | 'm'>('n');
	let profileMenuOpen = $state(false);
	let profileMenuRef = $state<HTMLElement | null>(null);

	const setN = (value: number) => {
		setSimulationValues({ ...simulationValues, n: value });
	};
	const setL = (value: number) => {
		setSimulationValues({ ...simulationValues, l: value });
	};
	const setM = (value: number) => {
		setSimulationValues({ ...simulationValues, m: value });
	};
	const stepN = (delta: number) => {
		setN(Math.max(nMin, Math.min(nMax, simulationValues.n + delta)));
	};
	const stepL = (delta: number) => {
		setL(Math.max(0, Math.min(simulationValues.n - 1, simulationValues.l + delta)));
	};
	const stepM = (delta: number) => {
		const nextM = simulationValues.m + delta;
		setM(Math.max(-simulationValues.l, Math.min(simulationValues.l, nextM)));
	};
	const getQuantumRange = (field: 'n' | 'l' | 'm') => {
		if (field === 'n') {
			return { min: nMin, max: nMax };
		}

		if (field === 'l') {
			return { min: 0, max: Math.max(0, simulationValues.n - 1) };
		}

		return { min: -simulationValues.l, max: simulationValues.l };
	};
	const getQuantumValue = (field: 'n' | 'l' | 'm') => {
		if (field === 'n') {
			return simulationValues.n;
		}

		if (field === 'l') {
			return simulationValues.l;
		}

		return simulationValues.m;
	};
	const stepQuantumField = (field: 'n' | 'l' | 'm', delta: number) => {
		if (field === 'n') {
			stepN(delta);
			return;
		}

		if (field === 'l') {
			stepL(delta);
			return;
		}

		stepM(delta);
	};
	const clampAtomicNumber = (next: number) => {
		bohrSimulationValues.atomicNumber = Math.max(1, Math.min(20, next));
	};
	const setQuantumFieldValue = (field: 'n' | 'l' | 'm', next: number) => {
		const range = getQuantumRange(field);
		if (next < range.min || next > range.max) {
			return;
		}

		if (field === 'n') {
			setN(next);
			return;
		}

		if (field === 'l') {
			setL(next);
			return;
		}

		setM(next);
	};
	const onNInput = (event: Event) => {
		const next = parseIntegerInput((event.currentTarget as HTMLInputElement).value);
		if (next === null) {
			return;
		}

		setQuantumFieldValue('n', next);
	};
	const onLInput = (event: Event) => {
		const next = parseIntegerInput((event.currentTarget as HTMLInputElement).value);
		if (next === null) {
			return;
		}

		setQuantumFieldValue('l', next);
	};
	const onMInput = (event: Event) => {
		const next = parseIntegerInput((event.currentTarget as HTMLInputElement).value);
		if (next === null) {
			return;
		}

		setQuantumFieldValue('m', next);
	};
	const onMobileQuantumInput = (event: Event) => {
		const next = parseIntegerInput((event.currentTarget as HTMLInputElement).value);
		if (next === null) {
			return;
		}

		setQuantumFieldValue(mobileQuantumField, next);
	};

	let atomicNumber = $derived(bohrSimulationValues.atomicNumber);

	const mode = $derived(visualizationState.mode);

	const btnActive =
		'border-[rgba(44,61,75,0.95)] bg-[rgba(44,61,75,0.95)] text-[rgba(243,229,205,0.98)]';
	const btnInactive =
		'border-[rgba(44,61,75,0.68)] bg-transparent text-[rgba(44,61,75,0.95)] hover:bg-[rgba(44,61,75,0.1)]';
	const stepperBtn =
		'inline-flex h-8 w-8 items-center justify-center rounded border text-sm leading-none font-semibold transition hover:cursor-pointer';
	const valueInput =
		'w-10 appearance-none border-0 border-b border-[rgba(44,61,75,0.28)] bg-transparent px-1 py-1 text-center text-sm font-semibold tabular-nums text-[rgba(44,61,75,0.98)] outline-none shadow-none transition hover:border-[rgba(44,61,75,0.52)] focus:border-[rgba(44,61,75,0.52)] focus:bg-transparent focus:ring-0';
	const stdBtn =
		'rounded border px-3 py-1 text-xs leading-4 font-medium transition hover:cursor-pointer';
	const modeToggleBtn =
		'inline-flex items-center gap-2 rounded-full border border-[rgba(44,61,75,0.18)] bg-[linear-gradient(180deg,rgba(44,61,75,0.98),rgba(30,42,53,0.96))] px-3 py-1.5 text-xs font-semibold tracking-[0.08em] text-[rgba(243,229,205,0.98)] uppercase shadow-[0_10px_24px_rgba(44,61,75,0.16)] transition hover:cursor-pointer hover:border-[rgba(184,138,71,0.5)] hover:bg-[linear-gradient(180deg,rgba(56,75,89,0.98),rgba(35,48,61,0.96))]';
	const disBtn = 'disabled:opacity-45 disabled:hover:bg-transparent';
	const boBtn = `rounded border border-[rgba(44,61,75,0.68)] px-3 py-1 text-xs leading-4 text-[rgba(44,61,75,0.95)] hover:cursor-pointer hover:bg-[rgba(44,61,75,0.1)]`;
	const label = 'text-[13px] font-bold tracking-[0.14em] text-[rgba(44,61,75,0.98)] uppercase';
	let focusedQuantumField = $state<'n' | 'l' | 'm' | null>(null);

	const parseIntegerInput = (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) {
			return null;
		}

		const parsed = Number.parseInt(trimmed, 10);
		return Number.isNaN(parsed) ? null : parsed;
	};

	const onWindowPointerDown = (event: PointerEvent) => {
		if (!profileMenuOpen || !profileMenuRef) {
			return;
		}

		if (!profileMenuRef.contains(event.target as Node)) {
			profileMenuOpen = false;
		}
	};

	onMount(() => {
		window.addEventListener('pointerdown', onWindowPointerDown);

		return () => {
			window.removeEventListener('pointerdown', onWindowPointerDown);
		};
	});

	const signOutAndReload = async () => {
		const { signOut } = await import('$lib/auth-client');
		await signOut();
		location.reload();
	};
</script>

<div class="z-20 bg-[var(--museum-surface)] px-3 py-2 md:px-4 md:py-2.5">
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[rgba(44,61,75,0.95)]">
		{#if mode === 'orbital'}
			<div class="hidden flex-wrap items-center gap-x-4 gap-y-2 xl:flex">
				<div class="relative flex items-center gap-1.5">
					<span class={label}>n</span>
					<button
						type="button"
						class="{stepperBtn} {btnInactive} {disBtn}"
						onclick={() => stepN(-1)}
						disabled={simulationValues.n <= nMin}
					>
						-
					</button>
					<input
						type="number"
						class={valueInput}
						min={nMin}
						max={nMax}
						step="1"
						value={simulationValues.n}
						oninput={onNInput}
						onfocus={() => (focusedQuantumField = 'n')}
						onblur={() => (focusedQuantumField = null)}
						aria-label="Principal quantum number n"
					/>
					<button
						type="button"
						class="{stepperBtn} {btnInactive} {disBtn}"
						onclick={() => stepN(1)}
						disabled={simulationValues.n >= nMax}
					>
						+
					</button>
					{#if focusedQuantumField === 'n'}
						<div
							class="absolute top-[calc(100%+0.45rem)] left-1/2 z-20 -translate-x-1/2 rounded-full border border-[rgba(44,61,75,0.12)] bg-[rgba(247,241,230,0.96)] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-[rgba(44,61,75,0.78)] shadow-[0_10px_24px_rgba(44,61,75,0.08)]"
						>
							Valid range: {nMin} -> {nMax}
						</div>
					{/if}
				</div>

				<div class="relative flex items-center gap-1.5">
					<span class={label}>l</span>
					<button
						type="button"
						class="{stepperBtn} {btnInactive} {disBtn}"
						onclick={() => stepL(-1)}
						disabled={simulationValues.l <= 0}
					>
						-
					</button>
					<input
						type="number"
						class={valueInput}
						min="0"
						max={Math.max(0, simulationValues.n - 1)}
						step="1"
						value={simulationValues.l}
						oninput={onLInput}
						onfocus={() => (focusedQuantumField = 'l')}
						onblur={() => (focusedQuantumField = null)}
						aria-label="Azimuthal quantum number l"
					/>
					<button
						type="button"
						class="{stepperBtn} {btnInactive} {disBtn}"
						onclick={() => stepL(1)}
						disabled={simulationValues.l >= simulationValues.n - 1}
					>
						+
					</button>
					{#if focusedQuantumField === 'l'}
						<div
							class="absolute top-[calc(100%+0.45rem)] left-1/2 z-20 -translate-x-1/2 rounded-full border border-[rgba(44,61,75,0.12)] bg-[rgba(247,241,230,0.96)] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-[rgba(44,61,75,0.78)] shadow-[0_10px_24px_rgba(44,61,75,0.08)]"
						>
							Valid range: 0 -> {Math.max(0, simulationValues.n - 1)}
						</div>
					{/if}
				</div>

				<div class="relative flex items-center gap-1.5">
					<span class={label}>m</span>
					<button
						type="button"
						class="{stepperBtn} {btnInactive} {disBtn}"
						onclick={() => stepM(-1)}
						disabled={simulationValues.m <= -simulationValues.l}
					>
						-
					</button>
					<input
						type="number"
						class={valueInput}
						min={-simulationValues.l}
						max={simulationValues.l}
						step="1"
						value={simulationValues.m}
						oninput={onMInput}
						onfocus={() => (focusedQuantumField = 'm')}
						onblur={() => (focusedQuantumField = null)}
						aria-label="Magnetic quantum number m"
					/>
					<button
						type="button"
						class="{stepperBtn} {btnInactive} {disBtn}"
						onclick={() => stepM(1)}
						disabled={simulationValues.m >= simulationValues.l}
					>
						+
					</button>
					{#if focusedQuantumField === 'm'}
						<div
							class="absolute top-[calc(100%+0.45rem)] left-1/2 z-20 -translate-x-1/2 rounded-full border border-[rgba(44,61,75,0.12)] bg-[rgba(247,241,230,0.96)] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-[rgba(44,61,75,0.78)] shadow-[0_10px_24px_rgba(44,61,75,0.08)]"
						>
							Valid range: {-simulationValues.l >= 0 ? '' : ''}{-simulationValues.l} -> +{simulationValues.l}
						</div>
					{/if}
				</div>

				<div class="flex flex-wrap items-center gap-1.5">
					<button
						type="button"
						class="{stdBtn} {hidePositiveQuadrant ? btnActive : btnInactive}"
						onclick={() => setPositiveXYCrossSectionHidden(!hidePositiveQuadrant)}
					>
						{hidePositiveQuadrant ? 'Show cross section' : 'Hide cross section'}
					</button>
				</div>
			</div>

			<div class="relative flex items-center gap-1.5 xl:hidden">
				<div
					class="inline-flex rounded-full border border-[rgba(44,61,75,0.16)] bg-[rgba(255,255,255,0.42)] p-0.5"
				>
					{#each ['n', 'l', 'm'] as field}
						<button
							type="button"
							class="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase transition {mobileQuantumField ===
							field
								? 'bg-[rgba(44,61,75,0.95)] text-[rgba(243,229,205,0.98)]'
								: 'text-[rgba(44,61,75,0.9)]'}"
							onclick={() => (mobileQuantumField = field as 'n' | 'l' | 'm')}
						>
							{field}
						</button>
					{/each}
				</div>
				<button
					type="button"
					class="{stepperBtn} {btnInactive} {disBtn}"
					onclick={() => stepQuantumField(mobileQuantumField, -1)}
					disabled={getQuantumValue(mobileQuantumField) <= getQuantumRange(mobileQuantumField).min}
				>
					-
				</button>
				<input
					type="number"
					class={valueInput}
					min={getQuantumRange(mobileQuantumField).min}
					max={getQuantumRange(mobileQuantumField).max}
					step="1"
					value={getQuantumValue(mobileQuantumField)}
					oninput={onMobileQuantumInput}
					onfocus={() => (focusedQuantumField = mobileQuantumField)}
					onblur={() => (focusedQuantumField = null)}
					aria-label={`Quantum number ${mobileQuantumField}`}
				/>
				<button
					type="button"
					class="{stepperBtn} {btnInactive} {disBtn}"
					onclick={() => stepQuantumField(mobileQuantumField, 1)}
					disabled={getQuantumValue(mobileQuantumField) >= getQuantumRange(mobileQuantumField).max}
				>
					+
				</button>
				{#if focusedQuantumField === mobileQuantumField}
					<div
						class="absolute top-[calc(100%+0.45rem)] left-1/2 z-20 -translate-x-1/2 rounded-full border border-[rgba(44,61,75,0.12)] bg-[rgba(247,241,230,0.96)] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-[rgba(44,61,75,0.78)] shadow-[0_10px_24px_rgba(44,61,75,0.08)]"
					>
						Valid range: {getQuantumRange(mobileQuantumField).min} -> {mobileQuantumField === 'm'
							? '+'
							: ''}{getQuantumRange(mobileQuantumField).max}
					</div>
				{/if}
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

				<span
					class="text-[11px] font-bold tracking-[0.1em] text-[rgba(44,61,75,0.98)] uppercase sm:text-[13px] sm:tracking-[0.14em]"
				>
					Bohr model 3D &middot; Z={atomicNumber}
				</span>

				<button
					type="button"
					class="{boBtn} {disBtn}"
					onclick={() => clampAtomicNumber(atomicNumber + 1)}
					disabled={atomicNumber >= 20}
				>
					+1
				</button>
			</div>
		{/if}

		{#if chatEnabled}
			<div class="ml-auto shrink-0 sm:hidden">
				<div
					class="shrink-0 transition-[transform,margin] duration-300 ease-out"
					style:transform={showChat ? 'translateX(4.5rem)' : 'translateX(0)'}
					style:margin-right={showChat ? '-0.5rem' : '0'}
				>
					<div
						class="overflow-hidden transition-[max-width,opacity,transform,margin] duration-300 ease-out"
						style:max-width={showChat ? '0px' : '10rem'}
						style:opacity={showChat ? '0' : '1'}
						style:transform={showChat ? 'translateX(4.5rem)' : 'translateX(0)'}
						style:margin-right={showChat ? '-0.5rem' : '0'}
					>
						<button
							type="button"
							class="museum-button inline-flex items-center justify-center rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all duration-300 ease-in-out hover:cursor-pointer"
							onclick={openChat}
							aria-label="Open chat"
						>
							<MessageSquare class="text-base" />
						</button>
					</div>
				</div>
			</div>
		{/if}

		<div class="flex w-full items-center justify-between gap-2 sm:contents sm:w-auto">
			<button
				type="button"
				class={modeToggleBtn}
				onclick={() => (visualizationState.mode = mode === 'orbital' ? 'bohr' : 'orbital')}
			>
				Switch to {mode === 'orbital' ? 'Bohr' : 'Orbital'}
			</button>

			{#if chatEnabled}
				<div class="flex items-center justify-end gap-2 overflow-visible sm:ml-auto">
					{#if user}
						<div
							class="relative shrink-0 transition-transform duration-300 ease-out"
							style:transform={showChat ? 'translateX(0)' : 'translateX(0)'}
							bind:this={profileMenuRef}
						>
							<button
								type="button"
								class="block rounded-full transition hover:cursor-pointer focus:ring-2 focus:ring-[rgba(44,61,75,0.2)] focus:outline-none"
								onclick={() => (profileMenuOpen = !profileMenuOpen)}
								aria-haspopup="menu"
								aria-expanded={profileMenuOpen}
							>
								{#if user.image}
									<img
										src={user.image}
										alt="profile"
										class="h-9 w-9 rounded-full border border-[var(--museum-stroke)] object-cover"
									/>
								{:else}
									<div
										class="h-9 w-9 rounded-full border border-[var(--museum-stroke)] bg-[rgba(202,186,164,0.45)]"
									></div>
								{/if}
							</button>

							{#if profileMenuOpen}
								<div
									class="absolute top-[calc(100%+0.5rem)] right-0 z-30 min-w-[11rem] rounded-2xl border border-[var(--museum-stroke)] bg-[rgba(247,241,230,0.98)] p-1.5 shadow-[0_18px_50px_rgba(44,61,75,0.16)]"
									role="menu"
								>
									{#if isAdmin}
										<button
											type="button"
											class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-[var(--museum-text)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.08)]"
											onclick={() => {
												profileMenuOpen = false;
												void goto(resolve('/dashboard'));
											}}
											role="menuitem"
										>
											Dashboard
										</button>
									{/if}
									<button
										type="button"
										class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-[var(--museum-text)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.08)]"
										onclick={() => {
											profileMenuOpen = false;
											void goto(resolve('/about'));
										}}
										role="menuitem"
									>
										About
									</button>
									<button
										type="button"
										class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-[var(--museum-text)] transition hover:cursor-pointer hover:bg-[rgba(44,61,75,0.08)]"
										onclick={() => {
											profileMenuOpen = false;
											void goto(resolve('/privacy'));
										}}
										role="menuitem"
									>
										Privacy
									</button>
									<button
										type="button"
										class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-[rgba(168,58,46,0.98)] transition hover:cursor-pointer hover:bg-[rgba(168,58,46,0.08)]"
										onclick={async () => {
											profileMenuOpen = false;
											await signOutAndReload();
										}}
										role="menuitem"
									>
										<LogOut class="text-base" />
										Logout
									</button>
								</div>
							{/if}
						</div>
					{:else}
						<div
							class="shrink-0 transition-transform duration-300 ease-out"
							style:transform={showChat ? 'translateX(0)' : 'translateX(0)'}
						>
							<button
								type="button"
								class="museum-button rounded-full px-3 py-1.5 text-xs font-semibold hover:cursor-pointer"
								onclick={() => void goto(resolve('/login'))}
							>
								Log in
							</button>
						</div>
					{/if}

					<div
						class="hidden shrink-0 transition-[transform,margin] duration-300 ease-out sm:block"
						style:transform={showChat ? 'translateX(4.5rem)' : 'translateX(0)'}
						style:margin-right={showChat ? '-0.5rem' : '0'}
					>
						<div
							class="overflow-hidden transition-[max-width,opacity,transform,margin] duration-300 ease-out"
							style:max-width={showChat ? '0px' : '10rem'}
							style:opacity={showChat ? '0' : '1'}
							style:transform={showChat ? 'translateX(4.5rem)' : 'translateX(0)'}
							style:margin-right={showChat ? '-0.5rem' : '0'}
						>
							<button
								type="button"
								class="museum-button inline-flex items-center justify-center rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all duration-300 ease-in-out hover:cursor-pointer"
								onclick={openChat}
								aria-label="Open chat"
							>
								<MessageSquare class="text-base" />
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	input[type='number']::-webkit-outer-spin-button,
	input[type='number']::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
