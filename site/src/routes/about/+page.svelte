<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<div class="museum-shell">
	<section class="museum-frame overflow-y-auto">
		<div class="mx-auto w-full max-w-2xl px-4 py-10 md:px-6 md:py-16">
			<h1 class="museum-title">About</h1>

			<div
				class="prose prose-sm mt-6 max-w-none text-[var(--museum-text)] md:prose-base prose-headings:font-['Cormorant_Garamond'] prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-[var(--museum-accent)] prose-a:no-underline hover:prose-a:underline"
			>
				<p>
					This is an interactive 3D visualization and educational tool designed to make quantum
					mechanical concepts tangible. Explore atomic orbitals, electron shells, and standing waves
					through real-time simulations powered by a custom renderer.
				</p>

				<h2>What you can do</h2>
				<ul>
					<li>
						<strong>Orbital view</strong> &mdash; Visualize electron probability clouds (s, p, d, f
						orbitals) in 3D. Adjust quantum numbers <em>n</em>, <em>l</em>, and <em>m</em>{' '}
						to explore how orbital shapes change.
					</li>
					<li>
						<strong>Bohr view</strong> &mdash; Switch to a classical planetary-electron model that shows
						electron shell filling for any element.
					</li>
					<li>
						<strong>AI chat</strong> &mdash; Ask questions about atomic structure, quantum mechanics,
						or chemistry. The assistant can update the simulation and guide your curiosity to help you
						understand quantum mechanics.
					</li>
				</ul>

				<h2>Technology</h2>
				<p>
					The 3D visualizations run entirely in your browser using WebGL and a dedicated Web Worker
					for physics computations. The chat interface uses a Large Language Model to provide
					interactive tutoring, with tool-calling support to control the simulation dynamically.
				</p>

				<h2>Project</h2>
				<p>
					This is an open-source project. You can find the source code on{' '}
					<a
						href="https://github.com/plumocracy/atom-explainer"
						target="_blank"
						rel="noopener noreferrer">GitHub</a
					>
				</p>
			</div>
		</div>

		<footer class="border-t border-[var(--museum-stroke)] px-4 py-4 md:px-6">
			<div
				class="mx-auto flex max-w-2xl items-center justify-center gap-4 text-xs text-[var(--museum-subtext)]"
			>
				<a href={resolve('/')} class="transition hover:text-[var(--museum-text)]">Home</a>
				<a href={resolve('/privacy')} class="transition hover:text-[var(--museum-text)]">Privacy</a>
			</div>
		</footer>
	</section>
</div>
