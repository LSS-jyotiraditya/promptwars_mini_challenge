/**
 * Aegis Bridge - Frontend Application
 * Single-Page Application with hash-based routing
 * Features: Dashboard, Voice Bot (STT/TTS), New Incident, Action Queue, Audit Trail
 */

const API_BASE = '/api';

// ── State ──────────────────────────────────────────────────────

let currentView = 'dashboard';
let pendingCount = 0;

// Voice Bot State
let voiceRecognition = null;
let voiceIsListening = false;
let voiceTranscript = '';
let voiceSelectedVertical = 'emergency';

// ── Router ─────────────────────────────────────────────────────

function navigateTo(view, params = {}) {
    currentView = view;

    // Stop voice if navigating away
    if (view !== 'voice-bot' && voiceIsListening) {
        stopVoiceRecording();
    }

    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.view === view);
    });

    // Update header
    const headers = {
        dashboard: { title: 'Dashboard', desc: 'Real-time crisis monitoring and triage overview' },
        'voice-bot': { title: '🎙️ Voice Emergency', desc: 'Speak to report an emergency — AI transcribes, triages, and responds' },
        'new-incident': { title: 'New Incident', desc: 'Report a new crisis event for AI-powered triage' },
        incidents: { title: 'All Incidents', desc: 'Browse and search all crisis incidents' },
        actions: { title: 'Action Queue', desc: 'Review and approve AI-recommended actions' },
        audit: { title: 'Audit Trail', desc: 'Full chronological event log for compliance' },
        'incident-detail': { title: 'Incident Detail', desc: 'AI triage results and recommended actions' }
    };

    const h = headers[view] || headers.dashboard;
    document.getElementById('content-header').innerHTML = `<h2>${h.title}</h2><p>${h.desc}</p>`;

    // Render view
    const body = document.getElementById('content-body');
    body.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading...</p></div>';

    switch (view) {
        case 'dashboard': renderDashboard(); break;
        case 'voice-bot': renderVoiceBot(); break;
        case 'new-incident': renderNewIncident(); break;
        case 'incidents': renderIncidents(); break;
        case 'actions': renderActions(); break;
        case 'audit': renderAudit(); break;
        case 'incident-detail': renderIncidentDetail(params.id); break;
        default: renderDashboard();
    }
}

// ── API Helpers ────────────────────────────────────────────────

async function api(endpoint, options = {}) {
    try {
        const url = `${API_BASE}${endpoint}`;
        const res = await fetch(url, options);
        if (!res.ok) {
            console.error(`API status error: ${res.status} for ${url}`);
            const error = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(error.detail || `Server Error ${res.status}`);
        }
        return await res.json();
    } catch (err) {
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            console.error('Network Error: Check if server is reachable and CORS settings.');
            throw new Error('Network connection failed. Check server status.');
        }
        console.error('API Error:', err);
        throw err;
    }
}

// ── Toast Notifications ────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ── Update Pending Badge ───────────────────────────────────────

async function updatePendingBadge() {
    try {
        const actions = await api('/actions/pending');
        pendingCount = actions.length;
        const badge = document.getElementById('pending-badge');
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    } catch { /* silent */ }
}


// ══════════════════════════════════════════════════════════════════
// ── VOICE BOT (STT + TTS) ─────────────────────────────────────
// Uses browser's Web Speech API (FREE — zero tokens for STT/TTS)
// Only the transcript text is sent to Gemini for triage
// ══════════════════════════════════════════════════════════════════

function renderVoiceBot() {
    const body = document.getElementById('content-body');

    const supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

    body.innerHTML = `
        <div class="voice-bot-container">
            <div class="voice-hero animate-in">
                <div class="voice-visual">
                    <div class="voice-ring ring-1"></div>
                    <div class="voice-ring ring-2"></div>
                    <div class="voice-ring ring-3"></div>
                    <button class="voice-btn ${!supported ? 'disabled' : ''}" id="voice-main-btn" onclick="toggleVoice()">
                        <span class="voice-btn-icon" id="voice-btn-icon">🎙️</span>
                    </button>
                </div>
                <div class="voice-status" id="voice-status">
                    ${supported
            ? 'Tap the microphone and describe your emergency'
            : '⚠️ Voice not supported in this browser. Use Chrome or Edge.'}
                </div>
                <div class="voice-hint" id="voice-hint">Your speech is transcribed locally — only text is sent to AI</div>
            </div>

            <div class="voice-controls animate-in">
                <div class="voice-vertical-selector">
                    <span class="voice-label">Report Type:</span>
                    <button class="voice-type-btn selected" data-vtype="emergency" onclick="setVoiceVertical(this)">🚨 Emergency</button>
                    <button class="voice-type-btn" data-vtype="healthcare" onclick="setVoiceVertical(this)">🏥 Medical</button>
                    <button class="voice-type-btn" data-vtype="disaster" onclick="setVoiceVertical(this)">🌊 Disaster</button>
                </div>
            </div>

            <div class="voice-transcript-box animate-in" id="voice-transcript-box" style="display:none;">
                <div class="transcript-header">
                    <span>📝 Live Transcript</span>
                    <button class="btn btn-outline btn-sm" onclick="clearTranscript()">Clear</button>
                </div>
                <div class="transcript-content" id="voice-transcript-content">
                    <span class="transcript-interim" id="voice-interim"></span>
                </div>
                <div class="transcript-actions" id="transcript-actions" style="display:none;">
                    <button class="btn btn-primary" id="voice-submit-btn" onclick="submitVoiceTriage()">
                        🚀 Submit for AI Triage
                    </button>
                </div>
            </div>

            <div class="voice-response-box animate-in" id="voice-response-box" style="display:none;">
                <div class="response-header">
                    <span id="response-severity-icon">🔴</span>
                    <span id="response-severity-text">CRITICAL</span>
                    <button class="btn btn-outline btn-sm" id="voice-speak-btn" onclick="speakResponse()">🔊 Listen</button>
                </div>
                <div class="response-summary" id="response-summary"></div>
                <div class="response-actions" id="response-actions-count"></div>
                <button class="btn btn-outline btn-sm" id="voice-view-detail" style="display:none;" onclick="viewVoiceIncident()">
                    📋 View Full Triage Details
                </button>
            </div>
        </div>
    `;
}

