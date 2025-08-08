#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lightweight web server to search Amazon via Rainforest API and render results.
- No external deps (uses Python stdlib only).
- Reads API key from env var: RAINFOREST_API_KEY
- Start: python3 rainforest_server.py
- Visit: http://127.0.0.1:8000
"""

import json
import os
import sys
import html
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlencode, urlparse, parse_qs, quote_plus
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

def _load_dotenv(path: str | None = None) -> None:
    """Minimal .env loader: sets os.environ[K]=V for lines like K=V if not already set."""
    fname = path or os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(fname):
        return
    try:
        with open(fname, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except Exception:
        # Ignore .env parsing errors silently
        pass

# Load .env before reading environment variables
_load_dotenv()

PORT = int(os.environ.get("PORT", "8000"))
RAINFOREST_API_KEY = os.environ.get("RAINFOREST_API_KEY")
DEFAULT_QUERY = "latest xbox"
AMAZON_DOMAIN = os.environ.get("AMAZON_DOMAIN", "amazon.com")

RAINFOREST_ENDPOINT = "https://api.rainforestapi.com/request"


def search_rainforest(query: str, max_items: int = 10):
    """Call Rainforest API search and return parsed results list (safe fields)."""
    if not RAINFOREST_API_KEY:
        return {
            "error": "Missing RAINFOREST_API_KEY environment variable.",
            "results": [],
        }

    params = {
        "api_key": RAINFOREST_API_KEY,
        "type": "search",
        "amazon_domain": AMAZON_DOMAIN,
        "search_term": query,
    }
    url = f"{RAINFOREST_ENDPOINT}?{urlencode(params)}"

    req = Request(url, headers={"User-Agent": "rainforest-quick-demo/1.0"})
    try:
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except HTTPError as e:
        return {"error": f"HTTPError {e.code}: {e.reason}", "results": []}
    except URLError as e:
        return {"error": f"Network error: {e.reason}", "results": []}
    except Exception as e:
        return {"error": f"Unexpected error: {e}", "results": []}

    raw_results = data.get("search_results", [])
    cleaned = []
    for item in raw_results[:max_items]:
        title = item.get("title") or "(no title)"
        asin = item.get("asin") or ""
        link = item.get("link") or (f"https://www.amazon.com/dp/{asin}" if asin else "")
        img = item.get("image") or ""

        # price can be at item.price or item.prices[0]
        price_raw = None
        if isinstance(item.get("price"), dict):
            price_raw = item["price"].get("raw")
        if not price_raw and isinstance(item.get("prices"), list) and item["prices"]:
            price_raw = item["prices"][0].get("raw")

        cleaned.append(
            {
                "title": title,
                "asin": asin,
                "link": link,
                "image": img,
                "price": price_raw or "",
                "rating": item.get("rating"),
                "ratings_total": item.get("ratings_total"),
            }
        )

    return {"results": cleaned, "error": None}


def render_html(query: str, results: list, error: str | None) -> bytes:
    esc = html.escape
    head = f"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rainforest Amazon Search</title>
  <style>
    :root {{
      --bg: #0f172a; /* slate-900 */
      --card: #111827; /* gray-900 */
      --muted: #94a3b8; /* slate-400 */
      --fg: #e5e7eb; /* gray-200 */
      --accent: #22c55e; /* green-500 */
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, "Apple Color Emoji", "Segoe UI Emoji"; background: linear-gradient(180deg, #0f172a, #0b1023 50%, #0f172a); color: var(--fg); }}
    header {{ padding: 24px; text-align: center; border-bottom: 1px solid #1f2937; position: sticky; top: 0; backdrop-filter: blur(6px); background: rgba(15, 23, 42, 0.7); }}
    h1 {{ margin: 0; font-size: 20px; letter-spacing: 0.3px; }}
    .wrap {{ max-width: 1080px; margin: 24px auto; padding: 0 16px; }}
    form {{ display: flex; gap: 8px; margin-top: 12px; justify-content: center; }}
    input[type=text] {{ flex: 1; max-width: 520px; padding: 12px 14px; border-radius: 10px; border: 1px solid #374151; background: #0b1224; color: var(--fg); outline: none; }}
    input[type=text]:focus {{ border-color: var(--accent); box-shadow: 0 0 0 3px rgba(34,197,94,.15); }}
    button {{ padding: 12px 16px; border-radius: 10px; border: 1px solid #14532d; background: linear-gradient(180deg,#22c55e,#16a34a); color: white; cursor: pointer; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 20px; }}
    .card {{ background: radial-gradient(1200px 600px at 20% -10%, rgba(34,197,94,0.08), transparent), var(--card); border: 1px solid #1f2937; border-radius: 14px; padding: 14px; transition: transform .12s ease, border-color .12s ease; }}
    .card:hover {{ transform: translateY(-2px); border-color: #374151; }}
    .title {{ font-size: 14px; line-height: 1.3; margin: 8px 0; min-height: 3.2em; }}
    .meta {{ color: var(--muted); font-size: 12px; display: flex; gap: 10px; align-items: center; }}
    .price {{ color: #fbbf24; font-weight: 600; }}
    .imgwrap {{ display: flex; align-items: center; justify-content: center; background: #ffffff; border: 1px solid #1f2937; border-radius: 10px; height: 180px; overflow: hidden; }}
    .imgwrap img {{ max-height: 160px; max-width: 100%; object-fit: contain; }}
    footer {{ text-align: center; color: var(--muted); font-size: 12px; padding: 24px; }}
    .error {{ color: #fecaca; background: #7f1d1d; border: 1px solid #b91c1c; padding: 10px 12px; border-radius: 10px; margin: 16px auto; max-width: 720px; }}
  </style>
</head>
<body>
  <header>
    <h1>Rainforest Amazon Search</h1>
    <form method="GET" action="/">
      <input type="text" name="q" placeholder="Search Amazon…" value="{esc(query)}" />
      <button type="submit">Search</button>
    </form>
  </header>
  <div class="wrap">
"""

    body = []
    if error:
        body.append(f'<div class="error">{esc(error)}</div>')

    if not results:
        body.append('<p class="meta">No results found.</p>')
    else:
        body.append('<div class="grid">')
        for r in results:
            title = esc(str(r.get("title", "")))
            asin = esc(str(r.get("asin", "")))
            link = r.get("link") or "#"
            image = r.get("image") or ""
            price = esc(str(r.get("price", "")))
            rating = r.get("rating")
            ratings_total = r.get("ratings_total")
            rating_text = (
                f"<span>★ {rating:.1f}</span> <span>({ratings_total:,})</span>"
                if isinstance(rating, (int, float)) and isinstance(ratings_total, int)
                else ""
            )
            img_html = f'<img src="{html.escape(image)}" alt="{title}">' if image else '<div style="height:1px"></div>'
            body.append(
                f"""
                <a class="card" href="{html.escape(link)}" target="_blank" rel="noopener noreferrer">
                  <div class="imgwrap">{img_html}</div>
                  <div class="title">{title}</div>
                  <div class="meta">
                    <span class="price">{price}</span>
                    <span>ASIN: {asin}</span>
                    {rating_text}
                  </div>
                </a>
                """
            )
        body.append('</div>')

    tail = """
  </div>
  <footer>
    Powered by Rainforest API • Domain: {domain}
  </footer>
</body>
</html>
""".format(domain=esc(AMAZON_DOMAIN))

    return (head + "".join(body) + tail).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Health check
        if self.path.startswith("/healthz"):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"ok")
            return

        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        query = qs.get("q", [DEFAULT_QUERY])[0].strip() or DEFAULT_QUERY

        payload = search_rainforest(query)
        html_bytes = render_html(query=query, results=payload.get("results", []), error=payload.get("error"))

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(html_bytes)

    def log_message(self, fmt, *args):
        # Cleaner server logs
        sys.stderr.write("[server] " + (fmt % args) + "\n")


def main():
    addr = ("0.0.0.0", PORT)
    httpd = HTTPServer(addr, Handler)
    print(f"Serving on http://127.0.0.1:{PORT}  (set PORT env var to change)")
    if not RAINFOREST_API_KEY:
        print("WARNING: RAINFOREST_API_KEY is not set. The page will show an error banner.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down…")


if __name__ == "__main__":
    main()
