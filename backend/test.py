import urllib.request
import json
req = urllib.request.Request('http://127.0.0.1:8000/api/chat', method='POST')
req.add_header('Content-Type', 'application/json')
req.add_header('X-User-Role', 'IT')
data = json.dumps({"message": "tes", "history": []}).encode('utf-8')
try:
    res = urllib.request.urlopen(req, data=data)
    print(res.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("ERROR:", e.code)
    print(e.read().decode('utf-8'))
except Exception as e:
    print("ERROR:", e)
