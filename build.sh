#!/usr/bin/env bash
printf "Image wird gebaut...\n"
docker build -t meineseite:1.0 -t meineseite:latest . &>/dev/null

printf "'meineseite:latest' wird gestartet...\n"
docker compose up -d --build --remove-orphans --force-recreate &>/dev/null

printf "Fertig! Öffne http://localhost:8081 im Browser\n"