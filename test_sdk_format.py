import sys
import json
from google.cloud import aiplatform

PROJECT_ID = "927344461840"
LOCATION = "us-central1"
ENDPOINT_ID = "mg-endpoint-a0838ce4-a75a-414e-ba8c-728179e23c68"

aiplatform.init(project=PROJECT_ID, location=LOCATION)
endpoint = aiplatform.Endpoint(endpoint_name=f"projects/{PROJECT_ID}/locations/{LOCATION}/endpoints/{ENDPOINT_ID}")

instance = {
    "@requestFormat": "chatCompletions",
    "messages": [
        {"role": "user", "content": "Diga apenas 'Olá'"}
    ],
    "max_tokens": 10
}

try:
    print("Enviando predição de teste...")
    response = endpoint.predict(instances=[instance])
    
    print("\n--- DIAGNÓSTICO DE ESTRUTURA ---")
    print(f"Tipo da Resposta (Response): {type(response)}")
    
    # Inspeciona predictions
    preds = response.predictions
    print(f"Tipo de response.predictions: {type(preds)}")
    print(f"Número de itens em predictions: {len(preds) if hasattr(preds, '__len__') else 'N/A'}")
    
    if preds:
        first_pred = preds[0]
        print(f"Tipo de predictions[0]: {type(first_pred)}")
        print(f"Conteúdo de predictions[0]: {first_pred}")
        
        if isinstance(first_pred, dict):
            print(f"Chaves de predictions[0]: {first_pred.keys()}")
            if "choices" in first_pred:
                content = first_pred["choices"][0]["message"]["content"]
                print(f"CONTEÚDO FINAL EXTRAÍDO: {content}")
        elif isinstance(first_pred, str):
            print("Predictions[0] é uma string. Tentando parse de JSON...")
            try:
                data = json.loads(first_pred)
                print(f"JSON Parse sucesso! Chaves: {data.keys()}")
            except:
                print("Não é JSON.")

except Exception as e:
    import traceback
    print(f"\n❌ ERRO NO TESTE: {e}")
    traceback.print_exc()
