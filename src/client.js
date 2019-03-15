function ea_client_check(response) {
  if (response.ok) return response;

  ea_flash
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

    return fetch(endpoint, options)
      .then(ea_client_check)
      .then(r => r.json())
      .then(j => callback(j));

    break;
  }

  case "GET": {
    if (payload == 1) options.headers['Accept'] = "application/vnd.pgrst.object+json";

    return fetch(endpoint, options)
      .then(ea_client_check)
      .then(r => r.json())
      .then(j => callback(j))

    break;
  }

  default: {
    throw `Unknown method ${method}`;
    break;
  }
  }
};
