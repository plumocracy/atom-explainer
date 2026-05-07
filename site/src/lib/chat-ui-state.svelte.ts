export const chatUiState = $state({
	loading: false,
	toolCalling: false,
	conversationId: null as string | null
});

export const chatHandoffState = $state({
	active: false,
	conversationId: null as string | null,
	draft: null as string | null
});
