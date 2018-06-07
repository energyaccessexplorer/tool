async function ea_endpoint(ds, method, payload, callback) {
  switch (method) {
  case "POST":
		await fetch(ds.endpoint, {
			method: 'POST',
			headers: { "Accept": "application/json", "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		}).then(async (r) => await callback(await r.json()) );
    break;

  case "GET":
		var response = await fetch(ds.endpoint).then(async (r) => await callback(await r.json()));;
    break;

  default:
    throw `Unknown method ${method}`;
    break;
  }
}