let voiceIncidentId = null;

function setVoiceVertical(el) {
    document.querySelectorAll('.voice-type-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    voiceSelectedVertical = el.dataset.vtype;
}

function toggleVoice() {
    if (voiceIsListening) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

function startVoiceRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Speech recognition not supported. Use Chrome or Edge.', 'error');
        return;
    }

    voiceRecognition = new SpeechRecognition();
    voiceRecognition.continuous = true;
    voiceRecognition.interimResults = true;
    voiceRecognition.lang = 'en-IN';  // Indian English
    voiceRecognition.maxAlternatives = 1;

    voiceRecognition.onstart = () => {
        voiceIsListening = true;
        const btn = document.getElementById('voice-main-btn');
        const icon = document.getElementById('voice-btn-icon');
        const status = document.getElementById('voice-status');
        const hint = document.getElementById('voice-hint');
        const box = document.getElementById('voice-transcript-box');

        if (btn) btn.classList.add('listening');
        if (icon) icon.textContent = '⏹️';
        if (status) status.textContent = '🔴 Listening... Speak now';
        if (status) status.classList.add('pulse-text');
        if (hint) hint.textContent = 'Tap microphone again to stop recording';
        if (box) box.style.display = 'block';
    };

    voiceRecognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                final += event.results[i][0].transcript + ' ';
            } else {
                interim += event.results[i][0].transcript;
            }
        }
        voiceTranscript = final.trim();

        const content = document.getElementById('voice-transcript-content');
        const interimEl = document.getElementById('voice-interim');
        if (content) {
            const finalHtml = voiceTranscript ? `<span class="transcript-final">${escapeHtml(voiceTranscript)}</span>` : '';
            const interimHtml = interim ? `<span class="transcript-interim">${escapeHtml(interim)}</span>` : '';
            content.innerHTML = finalHtml + interimHtml;
        }

        // Show submit button when we have final text
        const actions = document.getElementById('transcript-actions');
        if (actions && voiceTranscript.length > 5) {
            actions.style.display = 'flex';
        }
    };

    voiceRecognition.onerror = (event) => {
        console.error('Speech error:', event.error);
        if (event.error === 'not-allowed') {
            showToast('Microphone access denied. Please allow microphone permissions.', 'error');
        } else if (event.error === 'network') {
            showToast('Browser requires internet for voice recognition. Try typing your report if offline.', 'error');
            const box = document.getElementById('voice-transcript-box');
            const actions = document.getElementById('transcript-actions');
            if (box) box.style.display = 'block';
            if (actions) actions.style.display = 'flex'; // Allow manual entry if possible (already supports it)
        } else if (event.error !== 'no-speech') {
            showToast(`Voice error: ${event.error}`, 'error');
        }
        stopVoiceRecording();
    };

    voiceRecognition.onend = () => {
        // Auto-restart if still supposed to be listening
        if (voiceIsListening && voiceRecognition) {
            try { voiceRecognition.start(); } catch { }
        }
    };

    try {
        voiceRecognition.start();
    } catch (e) {
        showToast('Could not start speech recognition', 'error');
    }
}

function stopVoiceRecording() {
    voiceIsListening = false;
    if (voiceRecognition) {
        try { voiceRecognition.stop(); } catch { }
        voiceRecognition = null;
    }

    const btn = document.getElementById('voice-main-btn');
    const icon = document.getElementById('voice-btn-icon');
    const status = document.getElementById('voice-status');
    const hint = document.getElementById('voice-hint');

    if (btn) btn.classList.remove('listening');
    if (icon) icon.textContent = '🎙️';
    if (status) {
        status.textContent = voiceTranscript ? 'Recording stopped — review transcript below' : 'Tap the microphone and describe your emergency';
        status.classList.remove('pulse-text');
    }
    if (hint) hint.textContent = voiceTranscript ? 'Submit the transcript for AI triage, or record more' : 'Your speech is transcribed locally — only text is sent to AI';
}

