<span class="spinner" aria-hidden="true"></span>

<style>
	.spinner {
		display: inline-block;
		width: 1em;
		height: 1em;
		flex-shrink: 0;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.75s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
