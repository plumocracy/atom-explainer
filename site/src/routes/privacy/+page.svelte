<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<div class="museum-shell">
	<section class="museum-frame overflow-y-auto bg-[var(--museum-surface)]">
		<div class="mx-auto w-full max-w-2xl px-4 py-10 md:px-6 md:py-16">
			<h1 class="museum-title">Privacy Policy</h1>

			<p class="mt-2 text-sm text-[var(--museum-subtext)]">Last updated: May 7, 2026</p>

			<div
				class="prose prose-sm mt-6 max-w-none text-[var(--museum-text)] md:prose-base prose-headings:font-['Cormorant_Garamond'] prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-[var(--museum-accent)] prose-a:no-underline hover:prose-a:underline"
			>
				<h2>1. What we collect</h2>
				<p>
					<strong>Account information.</strong> If you sign in with GitHub or Google, we receive your
					name, email address, and avatar image from the provider. We do not receive or store your password.
				</p>
				<p>
					<strong>Chat messages.</strong> The messages you send through the chat interface are stored
					to provide conversation history and improve your experience.
				</p>
				<p>
					<strong>Usage data.</strong> We may collect anonymous usage statistics (page views, visualization
					interactions) to improve the application. No personally identifiable information is included
					in this data.
				</p>
				<p>
					<strong>Cookies.</strong> We use essential cookies for session management and authentication.
					No third-party tracking cookies are used.
				</p>

				<h2>2. How we use your data</h2>
				<ul>
					<li>To provide and maintain the chat and visualization services.</li>
					<li>To authenticate you and manage your account.</li>
					<li>To improve the application based on aggregated usage patterns.</li>
					<li>To respond to feedback or support requests.</li>
				</ul>

				<h2>3. Data sharing</h2>
				<p>
					We do not sell your personal data. Chat messages are sent to our AI provider (OpenRouter)
					to generate responses; messages are processed ephemerally and are not used for model
					training. Your account information is never shared with third parties except as required
					by law.
				</p>

				<h2>4. Data retention</h2>
				<p>
					Chat conversations are retained indefinitely to provide conversation history. You may
					request deletion of your account and associated data by contacting us. Anonymous usage
					logs are retained for up to 12 months.
				</p>

				<h2>5. Your rights</h2>
				<p>
					Depending on your jurisdiction, you may have the right to access, correct, or delete your
					personal data. To exercise these rights, please reach out through the project's{' '}
					<a
						href="https://github.com/plumocracy/atom-explainer"
						target="_blank"
						rel="noopener noreferrer">GitHub repository</a
					>.
				</p>

				<h2>6. Changes</h2>
				<p>
					We may update this policy from time to time. Material changes will be communicated via the
					application or the project repository.
				</p>

				<h2>7. Contact</h2>
				<p>
					For questions about this policy, please send an email to
					<a href="mailto:info@plumocracy.com"> info@plumocracy.com </a>
				</p>
			</div>
		</div>

		<footer class="border-t border-[var(--museum-stroke)] px-4 py-4 md:px-6">
			<div
				class="mx-auto flex max-w-2xl items-center justify-center gap-4 text-xs text-[var(--museum-subtext)]"
			>
				<a href={resolve('/')} class="transition hover:text-[var(--museum-text)]">Home</a>
				<a href={resolve('/about')} class="transition hover:text-[var(--museum-text)]">About</a>
			</div>
		</footer>
	</section>
</div>
