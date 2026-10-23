type ClaimsResult = {
	data: { claims: { sub: string } } | null;
	error: { message: string } | null;
};

export const supabase = {
	auth: {
		result: { data: null, error: null } as ClaimsResult,
		async getClaims() {
			return this.result;
		},
	},
};
