// Supabase Auth over REST, for whichever session the website or admin left in
// localStorage. The tool has no login UI of its own: it only keeps that
// session's access token fresh.

const ACCESS_KEY = 'token';
const REFRESH_KEY = 'refresh_token';

let pending = null;

function settings() {
	return (window.EAE && EAE['settings']) || {};
};

export function access_token() {
	return localStorage.getItem(ACCESS_KEY);
};

export function apikey() {
	return settings()['supabase_anon_key'];
};

export function clear() {
	localStorage.removeItem(ACCESS_KEY);
	localStorage.removeItem(REFRESH_KEY);
};

export function store(session) {
	if (session.access_token) localStorage.setItem(ACCESS_KEY, session.access_token);
	if (session.refresh_token) localStorage.setItem(REFRESH_KEY, session.refresh_token);
};

// GoTrue rotates the refresh token on use, so concurrent 401s have to share one
// grant: a second would present a token the first already spent.
export function renew() {
	const s = settings();
	const rt = localStorage.getItem(REFRESH_KEY);

	if (!s['supabase_url'] || !rt) return Promise.resolve(null);

	if (!pending)
		pending = fetch(`${s['supabase_url']}/auth/v1/token?grant_type=refresh_token`, {
			"method":  'POST',
			"headers": {
				"Content-Type": 'application/json',
				"apikey":       s['supabase_anon_key'],
			},
			"body": JSON.stringify({ "refresh_token": rt }),
		})
			.then(r => r.ok ? r.json() : null)
			.then(session => {
				if (!session) {
					clear();

					return null;
				}

				store(session);

				return session.access_token;
			})
			.catch(_ => {
				clear();

				return null;
			})
			.finally(_ => { pending = null; });

	return pending;
};
