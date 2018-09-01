function ea_client_check(response) {
  // console.log("ea_client_check - response is OK:", response.ok, response);

  if (response.ok) return response;

  flash()
    .type('error')
    .title(`${response.status}: ${response.statusText}`)
    .message(response.url)();

  throw Error(response.statusText);
};

async function ea_client(endpoint, method, payload, callback) {
  const options = {
		headers: { "Accept": "application/json", "Content-Type": "application/json" },
	};

  switch (method) {
  case "POST": {
    options.method = 'POST';
    options.body = JSON.stringify(payload);

		await fetch(endpoint, options)
      .then(ea_client_check)
      .then(async (r) => await callback(await r.json()));
    break;
  }

  case "GET": {
    if (payload == 1) options.headers['Accept'] = "application/vnd.pgrst.object+json";

		await fetch(endpoint, options)
      .then(ea_client_check)
      .then(async r => await callback(await r.json()))
    break;
  }

  default: {
    throw `Unknown method ${method}`;
    break;
  }
  }
};
