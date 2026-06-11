# Starts the user-level dev Postgres (fallback for machines without Docker/WSL2).
# One-time setup is documented in README.md; this just starts/stops the server.
param([ValidateSet("start", "stop", "status")] [string]$Action = "start")

$pg = "$env:LOCALAPPDATA\TelosPg"
$ctl = "$pg\pgsql\bin\pg_ctl.exe"

if (-not (Test-Path $ctl)) {
    Write-Error "No user-level Postgres at $pg — use 'docker compose up -d' instead, or re-run setup (README)."
    exit 1
}

switch ($Action) {
    "start"  { & $ctl -D "$pg\data" -o "-p 5433" -l "$pg\pg.log" start }
    "stop"   { & $ctl -D "$pg\data" stop }
    "status" { & $ctl -D "$pg\data" status }
}
