include default.mk

start:
	@static-server -noauth -port ${WEB_PORT}

stop:
	-@lsof -t -i :${WEB_PORT} | xargs -i kill {}

deploy:
	sed -i \
		-e 's%database: "${DB_SERV_DEV}",%database: "${DB_SERV_PROD}",%' \
		-e 's%mapboxstyle: null%mapboxstyle: "light"%' \
		config.js

	@rsync -OPrv \
		--checksum \
		--delete-before \
		--exclude=data--* \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		./ ${SRV_USER}@${SRV_SERVER}:${SRV_DEST}

	sed -i \
		-e 's%database: "${DB_SERV_PROD}",%database: "${DB_SERV_DEV}",%' \
		-e 's%mapboxstyle: "light"%mapboxstyle: null%' \
		config.js
