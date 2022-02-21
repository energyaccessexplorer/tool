export function logged_in() {
	const token = localStorage.getItem('token');

	try {
		return (token && jwt_decode(token)['email']);
	} catch (e) {
		return false;
	}
};
