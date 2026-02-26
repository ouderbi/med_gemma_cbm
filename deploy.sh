#!/bin/bash

# Configuration
PROJECT_ID=$(gcloud config get-value project)
SERVICE_NAME="medgemma-proxy"
REGION="us-central1"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Build settings from .env
source .env

echo "🚀 Iniciando deploy para Google Cloud Run..."

# 1. Build and push to Container Registry
echo "📦 Building container..."
gcloud builds submit --tag $IMAGE_NAME

# 2. Deploy to Cloud Run
echo "🚢 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "MEDGEMMA_ENDPOINT_URL=$MEDGEMMA_ENDPOINT_URL,VERTEX_PROJECT_ID=$VERTEX_PROJECT_ID,VERTEX_LOCATION=$VERTEX_LOCATION"

echo "✅ Deploy concluído!"
gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
