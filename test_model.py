import urllib.request
import json
import sys

key = "AIzaSyBPLuySnUft76so62NzdRIZSGNorjqtLic"
models = ["gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-2.0-pro-exp-02-05", "gemini-2.0-flash"]

for model in models:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    req = urllib.request.Request(url, method="POST")
    req.add_header("x-goog-api-key", key)
    req.add_header("Content-Type", "application/json")
    data = json.dumps({"contents": [{"parts":[{"text":"Hi"}]}]}).encode("utf-8")
    
    try:
        urllib.request.urlopen(req, data=data)
        print(f"WORKS: {model}")
        break
    except Exception as e:
        print(f"FAILED: {model} - {e}")
