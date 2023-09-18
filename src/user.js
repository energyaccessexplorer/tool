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

	let p = ['production'];

	if (logged_in())
		p = p.concat(maybe(jwt_decode(token), 'data', 'envs'));

	return p;
};
