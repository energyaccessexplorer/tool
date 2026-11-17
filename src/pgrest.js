import {
	access_token,
	apikey,
	clear,
	renew,
} from './auth.js';

export default class pgrest {
	constructor(base, flash, login_redirect) {
		this.base = base;
		this.flash = flash || { "push": x => console.log(x), "clear": _ => null };
		this.login_redirect = typeof login_redirect === 'function' ? login_redirect : _ => null;

		return this;
	};

	async parse(response, request, options = {}) {
		if (request.method === "HEAD")
			return response.headers;

		let body;

		try {
			switch (options.expect) {
			case 'csv':
			case 'text':
				body = await response.text();
				break;

			case 'blob':
				body = await response.blob();
				break;

			case 'json':
			default:
				body = await response.json();
				break;
			}
		}
		catch (err) {
			console.error(err);
			body = { "message": `pgrst#parse: failed to parse '${options.expect}' response` };
		}

		return body;
	};

	req(method, options) {
		const {contenttype, one, expect, count, schema} = options;

		const t = access_token();

		const r = {
			"method":  method,
			"headers": {
				"Authorization": t ? `Bearer ${t}` : undefined,
				"Content-Type":  (contenttype || 'application/json'),
				"apikey":        apikey(),
			},
		};

		if (one) r.headers['Accept'] = "application/vnd.pgrst.object+json";

		if (expect === 'csv') r.headers['Accept'] = "text/csv";

		if (count) r.headers['Prefer'] = "count=exact";

		if (schema) {
			switch (method) {
			case "GET":
			case "HEAD": {
				r.headers['Accept-Profile'] = schema;
				break;
			}

			case "POST":
			case "PATCH":
			case "DELETE": {
				r.headers['Content-Profile'] = schema;
				break;
			}

			default:
				break;
			}
		}

		for (const k in r.headers)
			if (undefined === r.headers[k]) delete r.headers[k];

		return r;
	};

	renewed(url, request) {
		return fetch(url, request)
			.catch(_ => ({
				"ok":     false,
				"status": 0,
				"json":   _ => null,
			}))
			.then(r => {
				if (r.status !== 401) return r;

				return renew()
					.then(t => t ? fetch(url, { ...request, "headers": { ...request.headers, "Authorization": `Bearer ${t}` } }) : r)
					.catch(_ => r);
			});
	};

	go(request, table, params = {}, options = {}) {
		const url = new URL(this.base + "/" + table);

		for (const k in params) {
			let v = params[k];
			if (v instanceof Array) v = params[k].join(',');

			url.searchParams.set(k,v);
		}

		return this.renewed(url, request)
			.then(async r => {
				if (r.ok) return this.parse(r, request, options);

				let body = {};
				let title, message;

				if (r.status !== 0) {
					body = r.headers.get('content-type').match(/application\/json/) ?
						await r.json() :
						{ "message": await r.text() };
				}

				title = (r.statusText === "") ? `Status code: ${r.status}` : r.statusText;
				message = body.message;

				switch (r.status) {
				case 0: {
					title = "Connection error";
					message = "No response from server";
					break;
				}

				case 400: {
					title = "Bad Request";
					break;
				}

				case 401: {
					message = "Authentication token expired or invalid. Log in again.";

					clear();
					this.login_redirect();

					break;
				}

				case 406: {
					if (request.headers['Accept'] !== "application/vnd.pgrst.object+json")
						break;

					if (body.details === "The result contains 0 rows") {
						title = "No result";
						message = `Not enough permissions (?)`;
					} else if (body.details.match(/The result contains [0-9]+ rows/)) {
						title = "Too many results";
						message = "This may be a bug." + "\n\n" + url;
					}

					break;
				}

				case 500: {
					title = "Server crash";
					message = "This is probably a bug";
					break;
				}

				case 502: {
					title = "Service is not running!";
					message = `NOT GOOD. Contact someone that knows better. Tell them: "Gateway Error"`;
					break;
				}

				default: {
					break;
				}
				}

				this.flash.push({ "type": "error", title, message });

				console.error(r);

				return null;
			});
	};

	get(table, _, options = {}) {
		const req = this.req('GET', options);
		return this.go.call(this, req, ...arguments);
	};

	head(table, _, options = {}) {
		const req = this.req('HEAD', options);
		return this.go.call(this, req, ...arguments);
	};

	post(table, _, options = {}) {
		const req = this.req('POST', options);

		req.headers["Prefer"] = "return=representation";
		if (req.headers['Content-Type'] === 'multipart/form-data')
			delete req.headers['Content-Type']; // OMFG...

		if (options.payload) {
			req.body = (req.headers['Content-Type'] === 'application/json') ?
				JSON.stringify(options.payload) :
				options.payload;
		}

		return this.go.call(this, req, ...arguments);
	};

	patch(table, _, options = {}) {
		const req = this.req('PATCH', options);
		req.headers["Prefer"] = "return=representation";

		if (options.payload) {
			req.body = (req.headers['Content-Type'] === 'application/json') ?
				JSON.stringify(options.payload) :
				options.payload;
		}

		return this.go.call(this, req, ...arguments);
	};

	delete(table, _, options = {}) {
		const req = this.req('DELETE', options);
		req.headers["Prefer"] = "return=representation";

		return this.go.call(this, req, ...arguments);
	};
};
