# Energy Access Explorer Tool

This is the source code for the primary visualisation of the platform. A live
version found [here](https://www.energyaccessexplorer.org/).

## Development

Is written in plain/modern Javascript (ECMAScript 2020) for now. No framework,
instead traditional C-style programming pattern is enforced.

As usual, the directories contain
- **src**: JavaScript source code for application logic, visualization, and data processing.
- **stylesheets**: CSS files for styling and appearance.
- **views**: HTML templates for the user interface.
- **bin**: Scripts and executable files for development and deployment.

## Dependencies
Libraries have been chosen very strictly. The big ones are:
- [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js): Interactive map rendering and geospatial data visualization.
- [geotiff](https://github.com/geotiffjs/geotiff.js): Parsing and processing GeoTIFF raster data.
- [D3js](https://d3js.org): Creating interactive controls and charts.

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
    bash```
    $ make build start
    ```

## Common Make Commands

- `build-a:` Builds the "analysis" screen, creating the necessary files in the `dist/a` directory. This includes HTML, JavaScript, CSS, and other assets required for the analysis functionality.
- `build-m:` Builds the "my screen" or "my data" section of the application, compiling resources into `dist/m`.
- `build-s:` Builds the "select" or "dataset selection" screen, preparing the files within `dist/s`. This likely handles the interface for choosing datasets to visualize.
- `build:`  The main build command. It invokes `build-a`, `build-s`, and `build-m` to build all parts of the application.
- `default:` The default target, which runs `reconfig`, `build`, and `lint`. This is what executes if you just run `make` without specifying a target.
- `deploy:` Deploys the built application to a remote server specified in the `.env` file. This involves creating and applying patch files and then running `sync`.
- `deps:` Installs project dependencies and sets up necessary font files in the `lib` directory.
- `help:` Generates and updates the "Available Make Commands" section in the `README.md` file.
- `lint:`  Performs code linting using the linting tool specified in the `BIN` variable. This helps maintain code quality and consistency.
- `reconfig:`  Reconfigures the project based on environment variables defined in the `.env` file. It generates a `settings.tmp.json` file containing project settings.
- `start:` Starts a local development server using the `HTTP_SERVER` specified in your .env file to serve the built application.
- `sync:` Synchronizes the `dist` directory with a remote server, effectively deploying the application.  Uses `rsync` to efficiently transfer only changed files.
- `synced:` Performs a dry run of the `sync` command. This simulates the synchronization process without actually transferring any files, allowing you to preview what would be transferred.

## Development Workflow

This project uses `bmake` (BSDmake) for build tasks and other development workflows. See the `Makefile` and run `make help` for more details.

## Contributing

Contributions are welcome! See the project wiki for detailed information on contributing, reporting issues, and making suggestions.

## License

This project is licensed under MIT. Additionally, you must read the
[attribution page](https://www.energyaccessexplorer.org/attribution)
before using any part of this project.
