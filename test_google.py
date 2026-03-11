import urllib.request
import json
import sys

URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse"
API_KEY = "AIzaSyCfkV5X8f4DETxszn0X4EQPvpXhO9xL614" 

# Test if API key in header works
req = urllib.request.Request(URL, headers={'x-goog-api-key': API_KEY, 'Content-Type': 'application/json'}, data=json.dumps({"contents": [{"role": "user", "parts": [{"text": "Oi"}]}]}).encode('utf-8'))
try:
    with urllib.request.urlopen(req) as response:
        print("Header Auth Success:", response.status)
except Exception as e:
    print("Header Auth Failed:", e)

# Test if API key in URL works
req2 = urllib.request.Request(f"{URL}&key={API_KEY}", headers={'Content-Type': 'application/json'}, data=json.dumps({"contents": [{"role": "user", "parts": [{"text": "Oi"}]}]}).encode('utf-8'))
try:
    with urllib.request.urlopen(req2) as response:
        print("URL Auth Success:", response.status)
except Exception as e:
    print("URL Auth Failed:", e)