function clearTranscript() {
    voiceTranscript = '';
    const content = document.getElementById('voice-transcript-content');
    const actions = document.getElementById('transcript-actions');
    const responseBox = document.getElementById('voice-response-box');
    if (content) content.innerHTML = '<span class="transcript-interim"></span>';
    if (actions) actions.style.display = 'none';
    if (responseBox) responseBox.style.display = 'none';
}

async function submitVoiceTriage() {
    if (!voiceTranscript || voiceTranscript.length < 5) {
        showToast('Please speak a description first', 'error');
        return;
    }

    stopVoiceRecording();

    const btn = document.getElementById('voice-submit-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> AI Analyzing...';
    }

    try {
        const result = await api('/voice-triage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transcript: voiceTranscript,
                vertical: voiceSelectedVertical
            })
        });

        voiceIncidentId = result.incident_id;

        // Show response
        const responseBox = document.getElementById('voice-response-box');
        const severityIcon = document.getElementById('response-severity-icon');
        const severityText = document.getElementById('response-severity-text');
        const summaryEl = document.getElementById('response-summary');
        const actionsCount = document.getElementById('response-actions-count');
        const viewBtn = document.getElementById('voice-view-detail');

        const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: '🔵' };

        if (responseBox) responseBox.style.display = 'block';
        if (severityIcon) severityIcon.textContent = icons[result.severity] || '⚪';
        if (severityText) severityText.textContent = (result.severity || 'UNKNOWN').toUpperCase();
        if (summaryEl) summaryEl.textContent = result.spoken_summary || result.summary;
        if (actionsCount) actionsCount.textContent = `${result.actions_created} action(s) queued for human approval`;
        if (viewBtn) viewBtn.style.display = 'inline-block';

        showToast('Voice triage complete!', 'success');
        updatePendingBadge();

        // Auto-speak the response
        speakResponse();

    } catch (err) {
        showToast(`Triage error: ${err.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🚀 Submit for AI Triage';
        }
    }
}

function speakResponse() {
    const summaryEl = document.getElementById('response-summary');
    if (!summaryEl || !summaryEl.textContent) return;

    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(summaryEl.textContent);
        utterance.lang = 'en-IN';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        // Try to find a good voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
        if (preferred) utterance.voice = preferred;

        window.speechSynthesis.speak(utterance);
    } else {
        showToast('Text-to-speech not supported in this browser', 'info');
    }
}

function viewVoiceIncident() {
    if (voiceIncidentId) {
        navigateTo('incident-detail', { id: voiceIncidentId });
    }
}


// ── Dashboard View ─────────────────────────────────────────────

async function renderDashboard() {
    const body = document.getElementById('content-body');
    try {
        const stats = await api('/dashboard/stats');

        const emergency = stats.by_vertical?.emergency || 0;
        const healthcare = stats.by_vertical?.healthcare || 0;
        const disaster = stats.by_vertical?.disaster || 0;
        const criticalCount = stats.by_severity?.critical || 0;
        const highCount = stats.by_severity?.high || 0;

        body.innerHTML = `
            <div class="dashboard-map-header animate-in">
                <h3>🌍 Global Crisis Situation Map</h3>
                <span class="badge badge-info">Real-time Visualization</span>
            </div>
            <div id="dashboard-map" class="map-container animate-in"></div>

            <div class="stats-grid">
                <div class="stat-card cyan animate-in">
                    <div class="stat-icon">📊</div>
                    <div class="stat-value">${stats.total_incidents}</div>
                    <div class="stat-label">Total Incidents</div>
                </div>
                <div class="stat-card red animate-in">
                    <div class="stat-icon">⚡</div>
                    <div class="stat-value">${stats.pending_actions}</div>
                    <div class="stat-label">Pending Actions</div>
                </div>
                <div class="stat-card amber animate-in">
                    <div class="stat-icon">🔴</div>
                    <div class="stat-value">${criticalCount + highCount}</div>
                    <div class="stat-label">Critical / High Severity</div>
                </div>
                <div class="stat-card purple animate-in">
                    <div class="stat-icon">🏥</div>
                    <div class="stat-value">${healthcare}</div>
                    <div class="stat-label">Healthcare Triage</div>
                </div>
            </div>

            <div class="two-col">
                <div class="glass-card animate-in">
                    <div class="card-header">
                        <span class="card-title">📈 Incidents by Vertical</span>
                    </div>
                    <div style="display:flex;gap:20px;flex-wrap:wrap;">
                        ${renderVerticalBar('🚨 Emergency', emergency, stats.total_incidents || 1, 'var(--accent-red)')}
                        ${renderVerticalBar('🏥 Healthcare', healthcare, stats.total_incidents || 1, 'var(--accent-cyan)')}
                        ${renderVerticalBar('🌊 Disaster', disaster, stats.total_incidents || 1, 'var(--accent-amber)')}
                    </div>
                </div>

                <div class="glass-card animate-in">
                    <div class="card-header">
                        <span class="card-title">📊 By Status</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${Object.entries(stats.by_status || {}).map(([k, v]) => `
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span class="badge badge-${k}">${k}</span>
                                <span style="font-weight:700;font-family:var(--font-mono);color:var(--text-primary);">${v}</span>
                            </div>
                        `).join('')}
                        ${Object.keys(stats.by_status || {}).length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:20px;">No data yet</p>' : ''}
                    </div>
                </div>
            </div>

            <div class="glass-card animate-in" style="margin-top:24px;">
                <div class="card-header">
                    <span class="card-title">🕒 Recent Incidents</span>
                    <button class="btn btn-outline btn-sm" onclick="navigateTo('incidents')">View All →</button>
                </div>
                ${stats.recent_incidents && stats.recent_incidents.length > 0 ? `
                    <div class="incident-list">
                        ${stats.recent_incidents.map(i => renderIncidentItem(i)).join('')}
                    </div>
                ` : `
                    <div class="empty-state">
                        <div class="empty-icon">📭</div>
                        <h3>No incidents yet</h3>
                        <p>Create your first incident to see AI-powered triage in action.</p>
                        <div style="display:flex;gap:12px;margin-top:16px;justify-content:center;">
                            <button class="btn btn-primary" onclick="navigateTo('voice-bot')">🎙️ Voice Report</button>
                            <button class="btn btn-outline" onclick="navigateTo('new-incident')">🆘 Text Report</button>
                        </div>
                    </div>
                `}
            </div>

            <div class="demo-section animate-in">
                <h4>🧪 Quick Demo — Run Pre-built Scenarios</h4>
                <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">Generate realistic test incidents with Gemini-powered triage</p>
                <div class="demo-buttons">
                    <button class="btn btn-demo btn-sm" onclick="runDemo('emergency')">🚨 Emergency Demo</button>
                    <button class="btn btn-demo btn-sm" onclick="runDemo('healthcare')">🏥 Healthcare Demo</button>
                    <button class="btn btn-demo btn-sm" onclick="runDemo('disaster')">🌊 Disaster Demo</button>
                </div>
            </div>
        `;

        // Initialize Global Map
        initGlobalMap(stats.recent_incidents || []);

    } catch (err) {
        body.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading dashboard</h3><p>${err.message}</p></div>`;
    }
}

function renderVerticalBar(label, count, total, color) {
    const pct = total > 0 ? (count / total * 100) : 0;
    return `
        <div style="flex:1;min-width:100px;">
            <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:6px;">${label}</div>
            <div style="font-size:1.5rem;font-weight:800;margin-bottom:6px;">${count}</div>
            <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 1s ease;"></div>
            </div>
        </div>
    `;
}

// ── New Incident View ──────────────────────────────────────────

function renderNewIncident() {
    const body = document.getElementById('content-body');
    body.innerHTML = `
        <div style="max-width:800px;">
            <div class="glass-card animate-in">
                <h3 style="font-size:1.1rem;margin-bottom:20px;">🆘 Report New Incident</h3>

                <div class="form-group">
                    <label class="form-label">Select Vertical</label>
                    <div class="vertical-selector">
                        <div class="vertical-option selected" data-vertical="emergency" onclick="selectVertical(this)">
                            <div class="v-icon">🚨</div>
                            <div class="v-title">Emergency Response</div>
                            <div class="v-desc">100/108, accidents, fires, crimes</div>
                        </div>
                        <div class="vertical-option" data-vertical="healthcare" onclick="selectVertical(this)">
                            <div class="v-icon">🏥</div>
                            <div class="v-title">Healthcare Triage</div>
                            <div class="v-desc">Medical records, patient intake</div>
                        </div>
                        <div class="vertical-option" data-vertical="disaster" onclick="selectVertical(this)">
                            <div class="v-icon">🌊</div>
                            <div class="v-title">Disaster Relief</div>
                            <div class="v-desc">Natural disasters, relief coordination</div>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Incident Title</label>
                    <input type="text" class="form-input" id="incident-title" placeholder="Brief descriptive title...">
                </div>

                <div class="form-group">
                    <label class="form-label">Incident Description</label>
                    <textarea class="form-textarea" id="incident-text" placeholder="Describe the situation in as much detail as possible. Include observations, symptoms, descriptions of what you see or hear..."></textarea>
                </div>

                <div class="two-col">
                    <div class="form-group">
                        <label class="form-label">Location</label>
                        <input type="text" class="form-input" id="incident-location" placeholder="Address, GPS coords, or area description">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Reported By</label>
                        <input type="text" class="form-input" id="incident-reporter" placeholder="Your name or ID">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Attachments (Images, PDFs)</label>
                    <div class="file-upload-area" id="file-drop-area">
                        <div class="upload-icon">📎</div>
                        <p>Drag & drop files here, or click to browse</p>
                        <small>Supports JPG, PNG, PDF — Max 10MB per file</small>
                        <input type="file" id="file-upload" multiple accept="image/*,.pdf" onchange="handleFileSelect(event)">
                    </div>
                    <div class="file-list" id="file-list"></div>
                </div>

                <div style="display:flex;gap:12px;justify-content:flex-end;padding-top:12px;">
                    <button class="btn btn-outline" onclick="navigateTo('dashboard')">Cancel</button>
                    <button class="btn btn-primary" id="submit-btn" onclick="submitIncident()">
                        🚀 Submit & Triage
                    </button>
                </div>
            </div>

            <div class="demo-section animate-in">
                <h4>🧪 Or Run a Pre-built Demo</h4>
                <div class="demo-buttons">
                    <button class="btn btn-demo btn-sm" onclick="runDemo('emergency')">🚨 Emergency</button>
                    <button class="btn btn-demo btn-sm" onclick="runDemo('healthcare')">🏥 Healthcare</button>
                    <button class="btn btn-demo btn-sm" onclick="runDemo('disaster')">🌊 Disaster</button>
                </div>
            </div>
        </div>
    `;
}

let selectedVertical = 'emergency';
let selectedFiles = [];

function selectVertical(el) {
    document.querySelectorAll('.vertical-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    selectedVertical = el.dataset.vertical;
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    selectedFiles = [...selectedFiles, ...files];
    renderFileList();
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
}

function renderFileList() {
    const list = document.getElementById('file-list');
    if (!list) return;
    list.innerHTML = selectedFiles.map((f, i) => `
        <div class="file-chip">
            📄 ${f.name} (${(f.size / 1024).toFixed(1)} KB)
            <span class="remove" onclick="removeFile(${i})">✕</span>
        </div>
    `).join('');
}

async function submitIncident() {
    const title = document.getElementById('incident-title')?.value?.trim();
    const text = document.getElementById('incident-text')?.value?.trim();
    const location = document.getElementById('incident-location')?.value?.trim();
    const reporter = document.getElementById('incident-reporter')?.value?.trim();

    if (!title) { showToast('Please enter an incident title', 'error'); return; }
    if (!text) { showToast('Please describe the incident', 'error'); return; }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> AI Analyzing...';

    try {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('vertical', selectedVertical);
        formData.append('text_input', text);
        if (location) formData.append('location', location);
        if (reporter) formData.append('reported_by', reporter);
        selectedFiles.forEach(f => formData.append('files', f));

        const result = await api('/incidents', { method: 'POST', body: formData });

        showToast('Incident triaged successfully!', 'success');
        selectedFiles = [];
        navigateTo('incident-detail', { id: result.incident_id });
        updatePendingBadge();

    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
        btn.disabled = false;
        btn.innerHTML = '🚀 Submit & Triage';
    }
}

// ── Demo Runner ────────────────────────────────────────────────

async function runDemo(vertical) {
    showToast(`Running ${vertical} demo scenario...`, 'info');

    try {
        const formData = new FormData();
        formData.append('vertical', vertical);

        const result = await api('/incidents/demo', { method: 'POST', body: formData });

        showToast(`Demo incident triaged! Severity: ${result.incident?.triage?.severity || 'N/A'}`, 'success');
        navigateTo('incident-detail', { id: result.incident_id });
        updatePendingBadge();

    } catch (err) {
        showToast(`Demo error: ${err.message}`, 'error');
    }
}

// ── Incidents List View ────────────────────────────────────────

async function renderIncidents() {
    const body = document.getElementById('content-body');
    try {
        const incidents = await api('/incidents');

        if (incidents.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <h3>No incidents recorded</h3>
                    <p>Submit a new incident or run a demo to get started.</p>
                    <button class="btn btn-primary" style="margin-top:16px;" onclick="navigateTo('new-incident')">🆘 New Incident</button>
                </div>`;
            return;
        }

        body.innerHTML = `
            <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
                <button class="btn btn-outline btn-sm" onclick="filterIncidents(null)">All</button>
                <button class="btn btn-outline btn-sm" onclick="filterIncidents('emergency')">🚨 Emergency</button>
                <button class="btn btn-outline btn-sm" onclick="filterIncidents('healthcare')">🏥 Healthcare</button>
                <button class="btn btn-outline btn-sm" onclick="filterIncidents('disaster')">🌊 Disaster</button>
            </div>
            <div class="incident-list" id="incidents-list">
                ${incidents.map(i => renderIncidentItem(i)).join('')}
            </div>`;
    } catch (err) {
        body.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${err.message}</p></div>`;
    }
}

async function filterIncidents(vertical) {
    const params = vertical ? `?vertical=${vertical}` : '';
    try {
        const incidents = await api(`/incidents${params}`);
        const list = document.getElementById('incidents-list');
        if (list) {
            list.innerHTML = incidents.length > 0
                ? incidents.map(i => renderIncidentItem(i)).join('')
                : '<div class="empty-state"><p>No incidents match this filter.</p></div>';
        }
    } catch (err) {
        showToast('Filter error', 'error');
    }
}

function renderIncidentItem(incident) {
    const verticalIcons = { emergency: '🚨', healthcare: '🏥', disaster: '🌊' };
    const icon = verticalIcons[incident.vertical] || '📋';
    const severity = incident.triage?.severity || incident.status || 'info';
    const time = formatTime(incident.created_at);

    return `
        <div class="incident-card animate-in" onclick="navigateTo('incident-detail', {id: ${incident.id}})">
            <div class="severity-dot ${severity}"></div>
            <div class="incident-info">
                <h4>${icon} ${escapeHtml(incident.title)}</h4>
                <p>${escapeHtml((incident.input_text || '').substring(0, 100))}${(incident.input_text || '').length > 100 ? '...' : ''}</p>
            </div>
            <div class="incident-meta">
                <span class="badge badge-${incident.vertical}">${incident.vertical}</span>
                <span class="badge badge-${incident.status}">${incident.status}</span>
                <span>${time}</span>
            </div>
        </div>
    `;
}

// ── Incident Detail View ───────────────────────────────────────

async function renderIncidentDetail(id) {
    const body = document.getElementById('content-body');
    const header = document.getElementById('content-header');

    try {
        const incident = await api(`/incidents/${id}`);
        const triage = incident.triage;

        header.innerHTML = `
            <h2>${escapeHtml(incident.title)}</h2>
            <p>Incident #${incident.id} — ${incident.vertical.toUpperCase()} — ${formatTime(incident.created_at)}</p>
        `;

        let html = `<button class="back-btn" onclick="navigateTo('incidents')">← Back to Incidents</button>`;

        if (triage) {
            const severityIcons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: '🔵' };

            // Severity Banner
            html += `
                <div class="severity-banner ${triage.severity} animate-in">
                    <div class="severity-icon">${severityIcons[triage.severity] || '⚪'}</div>
                    <div class="severity-text">
                        <h3>Severity: ${triage.severity.toUpperCase()}</h3>
                        <p>${escapeHtml(triage.summary)}</p>
                    </div>
                    <div class="confidence-meter" style="margin-left:auto;min-width:200px;">
                        <span style="font-size:0.75rem;color:var(--text-muted);">Confidence</span>
                        <div class="confidence-bar"><div class="confidence-fill" style="width:${(triage.confidence || 0) * 100}%"></div></div>
                        <span class="confidence-value">${((triage.confidence || 0) * 100).toFixed(0)}%</span>
                    </div>
                </div>
            `;

            html += `<div class="triage-detail">`;

            // AI Summary
            html += `
                <div class="triage-section animate-in">
                    <h3>🧠 AI Analysis Summary</h3>
                    <p style="color:var(--text-secondary);line-height:1.6;">${escapeHtml(triage.summary)}</p>
                    <div style="margin-top:16px;">
                        <span class="badge badge-${incident.vertical}">${incident.vertical}</span>
                        <span class="badge badge-${triage.severity}">${triage.severity}</span>
                        <span class="badge badge-${incident.status}">${incident.status}</span>
                    </div>
                </div>
            `;

            // Citations
            html += `
                <div class="triage-section animate-in">
                    <h3>📌 Evidence & Citations</h3>
                    ${(triage.citations || []).length > 0
                    ? triage.citations.map(c => `
                            <div class="citation-card">
                                <div class="source">${escapeHtml(c.source_type || 'input')}</div>
                                <div class="excerpt">"${escapeHtml(c.excerpt || '')}"</div>
                                <div class="relevance">${escapeHtml(c.relevance || '')}</div>
                            </div>
                        `).join('')
                    : '<p style="color:var(--text-muted);">No citations available</p>'
                }
                </div>
            `;

            // Structured Output
            html += `
                <div class="triage-section full-width animate-in">
                    <h3>📦 Structured Output Payload</h3>
                    <div class="json-viewer">${formatJSON(triage.structured_output)}</div>
                </div>
            `;

            html += `</div>`; // Close triage-detail

            // Recommendations
            if (incident.actions && incident.actions.length > 0) {
                html += `
                    <div class="glass-card animate-in" style="margin-top:24px;">
                        <div class="card-header"><span class="card-title">⚡ Recommended Actions (Human-in-the-Loop)</span></div>
                        ${incident.actions.map(a => renderActionCard(a)).join('')}
                    </div>
                `;
            }

            // Map
            html += `
                <div class="glass-card animate-in" style="margin-top:24px;">
                    <div class="card-header"><span class="card-title">📍 Localized Triage Map</span></div>
                    <div id="incident-map-container" class="map-container mini"></div>
                </div>
            `;

        } else {
            // "Processing" State - Analysis hasn't finished yet
            html += `
                <div class="triage-loading-card animate-in" style="background:var(--bg-glass);padding:60px;text-align:center;border-radius:16px;border:1px solid rgba(255,255,255,0.05);margin-top:20px;backdrop-filter:blur(10px);">
                    <div class="spinner" style="margin: 0 auto 30px;width:50px;height:50px;border-width:4px;"></div>
                    <h2 style="color:var(--accent-glow);letter-spacing:1px;margin-bottom:12px;">🧠 Situational Intelligence Engine</h2>
                    <p style="color:var(--text-secondary);max-width:550px;margin: 0 auto;font-size:1.1rem;line-height:1.6;">
                        Our advanced models (Gemma-3 via Resilience Fallback) are currently triaging this report, 
                        calculating risks, and synchronizing with the Global Knowledge Graph.
                    </p>
                    <div class="processing-steps" style="margin-top:40px;display:flex;justify-content:center;gap:30px;opacity:0.6;">
                        <div class="step-item"><div class="badge badge-emergency">RAG Retrieval</div></div>
                        <div class="step-item"><div class="badge badge-healthcare">Graph Sync</div></div>
                        <div class="step-item"><div class="badge badge-disaster">Safety Audit</div></div>
                    </div>
                </div>
            `;

            // Poll for result every 4 seconds
            setTimeout(() => {
                if (window.location.hash === `#incident/${id}`) {
                    renderIncidentDetail(id);
                }
            }, 4000);
        }

        // Original Input Card (Always Show)
        html += `
            <div class="glass-card animate-in" style="margin-top:24px;">
                <div class="card-header"><span class="card-title">📝 Original Report Input</span></div>
                <div style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:16px;">
                    <pre style="white-space:pre-wrap;font-family:var(--font-mono);font-size:0.85rem;color:var(--text-secondary);line-height:1.7;">${escapeHtml(incident.input_text || 'No text input provided')}</pre>
                </div>
                ${incident.location ? `<p style="margin-top:16px;color:var(--text-muted);font-size:0.9rem;">📍 <strong>Reported Location:</strong> ${escapeHtml(incident.location)}</p>` : ''}
            </div>
        `;

        body.innerHTML = html;

        // Initialize Map if triage is ready and location exists
        if (triage && incident.location) {
            initIncidentMap(incident);
        }

    } catch (err) {
        body.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading incident</h3><p>${err.message}</p></div>`;
    }
}

// ── Action Queue View ──────────────────────────────────────────

async function renderActions() {
    const body = document.getElementById('content-body');
    try {
        const actions = await api('/actions/pending');

        if (actions.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">✅</div>
                    <h3>All clear!</h3>
                    <p>No pending actions requiring approval. All AI recommendations have been reviewed.</p>
                </div>`;
            return;
        }

        body.innerHTML = `
            <div style="margin-bottom:16px;">
                <span style="color:var(--text-secondary);font-size:0.88rem;">
                    ${actions.length} action${actions.length !== 1 ? 's' : ''} awaiting human approval
                </span>
            </div>
            <div id="actions-list">
                ${actions.map(a => renderActionCard(a, true)).join('')}
            </div>
        `;
    } catch (err) {
        body.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${err.message}</p></div>`;
    }
}

function renderActionCard(action, showIncidentInfo = false) {
    const actionIcons = {
        dispatch_unit: '🚒', evacuate: '🏃', alert_public: '📢', request_backup: '🆘',
        medical_response: '🚑', hazmat_team: '☢️', order_lab: '🔬', order_imaging: '📷',
        administer_medication: '💊', consult_specialist: '👨‍⚕️', admit_patient: '🏥',
        deploy_team: '🪖', supply_drop: '📦', establish_shelter: '🏕️', medical_camp: '⛑️',
        search_rescue: '🔍', manual_review: '👁️', other: '📋', monitor: '📊',
        infrastructure_repair: '🔧', evacuation: '🚁', discharge: '🚪'
    };
    const icon = actionIcons[action.action_type] || '📋';
    const isPending = action.status === 'pending';

    return `
        <div class="action-card animate-in">
            <div class="action-card-header">
                <div class="action-type">
                    <span>${icon}</span>
                    ${escapeHtml(action.action_type?.replace(/_/g, ' ').toUpperCase() || 'ACTION')}
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span class="badge badge-${action.priority}">${action.priority}</span>
                    <span class="badge badge-${action.status}">${action.status}</span>
                </div>
            </div>
            <div class="action-card-body">
                <p>${escapeHtml(action.description)}</p>
                ${showIncidentInfo && action.incident_title ? `
                    <p style="font-size:0.78rem;color:var(--text-muted);cursor:pointer;" onclick="navigateTo('incident-detail', {id:${action.incident_id}})">
                        📋 ${escapeHtml(action.incident_title)} — <span class="badge badge-${action.vertical}">${action.vertical}</span>
                    </p>
                ` : ''}
                ${action.payload && typeof action.payload === 'object' && Object.keys(action.payload).length > 0 ? `
                    <details style="margin-top:8px;">
                        <summary style="cursor:pointer;font-size:0.8rem;color:var(--text-muted);">View payload details</summary>
                        <div class="json-viewer" style="margin-top:8px;max-height:200px;">${formatJSON(action.payload)}</div>
                    </details>
                ` : ''}
            </div>
            ${isPending ? `
                <div class="action-card-footer">
                    <button class="btn btn-danger btn-sm" onclick="handleAction(${action.id}, 'reject')">✕ Reject</button>
                    <button class="btn btn-success btn-sm" onclick="handleAction(${action.id}, 'approve')">✓ Approve</button>
                </div>
            ` : `
                <div class="action-card-footer">
                    <span style="font-size:0.78rem;color:var(--text-muted);">
                        ${action.status === 'approved' ? '✅' : '❌'} ${action.status} by ${escapeHtml(action.approved_by || 'unknown')} at ${formatTime(action.approved_at)}
                    </span>
                </div>
            `}
        </div>
    `;
}

async function handleAction(actionId, type) {
    try {
        const formData = new FormData();
        formData.append('approved_by', 'UAT Operator');

        await api(`/actions/${actionId}/${type}`, { method: 'POST', body: formData });
        showToast(`Action ${type}d successfully!`, type === 'approve' ? 'success' : 'info');

        // Refresh current view
        if (currentView === 'actions') renderActions();
        else if (currentView === 'incident-detail') {
            const body = document.getElementById('content-body');
            const backBtn = body.querySelector('.back-btn');
            const match = body.innerHTML.match(/Incident #(\d+)/);
            if (match) renderIncidentDetail(parseInt(match[1]));
        }
        updatePendingBadge();

    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    }
}

// ── Audit Trail View ───────────────────────────────────────────

async function renderAudit() {
    const body = document.getElementById('content-body');
    try {
        const logs = await api('/audit');

        if (logs.length === 0) {
            body.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📜</div>
                    <h3>No audit entries</h3>
                    <p>Events will appear here as incidents are created, triaged, and acted upon.</p>
                </div>`;
            return;
        }

        body.innerHTML = `
            <div class="glass-card animate-in">
                <div class="card-header">
                    <span class="card-title">📜 Event Timeline (${logs.length} entries)</span>
                </div>
                <div class="audit-timeline">
                    ${logs.map(log => `
                        <div class="audit-entry ${log.event_type} animate-in">
                            <div class="event-type">${escapeHtml(log.event_type?.replace(/_/g, ' ') || '')}</div>
                            <div class="event-detail">${escapeHtml(log.event_detail)}</div>
                            <div class="event-meta">
                                <span>👤 ${escapeHtml(log.actor || 'system')}</span>
                                <span>🕒 ${formatTime(log.created_at)}</span>
                                ${log.incident_id ? `<span style="cursor:pointer;color:var(--accent-cyan);" onclick="navigateTo('incident-detail', {id:${log.incident_id}})">📋 Incident #${log.incident_id}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (err) {
        body.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${err.message}</p></div>`;
    }
}

// ── Utilities ──────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTime(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr + (dateStr.includes('Z') || dateStr.includes('+') ? '' : 'Z'));
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
}

