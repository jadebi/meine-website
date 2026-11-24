# FROM scratch
FROM nginx:alpine

COPY entrypoint.sh /docker-entrypoint.d/99-custom.sh
COPY html/ /usr/share/nginx/html/
