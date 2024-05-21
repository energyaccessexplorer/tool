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

export function email() {
	const token = localStorage.getItem('token');

	try {
		return (token && jwt_decode(token)['email']);
	} catch (e) {
		return null;
	}
};

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