function formatJSON(obj) {
    if (!obj) return '<span style="color:var(--text-muted);">null</span>';
    if (typeof obj === 'string') {
        try { obj = JSON.parse(obj); } catch { return escapeHtml(obj); }
    }
    return syntaxHighlight(JSON.stringify(obj, null, 2));
}

function syntaxHighlight(json) {
    json = escapeHtml(json);
    return json.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function (match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                    match = match.replace(/:$/, '') + ':';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-bool';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        }
    );
}

// ── Init ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    navigateTo('dashboard');
    updatePendingBadge();
    // Poll for pending actions every 30s
    setInterval(updatePendingBadge, 30000);
    // Preload voices for TTS
    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
    }
});

// ── Maps & Geocoding ───────────────────────────────────────────

let globalMap = null;

function initGlobalMap(incidents) {
    if (globalMap) globalMap.remove();

    // Default center: India
    globalMap = L.map('dashboard-map').setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(globalMap);

    incidents.forEach(inc => {
        if (inc.location) {
            const coords = getCoordinates(inc.location);
            const triage = inc.triage || {};
            const severity = triage.severity || 'medium';
            const icon = L.divIcon({
                className: `marker-pin-${severity}`,
                html: `<span>📍</span>`,
                iconSize: [30, 42],
                iconAnchor: [15, 42]
            });

            L.marker(coords, { icon })
                .addTo(globalMap)
                .bindPopup(`
                    <strong>${escapeHtml(inc.title || inc.vertical)}</strong><br>
                    Severity: <span class="badge badge-${severity}">${severity.toUpperCase()}</span><br>
                    Location: ${escapeHtml(inc.location)}<br>
                    <button onclick="navigateTo('incident-detail', {id:${inc.id}})" style="margin-top:5px;cursor:pointer;">View Detail</button>
                `);
        }
    });
}

