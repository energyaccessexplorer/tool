.include <env.mk>

DIST = ./dist
SRC = ./src
BIN = ./bin
VIEWS = ./views
CSS = ./stylesheets
LIB = ${DIST}/lib

TIMESTAMP != date -u +'%Y-%m-%d--%T'

GITSHA != git log -n1 --format=format:"%H" | head -c 8
GITCLEAN != [ "`git diff --stat`" = '' ] || echo "-dirty"

default: reconfig build lint

build: build-a build-s
	@cp views/index.html ${DIST}/index.html

lint:
	${BIN}/lint ${SRC}

deps:
	@mkdir -p ${LIB}/fonts
	DEST=${LIB} ${BIN}/deps

start:
	${HTTP_SERVER} --port ${TOOL_PORT} --dir ${DIST}

build-a:
	@echo "Building analysis screen"
	@mkdir -p ${DIST}/a

	@mustache /dev/null ${VIEWS}/a.html > ${DIST}/a/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/a/index.html

	@cp ${CSS}/ripple.css ${DIST}/a/ripple.css
	@cp ${SRC}/{browser,session,analysis,cards,config,controls,search,controls-search,geographies-search,vectors-search,analysis-search,locations-search,ds,parse,indexes,filtered,mapbox,overlord,plot,rasters,report,summary,timeline,user,views,help,a,qa}.js ${DIST}/a/

	@cat \
		${LIB}/d3.js \
		${LIB}/geotiff.js \
		${LIB}/mapbox-gl.js \
		${LIB}/geojson-extent.js \
		${LIB}/sphericalmercator.js \
		${LIB}/html5sortable.js \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
		> ${DIST}/a/libs.js

	@echo -n "window.ea_settings = " | cat - \
		settings.json \
		${SRC}/utils.js \
		${SRC}/globals.js \
		> ${DIST}/a/main.js

	@cat \
		${CSS}/general.css \
		${CSS}/a.css \
		${CSS}/layout.css \
		${CSS}/left-pane.css \
		${CSS}/search.css \
		${CSS}/controls.css \
		${CSS}/maparea.css \
		${CSS}/indexes.css \
		${CSS}/views.css \
		${CSS}/filtered.css \
		${CSS}/ripple.css \
		${CSS}/summary.css \
		${CSS}/mobile.css \
		${CSS}/cards.css \
		> ${DIST}/a/main.css

build-s:
	@echo "Building select screen"
	@mkdir -p ${DIST}/s

	@mustache /dev/null ${VIEWS}/s.html > ${DIST}/s/index.html

	@sed -ri 's/--TIMESTAMP--/${TIMESTAMP}/' ${DIST}/s/index.html

	@cp ${SRC}/{browser,user,s}.js ${DIST}/s/

	@cat \
		${LIB}/d3.js \
		${LIB}/jwt-decode.js \
		${LIB}/helpers.js \
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

sync:
	@echo ${GITSHA}${GITCLEAN} > ${DIST}/.sync-${env}

	@rsync -OPrv \
		--quiet \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=files \
		${DIST}/ ${WEBSITE_SSH_USER}@${WEBSITE_HOST}:${TOOL_DEST}

synced:
	@rsync -OPrv \
		--dry-run \
		--info=FLIST0 \
		--checksum \
		--copy-links \
		--delete-before \
		--exclude=files \
		${DIST}/ ${WEBSITE_SSH_USER}@${WEBSITE_HOST}:${TOOL_DEST}

deploy:
	@touch ${env}.diff

	patch -p1 --reverse --silent <development.diff

	patch -p1 --silent <${env}.diff
	@bmake reconfig build sync env=${env}

	@echo "--------"

	patch -p1 --reverse --silent <${env}.diff

	patch -p1 --silent <development.diff
	@bmake reconfig build env=development

reconfig:
	@echo "Building settings.json - ${env}"
	@echo '{}' \
		| jq '.domain = ${DOMAIN}' \
		| jq '.world = ${WORLD}' \
		| jq '.title = ${TITLE}' \
		| jq '.database = ${API_URL}' \
		| jq '.storage = ${STORAGE_URL}' \
		| jq '.mapbox_token = ${MAPBOX_TOKEN}' \
		| jq '.mapbox_theme = ${MAPBOX_THEME}' \
		> settings.json
