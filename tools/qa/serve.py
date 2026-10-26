# Static server with gzip (like Poki's CDN) and a tall host page that embeds the game in an iframe.
# Usage: python3 serve.py <dist_dir> <port>
import gzip
import http.server
import os
import sys

ROOT = os.path.abspath(sys.argv[1])
PORT = int(sys.argv[2])
GZ = {'.js', '.css', '.html', '.wav', '.json'}
HOST = b"""<!doctype html><html><head><meta charset=utf-8><style>body{margin:0;height:4000px;width:3000px;background:#eee}
iframe{position:absolute;top:300px;left:300px;width:960px;height:540px;border:0}</style></head>
<body><iframe id=g src="http://127.0.0.1:%d/index.html" allow="autoplay"></iframe></body></html>"""
cache = {}


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/host.html':
            body = HOST % PORT
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        file = os.path.join(ROOT, path.lstrip('/') or 'index.html')
        ext = os.path.splitext(file)[1]
        if os.path.isfile(file) and ext in GZ and 'gzip' in self.headers.get('Accept-Encoding', ''):
            if file not in cache:
                with open(file, 'rb') as f:
                    cache[file] = gzip.compress(f.read(), 9)
            body = cache[file]
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(file))
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


http.server.ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
