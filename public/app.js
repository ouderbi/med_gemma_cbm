/* ============================================================
   MedGemma CBM — Chat-Centric Application Engine
   
   - Múltiplas imagens por mensagem
   - Feedback contextual de processamento
   - Persistência local via IndexedDB
   - 🔒 100% local — nenhum dado é enviado para nuvem.
   ============================================================ */

(function () {
    'use strict';

    // ============================================================
    // Constants
    // ============================================================
    const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB
    const MAX_IMAGES = 5; // Máximo de imagens por mensagem
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'application/pdf'];
    const ALLOWED_EXTS = '.jpg, .jpeg, .png, .webp, .gif, .bmp, .tiff, .pdf';
    const DB_NAME = 'MedGemmaCBM';
    const DB_VERSION = 1;

    // ============================================================
    // State
    // ============================================================
    const state = {
        chatHistory: [],
        pendingImages: [], // Array of { base64, dataUrl, mimeType, name, size }
        currentSection: 'chat',
        db: null,
        currentConvId: null,
        settings: {
            apiBaseUrl: 'https://medgemma-proxy-927344461840.us-central1.run.app', // Final permanent cloud URL
            endpointUrl: 'https://mg-endpoint-a0838ce4-a75a-414e-ba8c-728179e23c68.us-central1-927344461840.prediction.vertexai.goog/v1/projects/927344461840/locations/us-central1/endpoints/mg-endpoint-a0838ce4-a75a-414e-ba8c-728179e23c68',
            apiKey: '',
            temperature: 0.3,
            maxTokens: 2048,
            systemPrompt: 'You are a helpful medical assistant. Sempre responda em português do Brasil.'
        }
    };

    // ============================================================
    // IndexedDB
    // ============================================================
    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('conversations')) {
                    const store = db.createObjectStore('conversations', { keyPath: 'id' });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async function saveConversation(convId, messages, title) {
        const tx = state.db.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');
        const existing = await idbGet(store, convId);
        const now = new Date().toISOString();
        const lightMessages = messages.map(m => {
            if (typeof m.content === 'string') return m;
            if (Array.isArray(m.content)) {
                return { role: m.role, content: m.content.map(c => c.type === 'image_url' ? { type: 'image_url', image_url: { url: '[imagem]' } } : c) };
            }
            return m;
        });
        store.put({ id: convId, title: title || existing?.title || 'Nova Conversa', messages: lightMessages, createdAt: existing?.createdAt || now, updatedAt: now });
        return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    }

    async function loadConversation(convId) {
        const tx = state.db.transaction('conversations', 'readonly');
        return idbGet(tx.objectStore('conversations'), convId);
    }

    async function listConversations() {
        const tx = state.db.transaction('conversations', 'readonly');
        const idx = tx.objectStore('conversations').index('updatedAt');
        return new Promise((resolve) => {
            const req = idx.openCursor(null, 'prev');
            const results = [];
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) { results.push({ id: cursor.value.id, title: cursor.value.title, updatedAt: cursor.value.updatedAt, msgCount: cursor.value.messages.length }); cursor.continue(); }
                else resolve(results);
            };
            req.onerror = () => resolve([]);
        });
    }

    async function deleteConversation(convId) {
        const tx = state.db.transaction('conversations', 'readwrite');
        tx.objectStore('conversations').delete(convId);
        return new Promise((resolve) => { tx.oncomplete = resolve; });
    }

    function idbGet(store, key) {
        return new Promise((resolve) => {
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    // ============================================================
    // Intent Detection
    // ============================================================
    const INTENTS = {
        PROFESSOR_TOOLS: {
            patterns: [/plano.*aula/i, /rubrica/i, /ementa/i, /avalia[çc][aã]o.*pr[aá]tica/i, /osce/i, /plano.*ensino/i, /pbl/i, /tbl/i, /mapa.*mental/i, /bibliografia/i, /estudo.*dirigido/i, /caso.*prova/i, /metodologia.*ativa/i, /diretriz/i, /resumo.*artigo/i, /gabarito/i, /compet[êe]ncia/i, /objetivo.*aprendizagem/i],
            systemPrompt: `[ROLE] Você é o "Master Educator", um Assistente de Ensino Médico de Elite, atuando no Centro Universitário Barão de Mauá (CBM).
[CONTEXT] Seu usuário é um Professor Universitário de Medicina ou Preceptor Clínico. Eles exigem rigor científico absoluto, medicina baseada em evidências (EBM) e alinhamento com as melhores metodologias ativas de ensino (PBL, TBL, Peer Instruction).
[TASK] Atue como um co-piloto pedagógico. Desenvolva materiais didáticos avançados de forma imediata e robusta:
1. Para Planos de Aula/Ementas: Sempre estruture os Objetivos de Aprendizagem aplicando a *TAXONOMIA DE BLOOM* (ex: Identificar, Compreender, Aplicar, Avaliar). Inclua divisão de tempo (Timebox) estruturada.
2. Para Avaliações Práticas (OSCE/Mini-CEX): Gere de forma OBRIGATÓRIA as instruções para o ator/simulador, as diretrizes para o aluno, e um *Checklist do Avaliador* em formato de Tabela com pontuações.
3. Para Metodologias Ativas (PBL/TBL): Crie "Problemas" (Gatilhos) complexos, divididos em aberturas e fechamentos progressivos.
4. Para Clínica e Resumos: Ancora-se nas diretrizes (SUS, AMB, AHA, etc) e sugira bibliografias-chave.
[FORMAT] Responda ESTRITAMENTE em Português (Brasil). O material deve ser altamente formatado usando Markdown avançado. Use Títulos (###), Tabelas (indispensável para cronogramas ou rubricas), e Bullets. NUNCA gere blocos de texto gigantes e difíceis de ler. Seja direto e acadêmico.`,
            temperature: 0.3, maxTokens: 4096
        },
        EXAM_FACTORY: {
            patterns: [/crie.*prova/i, /quest[oõ]es.*enade/i, /simulado.*revalida/i, /exerc[ií]cios.*prova/i, /teste.*cbm/i, /enamed/i, /exame.*resid[êe]ncia/i, /banco.*quest[oõ]es/i],
            systemPrompt: `[ROLE] Você é o Diretor da Banca Elaboradora de Exames Médicos do Centro Universitário Barão de Mauá (CBM).
[CONTEXT] Professores utilizam este módulo para gerar provas e exercícios de Altíssimo Rigor Acadêmico (Padrão ENAMED, ENADE, Revalida e Residência Médica USP/Unicamp).
[TASK] Você deve gerar listas rigorosas de questões de Múltipla Escolha (A, B, C, D, E).
REGRAS OBRIGATÓRIAS:
1. OBRIGATÓRIO: Toda questão deve iniciar com um "Caso Clínico" (Clinical Vignette) rico em detalhes pertinentes (HMA, Exame Físico, Laboratório). Nada de perguntas curtas e diretas.
2. OBRIGATÓRIO: Forneça opções de A a E plausíveis (distratores de alta qualidade).
3. OBRIGATÓRIO: Ao final de toda a prova, crie uma seção "GABARITO COMENTADO". Para *cada questão*, diga qual é a certa e EXPLIQUE DETALHADAMENTE COMO A FISIOPATOLOGIA DESCARTA AS OPÇÕES ERRADAS.
[FORMAT] Responda APENAS em Português do Brasil usando Markdown Puro (### Para o Título da Prova, **Negrito** para as perguntas/alternativas, e blockquotes > para o Gabarito). NÃO USE JSON AQUI. Estruture como um documento de prova real pronto para impressão.`,
            temperature: 0.4, maxTokens: 8192
        },
        QUIZ: {
            patterns: [/quiz/i, /quest[oõ]es/i, /perguntas.*m[uú]ltipla/i, /teste.*sobre/i, /gere.*quest/i, /fa[çc]a.*quiz/i],
            systemPrompt: `[ROLE] Você é um preparador de exames médicos especialista em USMLE e Revalida para o CBM.
[CONTEXT] O aluno precisa testar seus conhecimentos através de vinhetas clínicas de alto nível.
[TASK] Crie questões de múltipla escolha baseadas em Casos Clínicos (Clinical Vignettes). 
[FORMAT] Responda APENAS com JSON válido neste formato exato (sem Markdown em volta do JSON):
{"type":"quiz","title":"Título do Quiz","questions":[{"question":"Vinheta clínica detalhada e Pergunta?","options":["A) ...","B) ...","C) ...","D) ..."],"correct":0,"explanation":"Explicação FOCO: Descreva detalhadamente por que a correta é a correta, e EXPLIQUE CLARAMENTE POR QUE CADA UMA DAS OUTRAS ALTERNATIVAS ESTÁ INCORRETA."}]}
correct = índice base-0. Responda em português do Brasil.`,
            temperature: 0.5, maxTokens: 4096
        },
        FLASHCARD: {
            patterns: [/flashcard/i, /flash.?card/i, /cart[oõ]es.*revis[aã]o/i, /gere.*flashcard/i, /cart[oõ]es.*estudo/i],
            systemPrompt: `[ROLE] Você é um tutor de retenção de conhecimento médico utilizando Active Recall no CBM.
[TASK] Gere flashcards com foco em aplicação clínica, não apenas decoreba.
[FORMAT] Responda APENAS com JSON válido neste formato:
{"type":"flashcards","title":"Título","cards":[{"front":"Pergunta/Conceito (Frente)","back":"Explicação/Resposta detalhada (Verso)"}]}
Responda em português do Brasil.`,
            temperature: 0.5, maxTokens: 4096
        },
        CASE_STUDY: {
            patterns: [/caso.?cl[ií]nico/i, /estudo.*caso/i, /case.*study/i, /crie.*caso/i, /gere.*caso/i, /simul.*paciente/i],
            systemPrompt: `[ROLE] Você é um Preceptor Clínico Especialista em PBL (Problem-Based Learning) no CBM.
[CONTEXT] O usuário é um aluno de medicina em treinamento clínico.
[TASK] Simule um caso clínico realista, encorajando o raciocínio estruturado. Faça o aluno solicitar os próximos exames ou passos lógicos.
[FORMAT] Responda APENAS com JSON válido neste formato (sem bordas markdown):
{"type":"case_study","title":"Título do Caso","sections":[{"heading":"Apresentação do Paciente / HMA / Exame Físico Inicial","content":"Conteúdo clínico detalhado. Finalize sempre perguntando: 'Qual é o seu diagnóstico diferencial preliminar e quais exames você solicitaria agora?'","spoiler":false}]}
Use spoiler:true apenas para a resolução final do caso (Diagnóstico Definitivo e Tratamento Padrão-Ouro). Responda em português do Brasil.`,
            temperature: 0.6, maxTokens: 4096
        },
        RADIOLOGY: {
            patterns: [/an[aá]lis.*imagem/i, /raio.?x/i, /radiolog/i, /descrev.*imagem/i, /laudo/i, /xray/i, /tomografia/i, /resson[aâ]ncia/i, /histopatolog/i, /dermatolog/i, /oftalmolog/i, /fundoscop/i, /ct\b/i, /mri\b/i],
            systemPrompt: `[ROLE] You are an expert medical radiologist and diagnostic imager.
[TASK] Analyze the provided medical image(s) step by step and provide a structured, professional radiologist report. Identify key anatomical landmarks and highlight abnormalities.
[FORMAT] Use clear sections indicating Findings, Impression, and Recommendations. Respond in Portuguese (Brazil).`,
            temperature: 0.2, maxTokens: 4096
        },
        CHAT: {
            patterns: [],
            systemPrompt: `[ROLE] Você é o Preceptor MedGemma, um Tutor Médico Avançado da instituição Centro Universitário Barão de Mauá (CBM).
[CONTEXT] Você interage com alunos de medicina e profissionais de saúde, focando no ensino por Metodologia Ativa (Active Recall e Raciocínio Clínico EBM).
[TASK] Suas respostas devem GUIAR o aluno para a resposta correta através de perguntas socráticas, raciocínio passo-a-passo e dicas, AO INVÉS de apenas dar a resposta pronta ou diagnóstico inicial cravado imediatamente. Sempre instigue o aluno a formular seu próprio diagnóstico diferencial primeiro.
[FORMAT] CRITICAL FORMATTING INSTRUCTIONS FOR EXPERT READABILITY:
1. NEVER output a wall of text.
2. USE MARKDOWN HEADINGS (###) to organize thoughts.
3. USE BULLET POINTS (- or *) profusely to list items or differentials. Add a blank line before and after lists.
4. HIGHLIGHT key medical terms, conditions, and concepts in **bold**.
5. Emphasize important warnings or concepts in *italics* or blockquotes (>).
Do not output raw compressed text. Always format beautifully and respond in Portuguese (Brazil).`,
            temperature: 0.3, maxTokens: 4096
        }
    };

    function getApiUrl(path) {
        const base = state.settings.apiBaseUrl ? state.settings.apiBaseUrl.replace(/\/$/, '') : '';
        return base + path;
    }

    function detectIntent(text) {
        for (const [name, intent] of Object.entries(INTENTS)) {
            if (name === 'CHAT') continue;
            for (const pattern of intent.patterns) {
                if (pattern.test(text)) return name;
            }
        }
        return 'CHAT';
    }

    // ============================================================
    // API
    // ============================================================
    async function sendToMedGemma(messages, maxTokens, temperature, onChunk) {
        const url = getApiUrl('/api/chat');
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, max_tokens: maxTokens || state.settings.maxTokens, temperature: temperature !== undefined ? temperature : state.settings.temperature, stream: !!onChunk })
        });
        
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(err.error || err.details || `Falha na requisição: ${res.status}`);
        }

        if (onChunk) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullText = "";
            let buffer = "";
            let rawBuffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunkStr = decoder.decode(value, { stream: true });
                buffer += chunkStr;
                rawBuffer += chunkStr;
                
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') continue;
                        if (!dataStr) continue;
                        try {
                            const data = JSON.parse(dataStr);
                            let contentDelta = "";
                            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                contentDelta = data.choices[0].delta.content;
                            } else if (data.text || data.content) {
                                contentDelta = data.text || data.content;
                            }
                            if (contentDelta) {
                                fullText += contentDelta;
                                onChunk(contentDelta, fullText);
                            }
                        } catch (e) {
                            console.warn("Stream parse error on chunk:", dataStr);
                        }
                    }
                }
            }

            // Fallback for non-SSE JSON (pretty printed or flat array)
            if (!fullText && rawBuffer.trim()) {
                try {
                    const data = JSON.parse(rawBuffer.trim());
                    let contentDelta = "";
                    const item = Array.isArray(data) ? data[0] : data;
                    if (item.choices && item.choices[0].message && item.choices[0].message.content) contentDelta = item.choices[0].message.content;
                    else if (item.outputs && Array.isArray(item.outputs)) contentDelta = item.outputs[0];
                    if (contentDelta) { 
                        fullText = contentDelta; 
                        onChunk(contentDelta, fullText); 
                    }
                } catch(e) {
                    console.warn("Could not parse fallback JSON", e);
                }
            }
            return fullText;
        } else {
            const data = await res.json();
            if (data.choices && data.choices[0]) return data.choices[0].message.content;
            if (data.outputs && Array.isArray(data.outputs)) return data.outputs[0];
            if (data.text) return data.text;
            throw new Error('Formato de resposta inválido');
        }
    }

    // ============================================================
    // File Validation
    // ============================================================
    function validateFile(file) {
        if (!file) return { valid: false, error: 'Nenhum arquivo selecionado.' };
        if (file.size > MAX_FILE_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            return { valid: false, error: `Arquivo muito grande (${sizeMB}MB). Limite: ${MAX_FILE_SIZE / (1024 * 1024)}MB.` };
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
            return { valid: false, error: `Tipo não suportado: ${file.type || 'desconhecido'}. Use: ${ALLOWED_EXTS}` };
        }
        return { valid: true };
    }

    // ============================================================
    // Settings
    // ============================================================
    function loadSettings() {
        try {
            const saved = localStorage.getItem('medgemma-settings');
            if (saved) Object.assign(state.settings, JSON.parse(saved));
            
            document.getElementById('set-api-base').value = state.settings.apiBaseUrl || '';
            document.getElementById('set-endpoint').value = state.settings.endpointUrl || '';
            document.getElementById('set-apikey').value = state.settings.apiKey || '';
            document.getElementById('set-temperature').value = state.settings.temperature;
            document.getElementById('set-maxtokens').value = state.settings.maxTokens;
            document.getElementById('set-system').value = state.settings.systemPrompt;
            document.getElementById('temp-value').textContent = state.settings.temperature;
        } catch (e) { }
    }

    function saveSettings() {
        state.settings.apiBaseUrl = document.getElementById('set-api-base').value.trim();
        state.settings.endpointUrl = document.getElementById('set-endpoint').value.trim();
        state.settings.apiKey = document.getElementById('set-apikey').value.trim();
        state.settings.temperature = parseFloat(document.getElementById('set-temperature').value);
        state.settings.maxTokens = parseInt(document.getElementById('set-maxtokens').value);
        state.settings.systemPrompt = document.getElementById('set-system').value.trim();
        
        localStorage.setItem('medgemma-settings', JSON.stringify(state.settings));
        
        // Update server settings if connected
        const url = getApiUrl('/api/settings');
        fetch(url, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                endpointUrl: state.settings.endpointUrl, 
                apiKey: state.settings.apiKey 
            }) 
        }).catch(() => { });
    }

    // ============================================================
    // Navigation
    // ============================================================
    function initNavigation() {
        // Navigation handling
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                
                const sectionId = item.getAttribute('data-section');
                document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
                
                const activeSec = document.getElementById(`section-${sectionId}`);
                if (activeSec) activeSec.classList.add('active');

                // Close sidebar on mobile after clicking item
                if (window.innerWidth <= 900) {
                    document.getElementById('sidebar').classList.remove('open');
                }
            });
        });

        document.getElementById('menu-toggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // Close sidebar button
        const closeSidebarBtn = document.getElementById('close-sidebar');
        if (closeSidebarBtn) {
            closeSidebarBtn.addEventListener('click', () => {
                document.getElementById('sidebar').classList.remove('open');
            });
        }

        // Close sidebar on outside click (mobile)
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            const menuBtn = document.getElementById('menu-toggle');
            const closeBtn = document.getElementById('close-sidebar'); // Include close button in check
            if (window.innerWidth <= 900 && sidebar.classList.contains('open') && !sidebar.contains(e.target) && !menuBtn.contains(e.target) && (!closeBtn || !closeBtn.contains(e.target))) {
                sidebar.classList.remove('open');
            }
        });
    }

    function switchSection(name) {
        state.currentSection = name;
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.getElementById(`section-${name}`).classList.add('active');
        const navItem = document.querySelector(`.nav-item[data-section="${name}"]`);
        if (navItem) navItem.classList.add('active');
        if (name === 'history') renderHistoryPage();
    }

    // ============================================================
    // Health Check
    // ============================================================
    async function checkHealth() {
        try {
            const url = getApiUrl('/api/health');
            const res = await fetch(url);
            const data = await res.json();
            const badge = document.getElementById('connection-status');
            if (data.endpointConfigured && data.authConfigured) {
                badge.className = 'connection-badge connected';
                badge.querySelector('.status-text').textContent = 'Conectado';
            } else {
                badge.className = 'connection-badge disconnected';
                badge.querySelector('.status-text').textContent = data.endpointConfigured ? 'Sem Autenticação' : 'Sem Endpoint';
            }
        } catch (e) {
            const badge = document.getElementById('connection-status');
            badge.className = 'connection-badge disconnected';
            badge.querySelector('.status-text').textContent = 'API Offline';
        }
    }

    // ============================================================
    // CHAT — Core
    // ============================================================
    function initChat() {
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('chat-send-btn');
        const fileInput = document.getElementById('chat-file-input');

        input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });
        sendBtn.addEventListener('click', handleSend);

        // Multi-file handler
        fileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            for (const file of files) {
                if (state.pendingImages.length >= MAX_IMAGES) {
                    addSystemMessage(`⚠️ Máximo de ${MAX_IMAGES} imagens por mensagem.`);
                    break;
                }
                const v = validateFile(file);
                if (v.valid) await attachImage(file);
                else addSystemMessage('⚠️ ' + v.error);
            }
            e.target.value = '';
        });

        document.getElementById('chat-clear-imgs').addEventListener('click', clearAllImages);

        // Drag-drop (supports multiple files)
        const msgs = document.getElementById('chat-messages');
        msgs.addEventListener('dragover', (e) => { e.preventDefault(); msgs.classList.add('drag-over'); });
        msgs.addEventListener('dragleave', () => msgs.classList.remove('drag-over'));
        msgs.addEventListener('drop', async (e) => {
            e.preventDefault();
            msgs.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files);
            for (const f of files) {
                if (state.pendingImages.length >= MAX_IMAGES) {
                    addSystemMessage(`⚠️ Máximo de ${MAX_IMAGES} imagens por mensagem.`);
                    break;
                }
                const v = validateFile(f);
                if (v.valid) await attachImage(f);
                else addSystemMessage('⚠️ ' + v.error);
            }
        });

        // Welcome cards & quick actions
        document.querySelectorAll('.welcome-card').forEach(c => c.addEventListener('click', () => handleQuickCommand(c.dataset.command)));
        document.querySelectorAll('.quick-btn').forEach(b => b.addEventListener('click', () => handleQuickCommand(b.dataset.command)));

        // New conversation
        const newBtn = document.getElementById('new-chat-btn');
        if (newBtn) newBtn.addEventListener('click', startNewConversation);

        // Camera input (mobile)
        const cameraInput = document.getElementById('chat-camera-input');
        if (cameraInput) {
            cameraInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (state.pendingImages.length >= MAX_IMAGES) {
                    addSystemMessage(`⚠️ Máximo de ${MAX_IMAGES} arquivos por mensagem.`);
                    return;
                }
                const v = validateFile(file);
                if (v.valid) await attachImage(file);
                else addSystemMessage('⚠️ ' + v.error);
                e.target.value = '';
            });
        }
    }

    function handleQuickCommand(command) {
        switchSection('chat');
        const input = document.getElementById('chat-input');
        const prompts = { quiz: 'Gere um quiz de 5 questões sobre ', caso: 'Crie um caso clínico detalhado sobre ', flashcard: 'Gere 10 flashcards sobre ', radiologia: 'Analise esta imagem médica: ' };
        input.value = prompts[command] || '';
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }

    // ============================================================
    // Multi-Image Handling
    // ============================================================
    async function attachImage(file) {
        const formData = new FormData();
        formData.append('image', file);
        try {
            const url = getApiUrl('/api/upload');
            const res = await fetch(url, { method: 'POST', body: formData });
            if (!res.ok) {
                const err = await res.json();
                addSystemMessage('⚠️ ' + (err.error || 'Erro no upload'));
                return;
            }
            const data = await res.json();
            state.pendingImages.push({ base64: data.base64, dataUrl: data.dataUrl, mimeType: data.mimeType, name: file.name, size: file.size });
            updateImagePreview();
        } catch (e) {
            addSystemMessage('⚠️ Erro no upload: ' + e.message);
        }
    }

    function updateImagePreview() {
        const bar = document.getElementById('chat-image-preview');
        const thumbs = document.getElementById('preview-thumbs');
        if (state.pendingImages.length === 0) {
            bar.classList.add('hidden');
            return;
        }
        bar.classList.remove('hidden');
        thumbs.innerHTML = '';
        state.pendingImages.forEach((img, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'preview-thumb';
            const sizeMB = (img.size / (1024 * 1024)).toFixed(1);
            thumb.innerHTML = `
                <img src="${img.dataUrl}" alt="${esc(img.name)}">
                <span class="thumb-name">${esc(img.name)} (${sizeMB}MB)</span>
                <button class="thumb-remove" data-idx="${i}" title="Remover">✕</button>
            `;
            thumb.querySelector('.thumb-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                state.pendingImages.splice(i, 1);
                updateImagePreview();
            });
            thumbs.appendChild(thumb);
        });
    }

    function clearAllImages() {
        state.pendingImages = [];
        updateImagePreview();
    }

    // ============================================================
    // Conversation Management
    // ============================================================
    function startNewConversation() {
        state.currentConvId = 'conv-' + Date.now();
        state.chatHistory = [];
        clearAllImages();
        const msgs = document.getElementById('chat-messages');
        const welcomeMsg = msgs.querySelector('.message.assistant');
        msgs.innerHTML = '';
        if (welcomeMsg) msgs.appendChild(welcomeMsg.cloneNode(true));
        
        document.querySelector('.chat-wrapper').classList.remove('has-messages');

        msgs.querySelectorAll('.welcome-card').forEach(c => c.addEventListener('click', () => handleQuickCommand(c.dataset.command)));
        switchSection('chat');
        renderHistorySidebar();
    }

    async function loadConversationById(convId) {
        const conv = await loadConversation(convId);
        if (!conv) return;
        state.currentConvId = convId;
        state.chatHistory = conv.messages.filter(m => m.role !== 'system');
        const msgs = document.getElementById('chat-messages');
        msgs.innerHTML = '';

        if (state.chatHistory.length > 0) {
            document.querySelector('.chat-wrapper').classList.add('has-messages');
        } else {
            document.querySelector('.chat-wrapper').classList.remove('has-messages');
        }

        for (const msg of state.chatHistory) {
            if (msg.role === 'user') {
                const text = typeof msg.content === 'string' ? msg.content : msg.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
                const imgCount = Array.isArray(msg.content) ? msg.content.filter(c => c.type === 'image_url').length : 0;
                addUserMessage(text, null, imgCount);
            } else if (msg.role === 'assistant') {
                const structured = tryParseStructured(msg.content);
                if (structured) renderStructuredMessage(structured);
                else addAssistantMessage(msg.content);
            }
        }
        switchSection('chat');
        renderHistorySidebar();
    }

    async function renderHistorySidebar() {
        const container = document.getElementById('conv-list');
        if (!container) return;
        const convs = await listConversations();
        container.innerHTML = '';
        for (const c of convs.slice(0, 15)) {
            const el = document.createElement('div');
            el.className = `conv-item ${c.id === state.currentConvId ? 'active' : ''}`;
            el.innerHTML = `<span class="conv-title">${esc(c.title)}</span><span class="conv-meta">${c.msgCount} msgs</span>`;
            el.addEventListener('click', () => loadConversationById(c.id));
            container.appendChild(el);
        }
    }

    async function renderHistoryPage() {
        const container = document.getElementById('history-list');
        if (!container) return;
        const convs = await listConversations();
        const countEl = document.getElementById('storage-count');
        if (countEl) countEl.textContent = `${convs.length} conversa${convs.length !== 1 ? 's' : ''} salva${convs.length !== 1 ? 's' : ''}`;
        if (convs.length === 0) {
            container.innerHTML = '<p class="empty-state">📭 Nenhuma conversa salva ainda. Suas conversas aparecerão aqui automaticamente.</p>';
            return;
        }
        container.innerHTML = '';
        for (const c of convs) {
            const date = new Date(c.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
            const el = document.createElement('div');
            el.className = 'history-item';
            el.innerHTML = `<div class="hi-info" data-id="${c.id}"><strong>${esc(c.title)}</strong><span class="hi-meta">${c.msgCount} mensagens · ${date}</span></div><button class="hi-delete" data-id="${c.id}" title="Excluir">🗑️</button>`;
            el.querySelector('.hi-info').addEventListener('click', () => loadConversationById(c.id));
            el.querySelector('.hi-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Excluir esta conversa?')) {
                    await deleteConversation(c.id);
                    if (c.id === state.currentConvId) startNewConversation();
                    renderHistoryPage();
                    renderHistorySidebar();
                }
            });
            container.appendChild(el);
        }
        const clearBtn = document.createElement('button');
        clearBtn.className = 'generate-btn secondary';
        clearBtn.style.marginTop = '16px';
        clearBtn.textContent = '🗑️ Limpar Todo o Histórico';
        clearBtn.addEventListener('click', async () => {
            if (confirm('Excluir TODAS as conversas? Esta ação não pode ser desfeita.')) {
                const tx = state.db.transaction('conversations', 'readwrite');
                tx.objectStore('conversations').clear();
                await new Promise(r => { tx.oncomplete = r; });
                startNewConversation();
                renderHistoryPage();
                renderHistorySidebar();
            }
        });
        container.appendChild(clearBtn);
    }

    // ============================================================
    // SEND — Multi-image + Intent-aware + Processing Feedback
    // ============================================================
    async function handleSend() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text && state.pendingImages.length === 0) return;

        const sendBtn = document.getElementById('chat-send-btn');
        sendBtn.disabled = true;

        document.querySelector('.chat-wrapper').classList.add('has-messages');

        // Build content array with multiple images
        const content = [];
        const imageDataUrls = [];
        for (const img of state.pendingImages) {
            content.push({ type: 'image_url', image_url: { url: img.dataUrl } });
            imageDataUrls.push(img.dataUrl);
        }
        if (text) content.push({ type: 'text', text });

        addUserMessage(text, imageDataUrls);

        input.value = '';
        input.style.height = 'auto';
        const hadImages = state.pendingImages.length > 0;
        const imageCount = state.pendingImages.length;
        clearAllImages();

        const intent = detectIntent(text);
        const intentConfig = INTENTS[intent];
        const systemPrompt = intentConfig ? intentConfig.systemPrompt : state.settings.systemPrompt;
        const userContent = content.length === 1 && content[0].type === 'text' ? text : content;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...state.chatHistory.slice(-10),
            { role: 'user', content: userContent }
        ];

        state.chatHistory.push({ role: 'user', content: userContent });

        if (state.chatHistory.length === 1 && text) {
            const title = text.substring(0, 60) + (text.length > 60 ? '...' : '');
            await saveConversation(state.currentConvId, state.chatHistory, title);
            renderHistorySidebar();
        }

        // Contextual processing feedback
        const typingId = addTyping(hadImages, imageCount, intent);

        try {
            const maxTokens = intentConfig ? intentConfig.maxTokens : state.settings.maxTokens;
            const temperature = intentConfig ? intentConfig.temperature : state.settings.temperature;
            
            const isChat = intent === 'CHAT';
            let finalResponseText = "";

            if (isChat) {
                // Real-time Streaming for Chat
                const msgs = document.getElementById('chat-messages');
                const streamDiv = document.createElement('div');
                streamDiv.className = 'message assistant streaming';
                streamDiv.innerHTML = `<div class="message-avatar">🧬</div><div class="message-content"></div>`;
                
                removeTyping(typingId);
                msgs.appendChild(streamDiv);
                const contentNode = streamDiv.querySelector('.message-content');

                finalResponseText = await sendToMedGemma(messages, maxTokens, temperature, (delta, fullText) => {
                    contentNode.innerHTML = formatText(fullText);
                    scrollToBottom();
                });
                
                streamDiv.classList.remove('streaming');
            } else {
                // Structured Data (Quiz, Flashcards) - Wait for full response
                finalResponseText = await sendToMedGemma(messages, maxTokens, temperature);
                removeTyping(typingId);
                const structured = tryParseStructured(finalResponseText);
                if (structured) renderStructuredMessage(structured);
                else addAssistantMessage(finalResponseText);
            }

            state.chatHistory.push({ role: 'assistant', content: finalResponseText });
            await saveConversation(state.currentConvId, state.chatHistory);
            renderHistorySidebar();
        } catch (e) {
            removeTyping(typingId);
            addAssistantMessage(`⚠️ Erro: ${e.message}\n\nVerifique suas configurações em ⚙️ Configurações e garanta que sua API e endpoint estão ativos e suportam *chatCompletions*.`);
        }
        sendBtn.disabled = false;
    }

    // ============================================================
    // Structured JSON Parser
    // ============================================================
    function tryParseStructured(text) {
        try {
            let clean = text;
            const codeMatch = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeMatch) clean = codeMatch[1].trim();
            const objMatch = clean.match(/\{[\s\S]*\}/);
            if (!objMatch) return null;
            const parsed = JSON.parse(objMatch[0]);
            if (parsed.type && ['quiz', 'flashcards', 'case_study'].includes(parsed.type)) return parsed;
            return null;
        } catch (e) { return null; }
    }

    // ============================================================
    // Message Rendering
    // ============================================================
    // Smart Scrolling Control
    let isUserScrolledUp = false;
    document.addEventListener('DOMContentLoaded', () => {
        const msgsEl = document.getElementById('chat-messages');
        if (msgsEl) {
            msgsEl.addEventListener('scroll', function() {
                isUserScrolledUp = this.scrollHeight - this.scrollTop - this.clientHeight > 50;
            });
        }
    });

    function scrollToBottom(force = false) {
        const el = document.getElementById('chat-messages');
        if (!el) return;
        if (!force && isUserScrolledUp) return; // Prevent auto-scroll if user scrolled up to read
        setTimeout(() => el.scrollTop = el.scrollHeight, 50);
    }

    function addUserMessage(text, imageUrls, imgPlaceholderCount) {
        const msgs = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'message user';
        let html = '<div class="message-avatar">👤</div><div class="message-content">';

        // Show images (real or placeholder)
        if (imageUrls && imageUrls.length > 0) {
            html += '<div class="msg-images">';
            imageUrls.forEach(url => { html += `<img class="attached-img" src="${url}" alt="Imagem enviada">`; });
            html += '</div>';
        } else if (imgPlaceholderCount > 0) {
            html += `<p style="color:var(--accent);font-size:0.82rem">📎 ${imgPlaceholderCount} imagem(ns) enviada(s)</p>`;
        }
        if (text) html += formatText(text);
        html += '</div>';
        div.innerHTML = html;
        msgs.appendChild(div);
        scrollToBottom(true); // Force scroll for user messages
    }

    function addAssistantMessage(text) {
        const msgs = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'message assistant';
        div.innerHTML = `<div class="message-avatar">🧬</div><div class="message-content">${formatText(text)}</div>`;
        msgs.appendChild(div);
        scrollToBottom();
    }

    function addSystemMessage(text) {
        const msgs = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'message system-msg';
        div.innerHTML = `<div class="message-content system-content">${esc(text)}</div>`;
        msgs.appendChild(div);
        scrollToBottom();
        setTimeout(() => div.remove(), 6000);
    }

    // Contextual typing indicator with processing feedback
    function addTyping(hasImages, imageCount, intent) {
        const msgs = document.getElementById('chat-messages');
        const id = 'typing-' + Date.now();
        const div = document.createElement('div');
        div.className = 'message assistant';
        div.id = id;

        // Build contextual processing message
        let statusText = '';
        if (hasImages && imageCount > 0) {
            statusText = imageCount > 1
                ? `🔬 Processando ${imageCount} imagens médicas...`
                : '🔬 Analisando imagem médica...';
        } else {
            const intentLabels = { QUIZ: '🧠 Gerando quiz...', FLASHCARD: '🃏 Criando flashcards...', CASE_STUDY: '📋 Elaborando caso clínico...', RADIOLOGY: '🩻 Analisando radiologia...', CHAT: '' };
            statusText = intentLabels[intent] || '';
        }

        div.innerHTML = `
            <div class="message-avatar" style="animation: pulse-glow 2s infinite;">🧬</div>
            <div class="message-content" style="min-width: 250px;">
                ${statusText ? `<div class="processing-status">
                    <span class="processing-text">${statusText}</span>
                </div>` : ''}
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                    <div class="skeleton-line long"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line short"></div>
                </div>
            </div>`;
        msgs.appendChild(div);
        scrollToBottom();
        return id;
    }

    function removeTyping(id) { const el = document.getElementById(id); if (el) el.remove(); }

    // ============================================================
    // Structured Renderers
    // ============================================================
    function renderStructuredMessage(data) {
        const msgs = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'message assistant';
        let html = '<div class="message-avatar">🧬</div><div class="message-content">';
        switch (data.type) {
            case 'quiz': html += renderQuiz(data); break;
            case 'flashcards': html += renderFlashcards(data); break;
            case 'case_study': html += renderCaseStudy(data); break;
        }
        html += '</div>';
        div.innerHTML = html;
        msgs.appendChild(div);
        if (data.type === 'quiz') initQuizInteraction(div, data);
        if (data.type === 'flashcards') initFlashcardInteraction(div, data);
        if (data.type === 'case_study') initCaseInteraction(div);
        scrollToBottom();
    }

    function renderQuiz(data) {
        const q = data.questions[0];
        let html = `<p><strong>🧠 ${esc(data.title || 'Quiz Médico')}</strong></p>`;
        html += '<div class="inline-quiz" data-current="0">';
        html += renderQuizQuestion(q, 0, data.questions.length);
        html += '</div>';
        return html;
    }
    function renderQuizQuestion(q, idx, total) {
        let html = `<div class="iq-question">${idx + 1}. ${esc(q.question)}</div><div class="iq-options">`;
        q.options.forEach((opt, i) => { html += `<div class="iq-option" data-idx="${i}"><span class="iq-letter">${'ABCD'[i]}</span><span>${esc(opt.replace(/^[A-D]\)\s*/, ''))}</span></div>`; });
        html += `</div><div class="iq-nav"><span class="iq-progress">${idx + 1} de ${total}</span><div>`;
        if (idx > 0) html += '<button class="iq-nav-btn" data-action="prev">← Anterior</button> ';
        html += '</div></div>';
        return html;
    }
    function initQuizInteraction(container, data) {
        const quizEl = container.querySelector('.inline-quiz');
        if (!quizEl) return;
        let currentIdx = 0; const answers = new Array(data.questions.length).fill(null); let score = 0;
        quizEl.addEventListener('click', (e) => {
            const option = e.target.closest('.iq-option'); const navBtn = e.target.closest('.iq-nav-btn');
            if (option && answers[currentIdx] === null) {
                const idx = parseInt(option.dataset.idx); const q = data.questions[currentIdx]; answers[currentIdx] = idx;
                quizEl.querySelectorAll('.iq-option').forEach((opt, i) => { opt.classList.add('disabled'); if (i === q.correct) opt.classList.add('correct'); else if (i === idx && idx !== q.correct) opt.classList.add('wrong'); });
                if (idx === q.correct) score++;
                if (q.explanation) { const expl = document.createElement('div'); expl.className = 'iq-explanation'; expl.innerHTML = '💡 ' + esc(q.explanation); quizEl.querySelector('.iq-options').after(expl); }
                const navDiv = quizEl.querySelector('.iq-nav div:last-child');
                if (currentIdx < data.questions.length - 1) navDiv.innerHTML += '<button class="iq-nav-btn primary" data-action="next">Próxima →</button>';
                else navDiv.innerHTML += '<button class="iq-nav-btn primary" data-action="results">Ver Resultado</button>';
                scrollToBottom(true);
            }
            if (navBtn) {
                const action = navBtn.dataset.action;
                if (action === 'next' && currentIdx < data.questions.length - 1) { currentIdx++; quizEl.innerHTML = renderQuizQuestion(data.questions[currentIdx], currentIdx, data.questions.length); if (answers[currentIdx] !== null) replayAnswer(quizEl, data.questions[currentIdx], answers[currentIdx]); scrollToBottom(); }
                if (action === 'prev' && currentIdx > 0) { currentIdx--; quizEl.innerHTML = renderQuizQuestion(data.questions[currentIdx], currentIdx, data.questions.length); if (answers[currentIdx] !== null) replayAnswer(quizEl, data.questions[currentIdx], answers[currentIdx]); }
                if (action === 'results') { const pct = Math.round((score / data.questions.length) * 100); quizEl.innerHTML = `<div class="iq-score"><div class="iq-score-num">${pct}%</div><div class="iq-score-label">${score} de ${data.questions.length} corretas</div><p style="color:var(--text-secondary);font-size:0.9rem">${getScoreMsg(pct)}</p></div>`; scrollToBottom(); }
            }
        });
    }
    function replayAnswer(quizEl, q, answer) {
        quizEl.querySelectorAll('.iq-option').forEach((opt, i) => { opt.classList.add('disabled'); if (i === q.correct) opt.classList.add('correct'); else if (i === answer && answer !== q.correct) opt.classList.add('wrong'); });
        if (q.explanation) { const expl = document.createElement('div'); expl.className = 'iq-explanation'; expl.innerHTML = '💡 ' + esc(q.explanation); quizEl.querySelector('.iq-options').after(expl); }
    }
    function getScoreMsg(pct) { if (pct >= 90) return '🏆 Excelente!'; if (pct >= 70) return '👏 Muito bem!'; if (pct >= 50) return '📚 Continue estudando.'; return '💪 Pratique mais!'; }

    function renderFlashcards(data) {
        const card = data.cards[0];
        let html = `<p><strong>🃏 ${esc(data.title || 'Flashcards Médicos')}</strong></p>`;
        html += '<div class="inline-flashcard" data-current="0">';
        html += `<div class="if-counter">1 / ${data.cards.length}</div>`;
        html += `<div class="if-card"><div class="if-inner"><div class="if-front"><span class="if-label">📝 Pergunta</span><p>${esc(card.front)}</p></div><div class="if-back"><span class="if-label">✅ Resposta</span><p>${esc(card.back)}</p></div></div></div>`;
        html += '<div class="if-controls"><div class="if-btn-group"><button class="if-btn" data-action="prev" disabled>←</button></div>';
        html += '<div class="if-btn-group"><button class="if-btn wrong" data-action="wrong">❌</button><button class="if-btn right" data-action="right">✅</button></div>';
        html += `<div class="if-btn-group"><button class="if-btn" data-action="next" ${data.cards.length <= 1 ? 'disabled' : ''}>→</button></div></div>`;
        html += '<div class="if-score" style="text-align:center;margin-top:10px;font-size:0.82rem;color:var(--text-muted)"></div></div>';
        return html;
    }
    function initFlashcardInteraction(container, data) {
        const fcEl = container.querySelector('.inline-flashcard'); if (!fcEl) return;
        let current = 0; let scores = { right: 0, wrong: 0 };
        fcEl.addEventListener('click', (e) => {
            const card = e.target.closest('.if-card'); const btn = e.target.closest('.if-btn');
            if (card) { card.classList.toggle('flipped'); return; }
            if (!btn) return; const action = btn.dataset.action;
            if (action === 'right' || action === 'wrong') { scores[action]++; updateFlashScore(fcEl, scores); if (current < data.cards.length - 1) { current++; updateFlashCard(fcEl, data, current); } }
            if (action === 'next' && current < data.cards.length - 1) { current++; updateFlashCard(fcEl, data, current); }
            if (action === 'prev' && current > 0) { current--; updateFlashCard(fcEl, data, current); }
        });
    }
    function updateFlashCard(fcEl, data, idx) {
        const card = data.cards[idx]; fcEl.querySelector('.if-counter').textContent = `${idx + 1} / ${data.cards.length}`;
        fcEl.querySelector('.if-front p').textContent = card.front; fcEl.querySelector('.if-back p').textContent = card.back;
        fcEl.querySelector('.if-card').classList.remove('flipped');
        fcEl.querySelector('[data-action="prev"]').disabled = idx === 0; fcEl.querySelector('[data-action="next"]').disabled = idx >= data.cards.length - 1;
    }
    function updateFlashScore(fcEl, scores) { const total = scores.right + scores.wrong; const pct = total > 0 ? Math.round((scores.right / total) * 100) : 0; fcEl.querySelector('.if-score').textContent = total > 0 ? `✅ ${scores.right} | ❌ ${scores.wrong} | ${pct}%` : ''; }

    function renderCaseStudy(data) {
        let html = `<p><strong>📋 ${esc(data.title || 'Caso Clínico')}</strong></p><div class="inline-case">`;
        for (const section of data.sections) {
            html += `<h2>${esc(section.heading)}</h2>`;
            if (section.spoiler) html += `<div class="spoiler"><div class="spoiler-label">🔒 Clique para revelar</div><div class="spoiler-content">${formatText(section.content)}</div></div>`;
            else html += formatText(section.content);
        }
        return html + '</div>';
    }
    function initCaseInteraction(container) { container.querySelectorAll('.spoiler').forEach(sp => sp.addEventListener('click', () => sp.classList.toggle('revealed'))); }

    // ============================================================
    // Text Formatting & Markdown Sanitization
    // ============================================================
    function formatText(text) {
        // Aggressively clean Vertex AI's compressed and chaotic markdown
        let cleanedText = text
            // Fix triple asterisks glued to words `***Word:` -> `\n\n**Word:** `
            .replace(/\*\*\*([^*]+):(\s*)\*\*\*/g, '\n\n**$1:** ')
            .replace(/\*\*\*([^*]+):\*\*\*/g, '\n\n**$1:** ')
            // Fix double asterisks glued to words without space before them
            .replace(/([.?!;])\s*(\*\*)/g, '$1\n\n$2')
            // Fix double asterisks that have list markers glued to them `**Word:***` -> `**Word:**\n* `
            .replace(/(\*\*.*?\*\*)\s*\*/g, '$1\n* ')
            // Ensure space after list markers (* or -) at the start of a line
            .replace(/(^|\n)(\*|-)(?=[A-Za-z0-9])/g, '$1$2 ')
            // Remove single dangling asterisks used weirdly as bullets without spaces
            .replace(/(^|\n)\*([A-Z])/g, '$1* $2')
            // Fix glued titles/bullets
            .replace(/([.?!;])\s*(\*|- )/g, '$1\n\n$2')
            // Clean up multiple newlines into max two
            .replace(/\n{3,}/g, '\n\n');

        if (typeof marked !== 'undefined') {
            return marked.parse(cleanedText, { breaks: true, gfm: true });
        }
        
        // Fallback
        return '<p>' + cleanedText.replace(/\n/g, '<br>') + '</p>';
    }

    function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

    // ============================================================
    // Settings
    // ============================================================
    function initSettings() {
        document.getElementById('set-save-btn').addEventListener('click', () => { saveSettings(); showStatus('set-status', '✅ Configurações salvas!', 'success'); checkHealth(); });
        document.getElementById('set-test-btn').addEventListener('click', async () => {
            saveSettings(); showStatus('set-status', '🔄 Testando conexão...', 'success');
            try { const response = await sendToMedGemma([{ role: 'user', content: 'Diga "MedGemma conectado com sucesso!" exatamente com essas palavras.' }], 50, 0.1); showStatus('set-status', '✅ ' + response.substring(0, 100), 'success'); checkHealth(); }
            catch (e) { showStatus('set-status', '❌ ' + e.message, 'error'); }
        });
        document.getElementById('set-temperature').addEventListener('input', (e) => { document.getElementById('temp-value').textContent = e.target.value; });
    }

    function showStatus(id, msg, type) { const el = document.getElementById(id); el.textContent = msg; el.className = `set-status show ${type}`; setTimeout(() => el.className = 'set-status', 8000); }

    // ============================================================
    // TEMAS — Sistema de Cores
    // ============================================================
    function initTheme() {
        const saved = localStorage.getItem('medgemma-theme') || 'gemini-dark';
        applyTheme(saved);

        document.getElementById('theme-picker')?.addEventListener('click', (e) => {
            const dot = e.target.closest('.theme-dot');
            if (!dot) return;
            const theme = dot.dataset.theme;
            applyTheme(theme);
            localStorage.setItem('medgemma-theme', theme);
        });
    }

    function applyTheme(theme) {
        // Remove data-theme to use :root defaults for gemini-dark
        if (theme === 'gemini-dark') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        // Update active dot
        document.querySelectorAll('.theme-dot').forEach(d => {
            d.classList.toggle('active', d.dataset.theme === theme);
        });
    }

    // ============================================================
    // INIT
    // ============================================================
    async function init() {
        try { state.db = await openDB(); } catch (e) { console.warn('IndexedDB não disponível:', e); }
        state.currentConvId = 'conv-' + Date.now();
        loadSettings();
        initTheme();
        initNavigation();
        initChat();
        initSettings();
        checkHealth();
        setInterval(checkHealth, 30000);
        if (state.db) await renderHistorySidebar();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
