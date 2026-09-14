FROM elixir:1.20.4-otp-27-alpine

WORKDIR /app

RUN apk add --no-cache build-base postgresql-client inotify-tools
RUN mix local.hex --force && mix local.rebar --force

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/entrypoint.sh"]