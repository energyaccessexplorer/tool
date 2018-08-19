function ea_client_check(response) {
  // console.log("ea_client_check - response is OK:", response.ok, response);

  if (response.ok) return response;

  ea_ui_flash('error', `${response.status}: ${response.statusText}`, response.url);
  throw Error(response.statusText);
};

async function ea_client(endpoint, method, payload, callback) {
  switch (method) {
  case "POST": {
    const options = {
			method: 'POST',
			headers: { "Accept": "application/json", "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		};

		await fetch(endpoint, options)
      .then(ea_client_check)
      .then(async (r) => await callback(await r.json()));
    break;
  }

  case "GET": {
		await fetch(endpoint)
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
