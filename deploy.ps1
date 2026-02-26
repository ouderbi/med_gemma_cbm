# MedGemma Cloud Run Deployment Script (PowerShell)

# 1. Get Project ID
$PROJECT_ID = gcloud config get-value project
$SERVICE_NAME = "medgemma-proxy"
$REGION = "us-central1"
$IMAGE_NAME = "gcr.io/$PROJECT_ID/$SERVICE_NAME"

# 2. Get Env Vars from .env
$envVars = Get-Content .env | Where-Object { $_ -match "=" } | ForEach-Object {
    $parts = $_ -split "="
    "$($parts[0])=$($parts[1])"
} -join ","

Write-Host "🚀 Iniciando deploy para Google Cloud Run..." -ForegroundColor Cyan

# 3. Build and Push to Container Registry
Write-Host "📦 Building container via Cloud Builds..." -ForegroundColor Yellow
gcloud builds submit --tag $IMAGE_NAME

# 4. Deploy to Cloud Run
Write-Host "🚢 Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $SERVICE_NAME `
  --image $IMAGE_NAME `
  --platform managed `
  --region $REGION `
  --allow-unauthenticated `
  --set-env-vars $envVars

Write-Host "✅ Deploy concluído!" -ForegroundColor Green
$URL = gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
Write-Host "🔗 Sua URL pública é: $URL" -ForegroundColor Cyan
