include default.mk

start:
	@ static-server -noauth -port ${WEB_PORT}

stop:
	-@lsof -t -i :${WEB_PORT} | xargs kill

deploy:
	sed -i 's%const ea_database = "${DB_SERV_DEV}";%const ea_database = "${DB_SERV_PROD}";%' config.js

	@rsync -OPrv \
		--checksum \
		--delete-before \
		--exclude=data--* \
		--exclude=.git \
		--exclude=default.mk \
		--exclude=makefile \
		./ ${SRV_USER}@${SRV_SERVER}:${SRV_DEST}

	sed -i 's%const ea_database = "${DB_SERV_PROD}";%const ea_database = "${DB_SERV_DEV}";%' config.js
