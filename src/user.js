import modal from '../lib/modal.js';

export function register_login() {
	const d = document.createElement('div');
	const p1 = document.createElement('p');
	const p2 = document.createElement('p');

	p1.innerText = "In order to save an analysis, you need to be registered with us.";
	p2.innerHTML = `
<div style="display: flex; justify-content: space-around;">
	<a href="/login">Login</a>
	<a href="/subscribe/?select=account">Register</a>
</div>
`;

	d.append(p1, p2);

	const m = new modal({
		"header":  "Register/Login",
		"content": d,
	});

	m.show();
};

export function extract(...path) {
	const token = localStorage.getItem('token');

	if (!token) {
		console.warn("Could not fetch token from localStorage.");
		return null;
	};

	try {
		return maybe(jwt_decode(token), ...path);
	} catch (e) {
		console.warning(e);
		return null;
	}
};

export function envs() {
	let p = ['production'];

	if (extract('id'))
		p = p.concat(coalesce(extract('data', 'envs'), []));

	return p;
};
