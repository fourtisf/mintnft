# Putting nekara.xyz up

DNS is already correct — `A @ -> 31.97.66.123` and `CNAME www -> nekara.xyz`.
What is missing is something serving files at that address.

Four files go up: `index.html`, `favicon.svg`, `assets/app.css` and
`assets/app.js`. No build step, no dependencies — but `assets/` is not optional,
and a stale `app.js` next to a fresh `index.html` is a broken page.

On the VPS `deploy/golive.sh` now copies all of them into the web root, so this
is the manual path for shared hosting or a one-off fix.

## Shared hosting

1. hPanel -> Website -> File Manager
2. Open `public_html/` and delete whatever placeholder is in there
3. Upload `index.html`, `favicon.svg`, and the `assets/` folder with both files in it
4. hPanel -> Website -> SSL, install the free certificate
5. Open https://nekara.xyz

## VPS

```bash
ssh root@31.97.66.123
apt update && apt install -y nginx certbot python3-certbot-nginx
mkdir -p /var/www/nekara
# copy index.html, favicon.svg and assets/ into /var/www/nekara

cat > /etc/nginx/sites-available/nekara <<'CONF'
server {
    listen 80;
    server_name nekara.xyz www.nekara.xyz;
    root /var/www/nekara;
    index index.html;
    location / { try_files $uri $uri/ =404; }
}
CONF

ln -sf /etc/nginx/sites-available/nekara /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d nekara.xyz -d www.nekara.xyz
```

Once the engine is running on :8787, add this inside the same server block and
reload — the site and the API then share one origin and one certificate:

```nginx
location /api/ { proxy_pass http://127.0.0.1:8787; }
```

## What this page does and does not claim

It states the four commitments and then says, in its own Status section, that
the register is not live and not independently verifiable yet. That is not
modesty — CLAUDE.md forbids claiming verifiability before the chain is anchored,
and a launch page that overstates it is the first thing a critic screenshots.

Update the Status section only when each line is actually true.
