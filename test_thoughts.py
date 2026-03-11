import urllib.request
import json
import sys

key = "AIzaSyDu270WTlmZz2_MCkfapAg9BVVb0InwmpQ"
model = "gemini-3.1-pro-preview" 

url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={key}"
req = urllib.request.Request(url, method="POST")
req.add_header("Content-Type", "application/json")
payload = {
    "contents": [{"parts":[{"text":"Explain how a car engine works step by step. Think deeply for 3 paragraphs."}]}],
    "generationConfig": {
        "thinkingConfig": {
            "thinkingLevel": "high",
            "includeThoughts": True
        }
    }
}
data = json.dumps(payload).encode("utf-8")

try:
    response = urllib.request.urlopen(req, data=data)
    for line in response:
        line = line.decode('utf-8').strip()
        if line.startswith("data: "):
            print(line[:200]) # Print just the head of the JSON chunk to inspect
        elif line:
            print(f"OTHER: {line[:200]}")
except Exception as e:
    import urllib.error
    if isinstance(e, urllib.error.HTTPError):
        print(f"FAILED: {e.code} - {e.read().decode('utf-8')}")
    else:
        print(f"FAILED: {e}")
