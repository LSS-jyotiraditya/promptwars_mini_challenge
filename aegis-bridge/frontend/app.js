/**
 * Aegis Bridge - Frontend Application
 * Single-Page Application with hash-based routing
 */

const API_BASE = '/api';

// ── State ──────────────────────────────────────────────────────

let currentView = 'dashboard';
let pendingCount = 0;

// ── Router ─────────────────────────────────────────────────────

function navigateTo(view, params = {}) {
    currentView = view;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.view === view);
    });

    // Update header
    const headers = {
        dashboard: { title: 'Dashboard', desc: 'Real-time crisis monitoring and triage overview' },
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
        const res = await fetch(`${API_BASE}${endpoint}`, options);
        if (!res.ok) {
            const error = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(error.detail || 'API error');
        }
        return await res.json();
    } catch (err) {
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
                        <button class="btn btn-primary" style="margin-top:16px;" onclick="navigateTo('new-incident')">🆘 Create Incident</button>
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
                            <div class="v-desc">911, accidents, fires, crimes</div>
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
    try {
        const incident = await api(`/incidents/${id}`);
        const triage = incident.triage;

        document.getElementById('content-header').innerHTML = `
            <h2>${escapeHtml(incident.title)}</h2>
            <p>Incident #${incident.id} — ${incident.vertical.toUpperCase()} — ${formatTime(incident.created_at)}</p>
        `;

        let html = `<button class="back-btn" onclick="navigateTo('incidents')">← Back to Incidents</button>`;

        if (triage) {
            const severityIcons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: '🔵' };

            html += `
                <div class="severity-banner ${triage.severity} animate-in">
                    <div class="severity-icon">${severityIcons[triage.severity] || '⚪'}</div>
                    <div class="severity-text">
                        <h3>Severity: ${triage.severity.toUpperCase()}</h3>
                        <p>${escapeHtml(triage.summary)}</p>
                    </div>
                    <div class="confidence-meter" style="margin-left:auto;min-width:200px;">
                        <span style="font-size:0.75rem;color:var(--text-muted);">Confidence</span>
                        <div class="confidence-bar"><div class="confidence-fill" style="width:${(triage.confidence_score || 0) * 100}%"></div></div>
                        <span class="confidence-value">${((triage.confidence_score || 0) * 100).toFixed(0)}%</span>
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

            html += `</div>`;
        }

        // Actions
        if (incident.actions && incident.actions.length > 0) {
            html += `
                <div class="glass-card animate-in" style="margin-top:24px;">
                    <div class="card-header">
                        <span class="card-title">⚡ Recommended Actions (Human-in-the-Loop)</span>
                    </div>
                    ${incident.actions.map(a => renderActionCard(a)).join('')}
                </div>
            `;
        }

        // Original Input
        html += `
            <div class="glass-card animate-in" style="margin-top:24px;">
                <div class="card-header">
                    <span class="card-title">📝 Original Input</span>
                </div>
                <div style="background:var(--bg-primary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:16px;">
                    <pre style="white-space:pre-wrap;font-family:var(--font-mono);font-size:0.82rem;color:var(--text-secondary);line-height:1.7;">${escapeHtml(incident.input_text || 'No text input')}</pre>
                </div>
                ${incident.location ? `<p style="margin-top:12px;color:var(--text-secondary);font-size:0.85rem;">📍 <strong>Location:</strong> ${escapeHtml(incident.location)}</p>` : ''}
            </div>
        `;

        body.innerHTML = html;

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
            // Re-render preserving context
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
});
