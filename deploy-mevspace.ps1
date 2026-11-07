# Deploy Loudspeaker Simulator (ls.graf.me.uk) to MEVSPACE (146.19.24.163)
param(
  [string]$Server = "deploy@146.19.24.163",
  [string]$IdentityFile = "$HOME\.ssh\id_ed25519"
)

$ErrorActionPreference = "Stop"
$DistDir = "C:\Users\deper\Cursor\loudspeaker-sim\web\dist"

Write-Host "1. Configuring /var/www/ls, TLS cert, and Nginx (ports 80 + 443) on $Server..." -ForegroundColor Cyan

$remoteSetup = @'
set -e
sudo mkdir -p /var/www/ls /etc/nginx/ssl
sudo chown -R $(whoami):www-data /var/www/ls
sudo chmod -R a+rX /var/www/ls

if [ ! -f /etc/nginx/ssl/ls.graf.me.uk.crt ]; then
  sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/ls.graf.me.uk.key \
    -out /etc/nginx/ssl/ls.graf.me.uk.crt \
    -subj "/CN=ls.graf.me.uk"
fi

# Remove any old rescued vhost in sites-enabled that also claims ls.graf.me.uk
for f in $(grep -l "ls\.graf\.me\.uk" /etc/nginx/sites-enabled/* 2>/dev/null || true); do
  echo "Removing old vhost file: $f"
  sudo rm -f "$f"
done

sudo tee /etc/nginx/sites-available/ls.graf.me.uk > /dev/null << 'NGINX_EOF'
map $http_accept $ls_root_target {
    default         /index.html;
    ~*text/markdown /index.md;
}

server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ls.graf.me.uk;

    ssl_certificate     /etc/nginx/ssl/ls.graf.me.uk.crt;
    ssl_certificate_key /etc/nginx/ssl/ls.graf.me.uk.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers off;

    root /var/www/ls;
    index index.html;
    charset utf-8;
    charset_types text/plain text/markdown application/json application/xml;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Exact root '/' supports HTTP Content Negotiation (Accept: text/markdown -> /index.md, otherwise /index.html)
    location = / {
        add_header Vary "Accept" always;
        add_header Link '<https://ls.graf.me.uk/index.md>; rel="alternate"; type="text/markdown", <https://ls.graf.me.uk/llms.txt>; rel="llms-txt", <https://ls.graf.me.uk/.well-known/ai-catalog.json>; rel="ai-catalog"' always;
        rewrite ^ $ls_root_target last;
    }

    location = /index.html {
        add_header Vary "Accept" always;
        add_header Cache-Control "public, max-age=300, must-revalidate" always;
        add_header Link '<https://ls.graf.me.uk/index.md>; rel="alternate"; type="text/markdown", <https://ls.graf.me.uk/llms.txt>; rel="llms-txt", <https://ls.graf.me.uk/.well-known/ai-catalog.json>; rel="ai-catalog"' always;
    }

    location ~* ^/(llms\.txt|llms-full\.txt|index\.md)$ {
        default_type text/markdown;
        add_header Vary "Accept" always;
        add_header Cache-Control "public, max-age=3600" always;
    }

    location = /robots.txt {
        default_type text/plain;
        add_header Cache-Control "public, max-age=3600" always;
        try_files /robots.txt =404;
    }

    location = /sitemap.xml {
        default_type application/xml;
        add_header Cache-Control "public, max-age=3600" always;
        try_files /sitemap.xml =404;
    }

    location = /.well-known/ai-catalog.json {
        default_type application/json;
        add_header Cache-Control "public, max-age=3600" always;
        try_files /.well-known/ai-catalog.json =404;
    }

    # Return a real 404 for unknown paths (prevents soft-404s in Google Search & Lighthouse Agentic Browsing)
    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \.wasm$ {
        default_type application/wasm;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    location ~* \.(js|css|png|svg|ico|webmanifest)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
NGINX_EOF

sudo ln -sf /etc/nginx/sites-available/ls.graf.me.uk /etc/nginx/sites-enabled/ls.graf.me.uk
sudo nginx -t
sudo systemctl reload nginx
echo "--- Local asset permission test on port 80 ---"
curl -sI -H "Host: ls.graf.me.uk" http://127.0.0.1/assets/index-i0NqgtVn.js | head -n 5
'@

if (Test-Path $IdentityFile) {
  Write-Host "Uploading $DistDir\* to ${Server}:/var/www/ls/..." -ForegroundColor Cyan
  ssh -i $IdentityFile $Server "sudo mkdir -p /var/www/ls/.well-known && sudo chown -R `$(whoami):`$(whoami) /var/www/ls"
  scp -i $IdentityFile -r "$DistDir\*" "${Server}:/var/www/ls/"
  if (Test-Path "$DistDir\.well-known") {
    scp -i $IdentityFile -r "$DistDir\.well-known\*" "${Server}:/var/www/ls/.well-known/"
  }
  $remoteSetup | ssh -i $IdentityFile $Server "tr -d '\r' | bash -s"
} else {
  Write-Host "Uploading $DistDir\* to ${Server}:/var/www/ls/..." -ForegroundColor Cyan
  ssh $Server "sudo mkdir -p /var/www/ls/.well-known && sudo chown -R `$(whoami):`$(whoami) /var/www/ls"
  scp -r "$DistDir\*" "${Server}:/var/www/ls/"
  if (Test-Path "$DistDir\.well-known") {
    scp -r "$DistDir\.well-known\*" "${Server}:/var/www/ls/.well-known/"
  }
  $remoteSetup | ssh $Server "tr -d '\r' | bash -s"
}

Write-Host "Deployment complete! Live at:" -ForegroundColor Green
Write-Host "  App:   https://ls.graf.me.uk" -ForegroundColor Green
Write-Host "  Image: https://ls.graf.me.uk/radiographic-rosewood-tl.png" -ForegroundColor Green
Write-Host "  Image: https://ls.graf.me.uk/Radiographic%20Rosewood%20Transmission-Line%20Loudspeaker.png" -ForegroundColor Green
