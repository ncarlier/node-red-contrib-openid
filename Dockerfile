#########################################
# Node-RED server with OpenID plugin.
#########################################

FROM node:6-onbuild

MAINTAINER Nicolas Carlier <https://github.com/ncarlier>

RUN npm install -g --unsafe-perm node-red && \
    mkdir ~/.node-red && \
    npm link

RUN cd ~/.node-red && npm link node-red-contrib-openid

# Ports
EXPOSE 1880

ENTRYPOINT ["node-red"]

