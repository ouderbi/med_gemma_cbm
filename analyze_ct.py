"""
MedGemma CBM — Análise de CT Scan (ULTRA-ROBUSTA V2)
================================================
Configurado para OPERAÇÃO MÁXIMA do MedGemma 27B.
Laudo de nível Acadêmico Especialista Sênior.

Melhorias da V2:
  - Tolerância a falhas com Tenacity (Retries automáticos).
  - Limpeza automática de diretórios temporários.
  - Cálculo exato de payload Base64.
  - Sistema de Logging profissional.
"""

import sys
import os
import zipfile
import base64
import json
import argparse
import logging
import tempfile
import math
from pathlib import Path
from typing import List, Dict, Optional, Tuple

# Configurações do Vertex AI
PROJECT_ID = "927344461840"
LOCATION = "us-central1"
ENDPOINT_ID = "mg-endpoint-a0838ce4-a75a-414e-ba8c-728179e23c68"

# Configuração de Logging Profissional
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("MedGemma")

try:
    from google.cloud import aiplatform
    from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type
except ImportError:
    logger.error("Dependências ausentes. Execute: python -m pip install google-cloud-aiplatform tenacity")
    sys.exit(1)

SUPPORTED_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'}
MAX_PAYLOAD_MB = 3.5  # Lotes menores para garantir estabilidade absoluta
INCREMENTAL_FILE = Path(__file__).parent / "LAUDO_ESPECIALISTA_PROGRESSIVO.txt"


def extract_zip(zip_path: str, output_dir: str) -> List[str]:
    """Extrai o arquivo ZIP para o diretório de saída e retorna a lista de imagens."""
    logger.info(f"📦 Extraindo: {os.path.basename(zip_path)}")
    with zipfile.ZipFile(zip_path, 'r') as zf:
        zf.extractall(output_dir)
    return find_images(output_dir)


def find_images(directory: str) -> List[str]:
    """Percorre recursivamente o diretório em busca de imagens suportadas."""
    images = []
    for root, _, files in os.walk(directory):
        for f in sorted(files):
            ext = os.path.splitext(f)[1].lower()
            if ext in SUPPORTED_EXTS:
                images.append(os.path.join(root, f))
    return images


def image_to_base64(path: str) -> Tuple[str, int]:
    """Converte uma imagem para Base64 e retorna a string formatada e seu tamanho exato em bytes."""
    ext = os.path.splitext(path)[1].lower()
    mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.tiff': 'image/tiff'}
    mime = mime_map.get(ext, 'image/jpeg')
    
    with open(path, 'rb') as f:
        file_bytes = f.read()
        b64 = base64.b64encode(file_bytes).decode('utf-8')
        
    return f"data:{mime};base64,{b64}", len(b64)


def calculate_base64_size(file_path: str) -> int:
    """Calcula o tamanho que o arquivo terá em Base64 sem precisar carregar na memória."""
    file_size = os.path.getsize(file_path)
    # Fórmula matemática para tamanho base64: cada 3 bytes viram 4 bytes
    return math.ceil(file_size / 3) * 4


def split_into_batches(images: List[str], max_payload_bytes: float) -> List[List[str]]:
    """Divide a lista de imagens em lotes respeitando o limite de payload (em bytes Base64)."""
    batches, current_batch = [], []
    current_size = 0
    
    for img_path in images:
        b64_size = calculate_base64_size(img_path)
        if current_size + b64_size > max_payload_bytes and current_batch:
            batches.append(current_batch)
            current_batch = []
            current_size = 0
            
        current_batch.append(img_path)
        current_size += b64_size
        
    if current_batch:
        batches.append(current_batch)
    return batches


# Decorador de Retry: Tenta até 5 vezes, esperando progressivamente (2s, 4s, 8s...) em caso de erro na API
@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(5))
def call_medgemma_sdk(endpoint: aiplatform.Endpoint, messages: List[Dict], max_tokens: int = 8192) -> Optional[str]:
    """Chamada robusta usando o SDK da Vertex AI com tentativa automática em caso de falha."""
    instance = {
        "@requestFormat": "chatCompletions",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.1
    }
    
    response = endpoint.predict(instances=[instance])
    if not response.predictions:
        logger.warning("Resposta vazia do endpoint. Forçando nova tentativa...")
        raise ValueError("Resposta vazia da API") # Levanta erro para acionar o @retry
        
    preds = response.predictions
    prediction = preds[0] if isinstance(preds, list) else preds
    
    if isinstance(prediction, dict):
        if "choices" in prediction:
            return prediction["choices"][0]["message"]["content"]
        return json.dumps(prediction, indent=2)
    return str(prediction)


