# Energy Access Explorer Tool

This is the source code for the primary visualisation of the platform. A live
version found [here](https://www.energyaccessexplorer.org/).

## Development

Is written in plain/modern Javascript (ECMAScript 2020) for now. No framework,
instead traditional C-style programming pattern is enforced.

As usual, the directories contain
- `src`: JavaScript code
- `stylesheets`: CSS code
- `views`: HTML documents
- `bin`: scripts and executables

## Dependencies
Libraries have been chosen very strictly. The big ones are:
- [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js)
- [geotiff](https://github.com/geotiffjs/geotiff.js) for raster parsing
- [D3js](https://d3js.org) to generate interactive controls such as sliders,
  pie-charts, etc.
- [jspdf](https://parall.ax/products/jspdf) reports export

Other minor plugins/functions are used. See `dependencies.tsv`.

## Building & hacking

Assumptions made:

- standard Unix-like environment (cat, sed, echo, rsync, bmake...)
- Energy Access Explorer infrastructure:
  [database](https://github.com/energyaccessexplorer/database),
  [API](https://github.com/energyaccessexplorer/api) and
  [website](https://github.com/energyaccessexplorer/website)
  should be up and running.

The `makefile` (BSDmake) contains basic tasks for development/deployment. To get
started, edit the `.env` file to match your needs.

Now you can run in development mode with (`bmake` in Linux):

    $ make build start

## License

This project is licensed under MIT. Additionally, you must read the
[attribution page](https://www.energyaccessexplorer.org/attribution)
before using any part of this project.
