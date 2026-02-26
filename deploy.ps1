# MedGemma Cloud Run Deployment Script (PowerShell) - V2

Write-Host "🚀 Iniciando deploy para Google Cloud Run..." -ForegroundColor Cyan

# 1. Configurações Básicas
$PROJECT_ID = gcloud config get-value project
$SERVICE_NAME = "medgemma-proxy"
$REGION = "us-central1"
$IMAGE_NAME = "gcr.io/$PROJECT_ID/$SERVICE_NAME"

# 2. Carregar variáveis do .env de forma robusta
$envVarsList = @()
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match "^[A-Z0-0_]+=") {
            $envVarsList += $_.Trim()
        }
    }
}
$envString = $envVarsList -join ","

# 3. Build via Google Cloud Build
Write-Host "📦 Building container ($IMAGE_NAME)..." -ForegroundColor Yellow
gcloud builds submit --tag $IMAGE_NAME

# 4. Deploy para o Cloud Run
Write-Host "🚢 Deploying service ($SERVICE_NAME) em $REGION..." -ForegroundColor Yellow
gcloud run deploy $SERVICE_NAME `
    --image $IMAGE_NAME `
    --platform managed `
    --region $REGION `
    --allow-unauthenticated `
    --set-env-vars "$envString"

Write-Host "✅ Deploy concluído com sucesso!" -ForegroundColor Green

# 5. Obter URL final
$URL = gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
Write-Host "`n🔗 Sua URL pública (24h) é:" -ForegroundColor Cyan
Write-Host "$URL" -ForegroundColor White -BackgroundColor Blue
Write-Host "`nUse esta URL no campo 'URL do Servidor API' no seu site do GitHub." -ForegroundColor Gray