function initIncidentMap(incident) {
    const mapDiv = document.getElementById('incident-map-container');
    if (!mapDiv) return;

    const coords = getCoordinates(incident.location);
    const map = L.map('incident-map-container').setView(coords, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const severity = (incident.triage && incident.triage.severity) || 'medium';
    L.marker(coords).addTo(map)
        .bindPopup(`<strong>Reported Location:</strong> ${escapeHtml(incident.location)}<br>Severity: ${severity}`)
        .openPopup();
}

/**
 * Geocoding Simulation (Mapping Indian landmarks/cities to coords)
 * In a real app, this would call a Geocoding API (Pelias/Mapbox/Google)
 */
function getCoordinates(locationStr) {
    const loc = locationStr.toLowerCase();

    // Hardcoded common locations for demo
    const database = {
        'mumbai': [19.0760, 72.8777],
        'delhi': [28.6139, 77.2090],
        'bangalore': [12.9716, 77.5946],
        'hyderabad': [17.3850, 78.4867],
        'chennai': [13.0827, 80.2707],
        'kolkata': [22.5726, 88.3639],
        'pune': [18.5204, 73.8567],
        'gateway of india': [18.9220, 72.8347],
        'red fort': [28.6562, 77.2410],
        'mg road': [12.9745, 77.6068],
        'marina beach': [13.0418, 80.2824],
        'howrah bridge': [22.5851, 88.3521],
        'chandni chowk': [28.6659, 77.2307],
        'palam': [28.5857, 77.0701]
    };

    for (const key in database) {
        if (loc.includes(key)) return database[key];
    }

    // Default to a random-ish point in India if not found
    return [20 + Math.random() * 5, 75 + Math.random() * 5];
}
