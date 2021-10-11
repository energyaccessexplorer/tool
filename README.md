# Energy Access Explorer Tool

This is the source code for the primary visualisation of the platform. A live
version found [here](https://energyaccessexplorer.org/).

## Development

Is written in plain/modern Javascript (ES6). No framework was chosen. Instead
traditional C-style programming pattern is enforced. Libraries have been chosen
very strictly.

As usual, the directories contain
- `src`: JavaScript code
- `stylesheets`: CSS code
- `views`: HTML documents

## Dependencies
- [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js)
- [geotiff](https://github.com/geotiffjs/geotiff.js) for raster parsing
- [D3js](https://d3js.org) to generate interactive controls such as sliders,
  icons, pie-charts, checkboxes and radio buttons to fit the design needs.

A few plugins are used only for convinience. See `dependencies.tsv`.

## Building & hacking

Assumptions made:

- development is in a Unix-like environment (cat, sed, echo, make...)
- [PostgREST](https://postgrest.org) is installed.
- an PostgreSQL instance is running and also the
  [database](https://github.com/energyaccessexplorer/database)
- a web server
- (optionally) rsync
- (optionally) the website is running. See the
  [website](https://github.com/energyaccessexplorer/website)

The `makefile` contains basic tasks for development/deployment. To get
started, you will need to

    $ cp default.mk-sample default.mk

and configure `default.mk` to your needs. Then

    $ cp settings.json-sample settings.json

set the PostgREST endpoint (something like `http://localhost:{PGREST_PORT}` or
`https://some-api.example.org/`) and add your _mapbox token_.

Now you can run in development mode with:

    $ make build start watch

## License

This project is licensed under MIT. Additionally, please read the
[attribution page](https://www.energyaccessexplorer.org/attribution)
before using any part of this project.
