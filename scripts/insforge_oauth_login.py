"""One-time OAuth login for InsForge Remote MCP.

InsForge's Remote MCP server (`https://mcp.insforge.dev/mcp`) speaks OAuth 2.1
authorization-code + PKCE per its discovery doc — refresh-token grant is
intentionally not supported. This helper does the dance once: spins up a
localhost HTTP server, opens the consent URL in your browser, exchanges the
returned code for an access token, and prints `INSFORGE_MCP_TOKEN=<...>` for
you to paste into `.env`.

Usage:
    python scripts/insforge_oauth_login.py

Then add the printed line to `.env` and the agent-template's MCP client will
use it automatically (it reads INSFORGE_MCP_TOKEN). The token is bound to a
specific InsForge project — you'll be asked to pick one in the browser.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.server
import json
import os
import secrets
import socket
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser

DISCOVERY_URL = "https://mcp.insforge.dev/.well-known/oauth-authorization-server"
SCOPES = "mcp:read mcp:write project:select"
DEFAULT_REDIRECT_PORT = 8765
DEFAULT_CLIENT_NAME = "Understudy local dev"


def _pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for PKCE S256."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(40)).rstrip(b"=").decode()
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


def _discover() -> dict[str, str]:
    with urllib.request.urlopen(DISCOVERY_URL, timeout=10) as r:
        return json.loads(r.read())


def _register_client(registration_endpoint: str, redirect_uri: str) -> dict[str, str]:
    body = json.dumps({
        "client_name": DEFAULT_CLIENT_NAME,
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code"],
        "response_types": ["code"],
        "scope": SCOPES,
    }).encode()
    req = urllib.request.Request(
        registration_endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def _free_port(preferred: int) -> int:
    """Use the preferred port if free; otherwise let the OS pick one."""
    try:
        with socket.socket() as s:
            s.bind(("127.0.0.1", preferred))
            return preferred
    except OSError:
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


def _wait_for_code(port: int, expected_state: str) -> tuple[str, str]:
    """Block until the OAuth provider redirects back; return (code, state)."""
    received: dict[str, str] = {}
    done = threading.Event()

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_a, **_k): pass

        def do_GET(self):  # noqa: N802
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if "code" in qs and "state" in qs:
                received["code"] = qs["code"][0]
                received["state"] = qs["state"][0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(
                    b"<h2>InsForge OAuth complete</h2>"
                    b"<p>You can close this tab and return to the terminal.</p>"
                )
                done.set()
            elif "error" in qs:
                received["error"] = qs.get("error", ["unknown"])[0]
                received["error_description"] = qs.get("error_description", [""])[0]
                self.send_response(400)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(
                    f"<h2>OAuth error: {received['error']}</h2>"
                    f"<pre>{received['error_description']}</pre>".encode()
                )
                done.set()
            else:
                self.send_response(404)
                self.end_headers()

    server = http.server.HTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"[insforge-oauth] callback server listening on http://127.0.0.1:{port}/callback")
    done.wait(timeout=600)
    server.shutdown()
    if "error" in received:
        raise RuntimeError(
            f"OAuth error from InsForge: {received['error']} — {received.get('error_description','')}"
        )
    if received.get("state") != expected_state:
        raise RuntimeError("state mismatch — possible CSRF; aborting")
    return received["code"], received["state"]


def _exchange_code_for_token(
    token_endpoint: str,
    code: str,
    code_verifier: str,
    client_id: str,
    redirect_uri: str,
) -> dict[str, str]:
    body = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "code_verifier": code_verifier,
    }).encode()
    req = urllib.request.Request(
        token_endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--port", type=int, default=DEFAULT_REDIRECT_PORT,
                        help="Localhost port for the OAuth callback (default: 8765)")
    parser.add_argument("--no-browser", action="store_true",
                        help="Print the URL instead of opening it.")
    parser.add_argument("--client-id", default=os.environ.get("INSFORGE_OAUTH_CLIENT_ID"),
                        help="Skip Dynamic Client Registration; use this client_id instead.")
    args = parser.parse_args()

    print("[insforge-oauth] discovering authorization server…")
    cfg = _discover()
    print(f"  authorization_endpoint: {cfg['authorization_endpoint']}")
    print(f"  token_endpoint:         {cfg['token_endpoint']}")
    print()

    port = _free_port(args.port)
    redirect_uri = f"http://127.0.0.1:{port}/callback"

    if args.client_id:
        client_id = args.client_id
        print(f"[insforge-oauth] using existing client_id: {client_id}")
    else:
        print("[insforge-oauth] registering OAuth client (Dynamic Client Registration)…")
        client = _register_client(cfg["registration_endpoint"], redirect_uri)
        client_id = client["client_id"]
        print(f"  client_id: {client_id}")

    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(16)
    auth_url = cfg["authorization_endpoint"] + "?" + urllib.parse.urlencode({
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": SCOPES,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
    })

    print()
    print("[insforge-oauth] opening browser for consent (pick your project in the InsForge UI)…")
    print("  if it doesn't open: paste this URL into your browser:")
    print(f"  {auth_url}")
    print()
    if not args.no_browser:
        try:
            webbrowser.open(auth_url)
        except Exception:
            pass

    code, _state = _wait_for_code(port, expected_state=state)
    print("[insforge-oauth] got authorization code, exchanging for access token…")

    token = _exchange_code_for_token(
        cfg["token_endpoint"], code, verifier, client_id, redirect_uri
    )
    access = token.get("access_token")
    if not access:
        print(f"  ERROR: no access_token in response: {token}", file=sys.stderr)
        return 1

    print()
    print("=" * 78)
    print("  ADD TO .env (project-bound MCP token):")
    print(f"  INSFORGE_MCP_TOKEN={access}")
    if "refresh_token" in token:
        print(f"  INSFORGE_MCP_REFRESH={token['refresh_token']}")
    if not args.client_id:
        print(f"  INSFORGE_OAUTH_CLIENT_ID={client_id}")
    print("=" * 78)
    print()
    print(f"  scopes: {token.get('scope', SCOPES)}")
    print(f"  expires_in: {token.get('expires_in', 'unknown')}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
