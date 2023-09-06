export function logged_in() {
	const token = localStorage.getItem('token');

	try {
		return (token && jwt_decode(token)['id']);
	} catch (e) {
		return false;
	}
};

export function envs() {
	const token = localStorage.getItem('token');

	const p = ['production'];

	if (logged_in())
		return coalesce(maybe(jwt_decode(token), 'data', 'envs'), p);

	return p;
};
