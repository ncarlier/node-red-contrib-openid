#########################################
# Node-RED server with OpenID plugin.
#########################################

FROM node:20

RUN npm install -g --unsafe-perm node-red && \
    mkdir ~/.node-red

COPY --chown=node:node . .

RUN npm link

RUN cd ~/.node-red && npm link node-red-contrib-openid

EXPOSE 1880

ENTRYPOINT ["node-red"]
