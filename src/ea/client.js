function ea_client_connection_errors(err, endpoint) {
  ea_ui_flash('error', err, endpoint);
  throw Error(err);
}

function ea_client_errors(response) {
  if (!response.ok) {
    console.log(response);
    ea_ui_flash('error', `${response.status}: ${response.statusText}`, response.url);
    throw Error(response.statusText);
  }

  return response;
}

async function ea_client(endpoint, method, payload, callback) {
  switch (method) {
  case "POST":
		await fetch(endpoint, {
			method: 'POST',
			headers: { "Accept": "application/json", "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})
      .catch((e) => ea_client_connection_errors(e, endpoint))
      .then(ea_client_errors)
      .then(async (r) => await callback(await r.json()));
    break;

  case "GET":
		await fetch(endpoint)
      .catch((e) => ea_client_connection_errors(e, endpoint))
      .then(ea_client_errors)
      .then(async (r) => await callback(await r.json()))
    break;

  default:
    throw `Unknown method ${method}`;
    break;
  }
}
