import urllib.request
import urllib.error
import json
import sys

URL = "https://medgemma-proxy-927344461840.us-central1.run.app/api/chat"

payload = {
    "messages": [
        {"role": "user", "content": "Teste de conexão sistêmica: Qual a utilidade clínica do D-Dímero?"}
    ],
    "max_tokens": 1024,
    "temperature": 0.2,
    "stream": True,
    "thinkingLevel": "high",
    "useSearch": True
}

data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(URL, data=data, headers={
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream'
})

print(f"Buscando no End-Point Cloud Run: {URL}")
try:
    with urllib.request.urlopen(req, timeout=30) as response:
        print(f"Status: {response.status}")
        print("Recebendo Stream...")
        
        # Le as primeiras linhas do stream para comprovar que a conexão está firme e o SSE pingou.
        for _ in range(5):
            line = response.readline()
            if not line: break
            decoded = line.decode('utf-8').strip()
            if decoded:
                print(decoded)
        print("✅ Teste de Stream do Cloud Run Bem Sucedido!")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code} - {e.reason}")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