def generate_prompt(is_first: bool, is_last: bool, batch_size: int, total: int, processed: int, clinical_memory: str) -> str:
    """Gera o prompt adequado dependendo do estágio da análise."""
    if is_first:
        return (
            "ESTE É O INÍCIO DE UMA ANÁLISE RADIOLÓGICA TOTAL E SEM RESTRIÇÕES. "
            "Você é um Radiologista Onisciente de Elite. "
            f"Analise as PRIMEIRAS fatias (1 a {batch_size} de {total}). "
            "Sua missão é relatar ABSOLUTAMENTE TUDO o que for visível. "
            "Não ignore nada, mesmo achados incidentais pequenos ou variações anatômicas sutis. "
            "Descreva alterações em parênquimas, tecidos moles, estruturas vasculares e esqueléticas. "
            "Sua resposta deve ser uma BASE DE DADOS CLÍNICA MASSIVA E IRRESTRITA em português do Brasil. "
            "Fale sobre TUDO o que encontrar."
        )
    elif is_last:
        return (
            "ESTA É A PARTE FINAL E A CONSOLIDAÇÃO DE UMA ANÁLISE LONGA.\n\n"
            f"=== DADOS CLÍNICOS ACUMULADOS NAS PARTES ANTERIORES ===\n"
            f"{clinical_memory}\n"
            "=== FIM DA MEMÓRIA ANTERIOR ===\n\n"
            f"Analise as ÚLTIMAS FATIAS ({processed - batch_size + 1} a {total}) e produza o LAUDO FINAL OMNI-REVEAL:\n"
            "1. TÉCNICA E PROTOCOLO\n"
            "2. ACHADOS POR SISTEMA (RELATO EXAUSTIVO DE TODA A ANATOMIA VISÍVEL)\n"
            "3. ANOMALIAS E ACHADOS INCIDENTAIS\n"
            "4. IMPRESSÃO DIAGNÓSTICA FINAL TOTALIZANTE\n"
            "5. RECOMENDAÇÕES E CLASSIFICAÇÕES CLÍNICAS.\n\n"
            "NÃO DEIXE NADA PARA TRÁS. Use português do Brasil técnico."
        )
    else:
        return (
            "ESTA É UMA CONTINUAÇÃO DE UMA ANÁLISE EM ANDAMENTO. NÃO É UM NOVO EXAME.\n\n"
            f"=== MEMÓRIA CLÍNICA DAS PARTES ANTERIORES ===\n"
            f"{clinical_memory}\n"
            "=== FIM DA MEMÓRIA ANTERIOR ===\n\n"
            f"Analise agora as fatias {processed - batch_size + 1} a {processed}. "
            "Sua tarefa é CONTINUAR E EXPANDIR A DESCOBERTA CLÍNICA. Relate achados em cada milímetro de imagem. "
            "Combine o que já foi visto com estes novos cortes. Se encontrar algo novo em qualquer estrutura, RELATE EXAUSTIVAMENTE. "
            "Mantenha o rigor máximo em português do Brasil."
        )


