# Copy and customise these in a default.mk
#
# TOOL_PORT = 4231
#
# SRV_USER = someuser
# SRV_SERVER = example.org
# TOOL_DEST = /srv/http/energyaccessexplorer
#
# API_URL = http://api-example.localhost
# DB_SERV_DEPLOY = https://api.example.org
#
# STATIC_SERVER = python3 -m http.server ${TOOL_PORT}
# WATCH = <whatever daemon you use observe code changes>
#
# MAPBOX_DEFAULT_THEME=mapbox/basic-v9
#
.include <env.mk>

DIST = ./dist
SRC = ./src
VIEWS = ./views
CSS = ./stylesheets
LIB = ${DIST}/lib

TIMESTAMP != date -u +'%Y-%m-%d--%T'

default: reconfig build reload

build: lint build-a build-s build-d

lint:
	@lintit src EA

reload:
	-@chrome-remote-reload

deps:
	DEST=${DIST}/lib deps

start:
	cd ${DIST} && ${STATIC_SERVER}

stop:
	@stop-port ${TOOL_PORT}

build-a:
	@echo "Building analysis screen"
	@mkdir -p ${DIST}/a

	@mustache /dev/null ${VIEWS}/a.html > ${DIST}/a/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/a/index.html

	@cp ${CSS}/ripple.css ${DIST}/a/ripple.css
	@cp ${CSS}/svg.css ${DIST}/a/svg.css
	@cp ${SRC}/{browser,analysis,cards,config,controls,geographies,ds,parse,indexes,mapbox,overlord,plot,report,summary,timeline,views,a}.js ${DIST}/a/

	@cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/html5sortable.js \
		${LIB}/nanny.js \
		${LIB}/selectlist.js \
		${LIB}/dropdown.js \
		${LIB}/pgrest.js \
		> ${DIST}/a/libs.js

	@echo -n "window.ea_settings = " | cat - \
		settings.json \
		${SRC}/utils.js \
		${SRC}/nanny-steps.js \
		${SRC}/globals.js \
		> ${DIST}/a/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/a.css \
		${CSS}/layout.css \
		${CSS}/left-pane.css \
		${CSS}/controls.css \
		${CSS}/maparea.css \
		${CSS}/indexes.css \
		${CSS}/views.css \
		${CSS}/filtered.css \
		${CSS}/ripple.css \
		${CSS}/svg.css \
		${CSS}/summary.css \
		${CSS}/mobile.css \
		${CSS}/cards.css \
		> ${DIST}/a/main.css

build-s:
	@echo "Building select screen"
	@mkdir -p ${DIST}/s

	@mustache /dev/null ${VIEWS}/s.html > ${DIST}/s/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/s/index.html

	@cp ${SRC}/{browser,s}.js ${DIST}/s/

	@cat \
		${LIB}/d3.js \
		${LIB}/topojson.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/modal.js \
		${LIB}/selectlist.js \
		${LIB}/pgrest.js \
		> ${DIST}/s/libs.js

	@echo -n "const ea_settings = " | cat - \
		settings.json \
		${SRC}/utils.js \
		> ${DIST}/s/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/s.css \
		${CSS}/maparea.css \
		${CSS}/views.css \
		${CSS}/ripple.css \
		> ${DIST}/s/main.css

build-d:
	@echo "Building test screen"
	@mkdir -p ${DIST}/d

	@mustache /dev/null ${VIEWS}/d.html > ${DIST}/d/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/d/index.html

	@cp ${CSS}/ripple.css ${DIST}/d/ripple.css
	@cp ${CSS}/svg.css ${DIST}/d/svg.css
	@cp ${SRC}/{cards,timeline,controls,ds,parse,mapbox,overlord,plot,d}.js ${DIST}/d/

	@cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/helpers.js \
		${LIB}/flash.js \
		${LIB}/dropdown.js \
		${LIB}/pgrest.js \
		> ${DIST}/d/libs.js

	@echo -n "window.ea_settings = " | cat - \
		settings.json \
		${SRC}/utils.js \
		${SRC}/globals.js \
		> ${DIST}/d/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/layout.css \
		${CSS}/maparea.css \
		> ${DIST}/d/main.css

sync:
	@rsync -OPrv \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		${DIST}/ ${WEBSITE_SSH_USER}@${WEBSITE_HOST}:${TOOL_DEST}

synced:
	@rsync -OPrv \
		--dry-run \
		--info=FLIST0 \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		${DIST}/ ${WEBSITE_SSH_USER}@${WEBSITE_HOST}:${TOOL_DEST}

deploy:
	bmake reconfig build sync env=${env}
	bmake reconfig build reload env=development

reconfig:
	@echo '{}' \
		| jq '.database = ${API_URL}' \
		| jq '.storage = ${STORAGE_URL}' \
		| jq '.mapbox_token = ${MAPBOX_TOKEN}' \
		| jq '.mapbox_theme = ${MAPBOX_THEME}' \
		> settings.json

	@cat settings.json

.include <extras.mk>
