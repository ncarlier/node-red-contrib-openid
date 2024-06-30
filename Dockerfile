#########################################
# Node-RED server with OpenID plugin.
#########################################

FROM nodered/node-red

USER root

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

RUN npm install

COPY . .

RUN npm link

USER node-red

WORKDIR /usr/src/node-red

RUN npm link node-red-contrib-openid