def analyze_progressive(images: List[str], batches: List[List[str]], endpoint: aiplatform.Endpoint) -> Optional[str]:
    """Processa lotes de imagens progressivamente, mantendo o contexto clínico."""
    clinical_memory = ""
    total = len(images)

    for idx, batch in enumerate(batches):
        is_first = (idx == 0)
        is_last = (idx == len(batches) - 1)
        processed = sum(len(batches[j]) for j in range(idx + 1))

        logger.info(f"{'#'*60}")
        logger.info(f"☢️ ANALISANDO LOTE {idx+1}/{len(batches)} ({processed}/{total} fatias)")
        logger.info(f"{'#'*60}")

        # Codificação
        content = []
        for img_path in batch:
            data_url, _ = image_to_base64(img_path)
            content.append({"type": "image_url", "image_url": {"url": data_url}})
        logger.info(f"✅ Lote de imagens convertido para Base64 com sucesso.")

        # Gerar Prompt
        prompt = generate_prompt(is_first, is_last, len(batch), total, processed, clinical_memory)
        content.append({"type": "text", "text": prompt})
        messages = [{"role": "user", "content": content}]

        logger.info(f"🛰️ Transmitindo ao MedGemma 27B...")
        
        try:
            result = call_medgemma_sdk(endpoint, messages)
            if result:
                clinical_memory = result
                logger.info(f"🎯 Lote {idx+1} integrado com sucesso.")
                
                # Salvar incrementalmente com formatação clara e delimitação por lote
                mode = 'w' if is_first else 'a'
                with open(INCREMENTAL_FILE, mode, encoding='utf-8') as f:
                    f.write("\n" + "#" * 80 + "\n")
                    f.write(f"### LOTE {idx+1} DE {len(batches)} (Fatias {processed-len(batch)+1} a {processed}) ###\n")
                    f.write("#" * 80 + "\n\n")
                    f.write(result.strip())
                    f.write("\n\n" + "-" * 80 + "\n")
                logger.info(f"💾 Lote {idx+1} anexado ao laudo progressivo.")
        except Exception as e:
            logger.error(f"❌ Falha crítica no lote {idx+1} após várias tentativas: {e}")
            if not clinical_memory: 
                return None

    return clinical_memory


def main():
    parser = argparse.ArgumentParser(description='Análise Ultra-Robusta de CT Scan via MedGemma')
    parser.add_argument('path', help='Caminho para o arquivo ZIP ou pasta contendo as imagens')
    args = parser.parse_args()

    print("\n" + "⚡"*30)
    print("  MEDGEMMA 27B - MODO DE OPERAÇÃO MÁXIMA V2")
    print("⚡"*30 + "\n")

    # Iniciar SDK
    logger.info("Inicializando Vertex AI SDK...")
    aiplatform.init(project=PROJECT_ID, location=LOCATION)
    endpoint = aiplatform.Endpoint(endpoint_name=f"projects/{PROJECT_ID}/locations/{LOCATION}/endpoints/{ENDPOINT_ID}")

    # Uso de TemporaryDirectory para limpar arquivos extraídos automaticamente após a execução
    with tempfile.TemporaryDirectory() as temp_dir:
        
        if zipfile.is_zipfile(args.path):
            images = extract_zip(args.path, temp_dir)
        elif os.path.isdir(args.path):
            images = find_images(args.path)
        else:
            logger.error("Caminho inválido. Forneça um ZIP ou Pasta.")
            return

        if not images:
            logger.warning("Nenhuma imagem suportada foi encontrada.")
            return

        logger.info(f"🔍 Exame carregado: {len(images)} fatias.")
        
        max_payload = MAX_PAYLOAD_MB * 1024 * 1024
        batches = split_into_batches(images, max_payload)
        logger.info(f"📦 Logística calculada: {len(batches)} lotes estruturados.")

        # Iniciar análise
        final_report = analyze_progressive(images, batches, endpoint)

        if final_report:
            print("\n" + "🚨"*30)
            print("  LAUDO RADIOLÓGICO FINAL — CONFIGURAÇÃO ACADÊMICA")
            print("🚨"*30 + "\n")
            print(final_report)
            
            output_file = Path(args.path).parent / "LAUDO_ESPECIALISTA_MEDGEMMA_27B.txt"
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(f"LAUDO RADIOLÓGICO - MEDGEMMA 27B EXPERT\n")
                f.write(f"NÚMERO DE FATIAS: {len(images)}\n")
                f.write("="*60 + "\n\n")
                f.write(final_report)
            logger.info(f"💾 Laudo final gerado e salvo em: {output_file.name}")
        else:
            logger.error("A análise falhou. Verifique os logs e tente novamente.")

    # Quando o bloco 'with tempfile...' termina, a pasta temporária é apagada automaticamente!
    logger.info("🧹 Ambiente temporário limpo com sucesso.")


if __name__ == '__main__':
    main()
