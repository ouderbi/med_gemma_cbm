import urllib.request
import json

URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

KEYS = [
    "AIzaSyCMY45buGAztvUpmkNRAlzAdKbdH_fILQo",
    "AIzaSyB4L9GgBqWS8toy3-WMEb_JarQ1RmJN29w",
    "AIzaSyDu270WTlmZz2_MCkfapAg9BVVb0InwmpQ",
    "AIzaSyBPLuySnUft76so62NzdRIZSGNorjqtLic",
    "AIzaSyDqtZM55g7JuNUDLAiynoG7We78btcJqXY",
    "AIzaSyCfkV5X8f4DETxszn0X4EQPvpXhO9xL614",
    "AIzaSyAfx4RZBtWDm1IMBzFt-4K5n8_Ej9LlDzs",
    "AIzaSyBZf0KQl6wqxiZGGXGCbwaVjMD7rIM-TuI",
    "AIzaSyB2qAtXaD5T7Lo6ZOnJ3N8iwVKunkwktnE",
    "AIzaSyDO_JUAH5jX5LSnuIzIuM84VUopdc6qIos",
    "AIzaSyA9-RDD6gkP1EvDu2DbX-Su59AbPbmvDv8",
    "AIzaSyAtdqm76xcmepVWPFl1tCaj-9fAK6elMoM",
    "AIzaSyDBsBwK5n7ton_lIjOWb8m8rZiO_yglxbY",
    "AIzaSyCGACbz05kUwQLHHnMUNQHmXFVjDbQx0z4",
    "AIzaSyDPNJBwafIfyEAEc6tg0fkuHE2ARA3zkhI",
    "AIzaSyDyHbR6J4YsXNB9a2xiGAPLTi2KyZ8U3FY",
    "AIzaSyCQW9PYetPejp7iJ9vUHTI4fQLkWkTai58",
    "AIzaSyD09rpJ39_dG2oGURsEB46bulOeuazN42U",
    "AIzaSyB6v78ROFQ4i8QJIJrgKk6BU_Cim1GeJiM",
    "AIzaSyBEYWxPkYnMjCGAqtL7htjzzv3Op91LI4g",
]

payload = json.dumps({"contents": [{"parts": [{"text": "1+1"}]}]}).encode('utf-8')

print("Testando %d chaves contra a API Gemini...\n" % len(KEYS))
valid = []
for idx, key in enumerate(KEYS):
    req = urllib.request.Request("%s?key=%s" % (URL, key), data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            print("  Key %2d (%s...): [OK] VALIDA (%d)" % (idx+1, key[:15], response.status))
            valid.append(key)
    except Exception as e:
        status = getattr(e, 'code', str(e))
        print("  Key %2d (%s...): [X] REVOGADA (%s)" % (idx+1, key[:15], status))

print("\n" + "="*50)
print("Resultado: %d/%d chaves validas" % (len(valid), len(KEYS)))
if valid:
    print("\nChaves que FUNCIONAM:")
    for k in valid:
        print("  -> %s" % k)
else:
    print("\nNenhuma chave valida encontrada!")
