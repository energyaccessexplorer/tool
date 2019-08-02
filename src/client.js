function ea_client_check(response) {
  if (response.ok) return response;

  throw Error(response.statusText);
};

async function ea_client(endpoint, method = 'GET', payload = null) {
  const options = {
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
  };

  switch (method) {
  case "POST": {
    options.method = 'POST';
    options.body = JSON.stringify(payload);

    return fetch(endpoint, options)
      .then(ea_client_check)
      .then(r => r.json());

    break;
  }

  case "GET": {
    if (payload == 1) options.headers['Accept'] = "application/vnd.pgrst.object+json";

    return fetch(endpoint, options)
      .then(ea_client_check)
      .then(r => r.json());

    break;
  }

  default: {
    throw `Unknown method ${method}`;
    break;
  }
  }
};
