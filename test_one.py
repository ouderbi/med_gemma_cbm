import urllib.request
import json
import urllib.error

key = "AIzaSyBD7yMtgE8TFttV2fqau9T2bWsztTSSvEU"
url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + key
payload = json.dumps({"contents": [{"parts": [{"text": "1+1"}]}]}).encode("utf-8")
req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})

try:
    r = urllib.request.urlopen(req, timeout=10)
    print("VALIDA! Status:", r.status)
    print(r.read().decode("utf-8")[:200])
except urllib.error.HTTPError as e:
    print("ERRO:", e.code)
    print(e.read().decode("utf-8"))
except Exception as e:
    print("ERRO:", e)
