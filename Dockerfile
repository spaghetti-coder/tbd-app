FROM caddy:2-alpine
COPY index.html /app/index.html
COPY Caddyfile /etc/caddy/Caddyfile
