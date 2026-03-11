import urllib.request
import json
import sys

keys = [
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
    "AIzaSyDO_JUAH5jX5LSnuIzIuM84VUopdc6qIos",
    "AIzaSyB2qAtXaD5T7Lo6ZOnJ3N8iwVKunkwktnE"
]

def test_key(key):
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    req = urllib.request.Request(url, method="POST")
    req.add_header("x-goog-api-key", key)
    req.add_header("Content-Type", "application/json")
    data = json.dumps({
        "contents": [{"parts":[{"text":"Hi"}]}]
    }).encode("utf-8")
    
    try:
        urllib.request.urlopen(req, data=data)
        return True
    except Exception as e:
        return False

for key in keys:
    if test_key(key):
        print("WORKING_KEY:" + key)
        sys.exit(0)

print("NO_WORKING_KEYS")
