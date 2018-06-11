function ea_client_connection_errors(err,ds) {
  ea_ui_flash('error', err, ds.endpoint);
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

async function ea_client(ds, method, payload, callback) {
  switch (method) {
  case "POST":
		await fetch(ds.endpoint, {
			method: 'POST',
			headers: { "Accept": "application/json", "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})
      .catch((e) => ea_client_connection_errors(e,ds))
      .then(ea_client_errors)
      .then(async (r) => await callback(await r.json()));
    break;

  case "GET":
		await fetch(ds.endpoint)
      .catch((e) => ea_client_connection_errors(e,ds))
      .then(ea_client_errors)
      .then(async (r) => await callback(await r.json()))
    break;

  default:
    throw `Unknown method ${method}`;
    break;
  }
}
