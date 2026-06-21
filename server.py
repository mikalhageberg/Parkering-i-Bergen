#!/usr/bin/env python3
"""
Liten proxy + statisk filserver for Parkering Bergen.

Hvorfor: nettleseren får ikke kalle Bergen Parkering sitt API direkte (CORS),
og tokenene bør ikke ligge i frontend-koden. Denne serveren løser begge deler:
  - Serverer nettsiden (index.html, style.css, app.js ...)
  - Tilbyr /api/freespaces som kaller det ekte API-et med dine tokens
    (lest fra secrets.json eller miljøvariabler) og sender svaret videre.

Kjør:
    python3 server.py
Åpne så:  http://localhost:4321
"""

import base64
import json
import os
import ssl
import sys
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

# macOS-Python finner ofte ikke CA-rotsertifikater. Bruk certifi sin
# sertifikatpakke når den er tilgjengelig, så slipper du SSL-feil.
try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CONTEXT = ssl.create_default_context()

PORT = int(os.environ.get("PORT", "4321"))
API_BASE = "https://api.ledig-parkering.no/api/v3"
WEBROOT = os.path.dirname(os.path.abspath(__file__))


def load_credentials():
    """Hent token/tokenkey fra miljøvariabler eller secrets.json."""
    token = os.environ.get("PARKING_TOKEN")
    token_key = os.environ.get("PARKING_TOKENKEY")
    if not (token and token_key):
        path = os.path.join(WEBROOT, "secrets.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            token = token or data.get("token")
            token_key = token_key or data.get("tokenKey")
    if not (token and token_key):
        sys.exit("Mangler token/tokenKey. Fyll inn secrets.json eller sett "
                 "miljøvariablene PARKING_TOKEN og PARKING_TOKENKEY.")
    return token, token_key


TOKEN, TOKEN_KEY = load_credentials()
AUTH_HEADER = "Basic " + base64.b64encode(
    f"{TOKEN}:{TOKEN_KEY}".encode("utf-8")
).decode("ascii")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEBROOT, **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.handle_proxy()
        else:
            super().do_GET()

    def handle_proxy(self):
        # /api/freespaces -> {API_BASE}/freespaces
        upstream = API_BASE + self.path[len("/api"):]
        req = urllib.request.Request(
            upstream,
            headers={"Authorization": AUTH_HEADER, "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15, context=SSL_CONTEXT) as resp:
                body = resp.read()
                status = resp.status
        except urllib.error.HTTPError as err:
            body = err.read() or json.dumps(
                {"error": f"API svarte {err.code}"}).encode()
            status = err.code
        except Exception as err:  # nettverksfeil o.l.
            body = json.dumps({"error": str(err)}).encode()
            status = 502

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # Hindre at nettleseren cacher gamle config.js/app.js/style.css o.l.,
        # slik at endringer alltid slår igjennom ved omlasting.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    print(f"Parkering Bergen kjører på http://localhost:{PORT}")
    print("Trykk Ctrl+C for å stoppe.")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
