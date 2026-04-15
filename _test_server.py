import subprocess, sys, time, os, signal, json

# Start Flask server
proc = subprocess.Popen([sys.executable, 'app.py'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(3)

# Check if server is running
import urllib.request
try:
    resp = urllib.request.urlopen('http://localhost:5000/api/health')
    print('Server OK:', resp.read().decode())
except Exception as e:
    print('Server error:', e)
    out = proc.stdout.read()
    print(out[-500:] if out else 'no output')
    proc.kill()
    sys.exit(1)

# Upload font
font_path = os.path.join('c:/Windows/Fonts', 'arial.ttf')
if not os.path.exists(font_path):
    print('Arial not found, trying others...')
    for f in os.listdir('c:/Windows/Fonts'):
        if f.lower().endswith('.ttf') and os.path.getsize(os.path.join('c:/Windows/Fonts', f)) < 500000:
            font_path = os.path.join('c:/Windows/Fonts', f)
            break

print('Using font:', font_path)

import http.client
import mimetypes
boundary = '----TestBoundary123'

with open(font_path, 'rb') as f:
    font_data = f.read()

body = (
    f'--{boundary}\r\n'
    f'Content-Disposition: form-data; name="font"; filename="{os.path.basename(font_path)}"\r\n'
    f'Content-Type: font/ttf\r\n\r\n'
).encode() + font_data + f'\r\n--{boundary}--\r\n'.encode()

conn = http.client.HTTPConnection('localhost', 5000)
conn.request('POST', '/api/upload', body, {
    'Content-Type': f'multipart/form-data; boundary={boundary}'
})
resp = conn.getresponse()
result = json.loads(resp.read().decode())
SID = result.get('session_id')
print('Session ID:', SID)

if not SID:
    print('Upload failed:', result)
    proc.kill()
    sys.exit(1)

# Write session ID
os.makedirs('.playwright-cli', exist_ok=True)
with open('.playwright-cli/session.txt', 'w') as f:
    f.write(SID)

# Get glyph A
conn2 = http.client.HTTPConnection('localhost', 5000)
conn2.request('GET', f'/api/glyph/{SID}/A')
resp2 = conn2.getresponse()
glyph_a = json.loads(resp2.read().decode())
print('Glyph A - path length:', len(glyph_a.get('path', '')))
print('Glyph A - points:', len(glyph_a.get('points', [])))
print('Glyph A - bounds:', glyph_a.get('bounds'))
print('SERVER RUNNING - press Ctrl+C to stop')
print(f'SID={SID}')

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    proc.kill()
