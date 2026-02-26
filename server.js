require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { GoogleAuth } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 8080; // Changed default for Cloud Run

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer for image upload — 30MB limit, medical image types
// MedGemma normaliza para 896x896px internamente, mas imagens
// médicas (raio-X, CT) podem ter até 30MB em alta resolução.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'];
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de arquivo não suportado: ${file.mimetype}. Use: JPG, PNG, WebP, GIF, BMP ou TIFF.`), false);
        }
    }
});

// ============================================================
// Get access token for Vertex AI
// ============================================================
// ============================================================
// Get access token for Vertex AI
// ============================================================
let authClient = null;

async function getAccessToken() {
    // 1. Try environment variable (manual override)
    if (process.env.VERTEX_API_KEY) {
        return process.env.VERTEX_API_KEY;
    }

    // 2. Try Google Auth Library (Best for Cloud Run/Production)
    try {
        if (!authClient) {
            authClient = new GoogleAuth({
                scopes: 'https://www.googleapis.com/auth/cloud-platform'
            });
        }
        const token = await authClient.getAccessToken();
        if (token) return token;
    } catch (e) {
        console.log('[Auth] GoogleAuth library fallback to CLI...');
    }

    // 3. Last resort: Fallback to gcloud CLI (Local development)
    try {
        try {
            return execSync('gcloud auth application-default print-access-token', {
                encoding: 'utf-8',
                timeout: 5000
            }).trim();
        } catch (e) {
            return execSync('gcloud auth print-access-token', {
                encoding: 'utf-8',
                timeout: 5000
            }).trim();
        }
    } catch (e) {
        console.error('Failed to get access token. Cloud Run: Ensure Service Account has Vertex AI User role. Local: Run gcloud auth application-default login');
        return null;
    }
}

// ============================================================
// POST /api/chat — Main proxy to MedGemma
// ============================================================
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, max_tokens, temperature, stream } = req.body;

        // Prefer the endpoint URL sent by the client frontend if it exists.
        const endpointUrl = req.body.endpointUrl || process.env.MEDGEMMA_ENDPOINT_URL;
        if (!endpointUrl) {
            return res.status(500).json({
                error: 'MEDGEMMA_ENDPOINT_URL not configured. Provide it in the frontend settings or backend .env.'
            });
        }

        const accessToken = await getAccessToken();
        if (!accessToken) {
            return res.status(401).json({
                error: 'No access token available. Run: gcloud auth application-default login'
            });
        }

        // TEMPORARY: Allow self-signed/internal Vertex certificates for debugging
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        // Vertex AI dedicated endpoint — :predict with chatCompletions format
        const cleanUrl = endpointUrl.trim().replace(/\/$/, '');
        const apiUrl = cleanUrl.endsWith(':predict') ? cleanUrl : `${cleanUrl}:predict`;

        const payload = {
            instances: [{
                "@requestFormat": "chatCompletions",
                messages: messages,
                max_tokens: max_tokens || 2048,
                temperature: temperature || 0.3,
                stream: stream === true
            }]
        };

        console.log(`[API] calling: ${apiUrl} (stream: ${stream})`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload)
        }).catch(err => {
            console.error('[API] Fetch exception:', err.message);
            throw err;
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`Vertex AI error (${response.status}):`, errText);
            return res.status(response.status).json({
                error: `Vertex AI returned ${response.status}`,
                details: errText
            });
        }

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            // Web Streams API decoding for Node.js native fetch payload
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(decoder.decode(value, { stream: true }));
                }
            } catch (streamErr) {
                console.error('[API] Stream read error:', streamErr);
            }
            res.end();
            return;
        }

        const data = await response.json();
        
        // Vertex AI wraps response in predictions array or object
        // Extract the OpenAI-compatible response from predictions
        const hasPredictions = data.predictions !== undefined;
        let prediction = null;
        if (hasPredictions) {
            prediction = Array.isArray(data.predictions) ? data.predictions[0] : data.predictions;
        }

        if (prediction) {
            // Handle if prediction is a single-item list containing a dict
            if (Array.isArray(prediction) && prediction.length > 0) {
                prediction = prediction[0];
            }

            // Extract content if it's in OpenAI format (choices/message/content)
            if (prediction.choices && prediction.choices[0] && prediction.choices[0].message) {
                res.json(prediction);
            } else if (typeof prediction === 'object' && prediction !== null) {
                // If it's a raw dict from vLLM, wrap it for the frontend
                const content = prediction.text || prediction.content || JSON.stringify(prediction);
                res.json({
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: content
                        }
                    }]
                });
            } else {
                // Fallback for string predictions
                res.json({
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: String(prediction)
                        }
                    }]
                });
            }
        } else if (data.choices) {
            // Direct OpenAI format
            res.json(data);
        } else {
            console.log('[API] Unexpected response format:', JSON.stringify(data).substring(0, 500));
            res.json(data);
        }

    } catch (err) {
        console.error('==================== CHAT ERROR ====================');
        console.error('Error message:', err.message);
        console.error('Error stack:', err.stack);
        if (err.cause) console.error('Error cause:', err.cause);
        console.error('====================================================');
        res.status(500).json({ error: err.message, details: err.stack });
    }
});

// ============================================================
// POST /api/upload — Upload image, return base64
// ============================================================
app.post('/api/upload', (req, res) => {
    upload.single('image')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: `Arquivo excede o limite de ${MAX_FILE_SIZE / (1024 * 1024)}MB.` });
            }
            return res.status(400).json({ error: `Erro no upload: ${err.message}` });
        }
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
        }
        
        const base64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        
        return res.json({
            base64: base64,
            mimeType: mimeType,
            dataUrl: `data:${mimeType};base64,${base64}`,
            originalName: req.file.originalname,
            size: req.file.size
        });
    });
});

// ============================================================
// GET /api/limits — File upload limits for frontend
// ============================================================
app.get('/api/limits', (req, res) => {
    res.json({
        maxFileSize: MAX_FILE_SIZE,
        maxFileSizeMB: MAX_FILE_SIZE / (1024 * 1024),
        allowedTypes: ALLOWED_TYPES,
        allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff']
    });
});

// ============================================================
// GET /api/health — Check server status
// ============================================================
app.get('/api/health', async (req, res) => {
    const hasEndpoint = !!process.env.MEDGEMMA_ENDPOINT_URL;
    const hasToken = !!(await getAccessToken());
    res.json({
        status: 'ok',
        endpointConfigured: hasEndpoint,
        authConfigured: hasToken,
        endpoint: hasEndpoint ? process.env.MEDGEMMA_ENDPOINT_URL : null
    });
});

// ============================================================
// POST /api/settings — Update env vars at runtime
// ============================================================
app.post('/api/settings', (req, res) => {
    const { endpointUrl, apiKey } = req.body;
    if (endpointUrl !== undefined) process.env.MEDGEMMA_ENDPOINT_URL = endpointUrl;
    if (apiKey !== undefined) process.env.VERTEX_API_KEY = apiKey;
    res.json({ status: 'ok', message: 'Settings updated for this session' });
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n  🧬 MedGemma CBM Server running at http://localhost:${PORT}\n`);
    console.log(`  Endpoint configured: ${!!process.env.MEDGEMMA_ENDPOINT_URL}`);
    console.log(`  Project: ${process.env.VERTEX_PROJECT_ID || 'not set'}\n`);
});
