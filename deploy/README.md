# Deploy

Static landing page + nginx config that fronts the FastAPI backend on
`http://173.208.132.8`.

- `landing.html` → served at `/`. Black-and-white marketing page with an APK
  download button.
- `nginx.conf` → drop-in replacement for `/etc/nginx/sites-enabled/etracker`.
  Serves the landing page, exposes the APK at `/download/etracker.apk`, and
  proxies API paths (`/v1/...`, `/healthz`, `/docs`, `/redoc`,
  `/openapi.json`) to uvicorn on `127.0.0.1:8000`.
- `upgrade-map.conf` → goes into `/etc/nginx/conf.d/00-upgrade-map.conf`.
  Defines the `$connection_upgrade` map needed for the WebSocket upgrade
  proxying inside `nginx.conf`.

## Update flow

```bash
# On the build machine
scp deploy/landing.html administrator@173.208.132.8:/var/www/etracker/index.html
scp android/app/build/outputs/apk/release/app-release.apk \
    administrator@173.208.132.8:/var/www/etracker/etracker.apk
scp deploy/nginx.conf administrator@173.208.132.8:/tmp/etracker-nginx.conf
scp deploy/upgrade-map.conf administrator@173.208.132.8:/tmp/etracker-upgrade-map.conf

# On the server
sudo cp /tmp/etracker-nginx.conf /etc/nginx/sites-enabled/etracker
sudo cp /tmp/etracker-upgrade-map.conf /etc/nginx/conf.d/00-upgrade-map.conf
sudo nginx -t && sudo systemctl reload nginx
```
