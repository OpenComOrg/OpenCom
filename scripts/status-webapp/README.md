# Status Webapp

Standalone status page bundle designed to run on a separate machine.

It includes:

- `monitor.mjs`: checks configured endpoints (API + frontend) and writes `site/status.json`
- `incident.mjs`: add/update/resolve incidents in `site/incidents.json`
- `site/`: static webapp (Statuspage/Discord-style UI)

## Configure

Edit `scripts/status-webapp/config.json`:

- `components`: services to monitor
- `monitor.timeoutMs`: timeout per check
- `monitor.historyDays`: number of daily bars to render
- `page`: webapp title/subtitle/hero metadata

## Run one check

```bash
node scripts/status-webapp/monitor.mjs
```

## Run continuous checks

```bash
node scripts/status-webapp/monitor.mjs --watch 60
```

## Add / update incidents

```bash
# add
node scripts/status-webapp/incident.mjs add --title "API outage" --message "Investigating elevated errors." --impact major --status investigating

# update
node scripts/status-webapp/incident.mjs update --id "<incident_id>" --status monitoring --message "Mitigation deployed."

# resolve
node scripts/status-webapp/incident.mjs resolve --id "<incident_id>" --message "Service restored."
```

## Serve locally

```bash
./scripts/status-webapp/serve.sh 8088
```

Then open `http://localhost:8088`.

## Cron example (separate host)

```cron
* * * * * cd /opt/OpenCom && /usr/bin/node scripts/status-webapp/monitor.mjs >> /var/log/opencom-status-monitor.log 2>&1
```
