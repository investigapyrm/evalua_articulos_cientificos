const AUDITOR_PROFILE_KEY = 'cai_public_auditor_profile_v1';
const AUDITOR_JUDGMENTS_KEY = 'cai_public_auditor_judgments_v1';

const auditorState = {
  data: null,
  records: [],
  selectedId: null,
  reviewer: loadReviewerProfile(),
  judgments: loadJudgments(),
  query: '',
  viewerSize: 'medium',
  form: { A: '', B: '', C: '', D: '', notes: '' },
  lastSavedCaseId: null,
};

const AUDITOR_VIEWER_HEIGHTS = {
  medium: '860px',
  large: '1120px',
};

function loadReviewerProfile() {
  try {
    return JSON.parse(localStorage.getItem(AUDITOR_PROFILE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function saveReviewerProfile(profile) {
  auditorState.reviewer = profile;
  localStorage.setItem(AUDITOR_PROFILE_KEY, JSON.stringify(profile));
}

function clearReviewerProfile() {
  auditorState.reviewer = null;
  localStorage.removeItem(AUDITOR_PROFILE_KEY);
}

function loadJudgments() {
  try {
    const value = JSON.parse(localStorage.getItem(AUDITOR_JUDGMENTS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function saveJudgments() {
  localStorage.setItem(AUDITOR_JUDGMENTS_KEY, JSON.stringify(auditorState.judgments));
}

function reviewerKey(profile = auditorState.reviewer) {
  if (!profile || !profile.name) return '';
  return `${String(profile.name).trim().toLowerCase()}|${String(profile.affiliation || '').trim().toLowerCase()}`;
}

function getCurrentReviewerJudgments() {
  const key = reviewerKey();
  if (!key) return [];
  return auditorState.judgments
    .filter((item) => item.reviewer_key === key)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

function getJudgmentForCase(pdfId) {
  return getCurrentReviewerJudgments().find((item) => Number(item.pdf_id) === Number(pdfId)) || null;
}

function shuffleRecords(records, seed) {
  let current = seed >>> 0;
  const next = () => {
    current = (1664525 * current + 1013904223) >>> 0;
    return current / 4294967296;
  };
  for (let i = records.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [records[i], records[j]] = [records[j], records[i]];
  }
  return records;
}

function getSessionSeed() {
  const key = 'auditor_random_seed_v1';
  const cached = sessionStorage.getItem(key);
  if (cached) return Number(cached);
  const seed = Math.floor(Math.random() * 2147483647) || 1;
  sessionStorage.setItem(key, String(seed));
  return seed;
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function formatCaseMeta(record) {
  return [record.revista, record.pais, record.macroarea, record.anio || 's/f'].filter(Boolean).join(' · ');
}

function verdictTone(value) {
  if (!value) return 'muted';
  const low = value.toLowerCase();
  if (low.includes('ff')) return 'danger';
  if (low.includes('falla fuerte')) return 'danger';
  if (low.includes('debilidad')) return 'warning';
  if (low.includes('sin falla')) return 'success';
  if (low.includes('no falla')) return 'success';
  if (low.includes('no evaluable')) return 'muted';
  return 'muted';
}

function badge(label, tone = 'muted') {
  return `<span class="badge badge-${tone}">${label}</span>`;
}

function centralAuditorUrl(record = null) {
  const raw = window.SITE_CONFIG?.centralAuditorUrl || '';
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (auditorState.reviewer?.name) url.searchParams.set('revisor', auditorState.reviewer.name);
    if (record?.pdf_id) url.searchParams.set('pdf_id', String(record.pdf_id));
    url.searchParams.set('source', 'pages');
    return url.toString();
  } catch (error) {
    return raw;
  }
}

function syncStaticLinks() {
  const repoHref = window.SITE_CONFIG?.publicRepoUrl || 'https://github.com/investigapyrm/evalua_articulos_cientificos';
  document.getElementById('hero-repo-link').href = repoHref;
  const central = centralAuditorUrl();
  const topLink = document.getElementById('hero-central-link');
  if (central) topLink.href = central;
  else {
    topLink.removeAttribute('href');
    topLink.classList.add('btn-secondary');
    topLink.textContent = 'Configurar URL central';
  }
}

function syncViewerHeight() {
  document.documentElement.style.setProperty('--viewer-height', AUDITOR_VIEWER_HEIGHTS[auditorState.viewerSize] || AUDITOR_VIEWER_HEIGHTS.medium);
}

async function loadData() {
  const response = await fetch('public_data/auditables_346.json');
  if (!response.ok) throw new Error(`No se pudo cargar el catalogo: ${response.status}`);
  auditorState.data = await response.json();
  auditorState.records = shuffleRecords(auditorState.data.records.slice(), getSessionSeed());
}

function recordById(pdfId) {
  return auditorState.records.find((record) => Number(record.pdf_id) === Number(pdfId)) || null;
}

function filteredQueue() {
  const query = auditorState.query.trim().toLowerCase();
  const judgments = new Set(getCurrentReviewerJudgments().map((item) => Number(item.pdf_id)));
  return auditorState.records.filter((record) => {
    if (!query) return true;
    const haystack = [record.case_label, record.titulo, record.revista, record.pais, record.macroarea, record.anio]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const localStatus = judgments.has(Number(record.pdf_id)) ? 'guardado' : 'pendiente';
    return haystack.includes(query) || localStatus.includes(query);
  });
}

function chooseDefaultCase() {
  const requested = Number(getQueryParam('case') || getQueryParam('pdf_id') || '');
  if (requested && recordById(requested)) {
    auditorState.selectedId = requested;
    return;
  }
  const judgments = new Set(getCurrentReviewerJudgments().map((item) => Number(item.pdf_id)));
  const nextPending = auditorState.records.find((record) => !judgments.has(Number(record.pdf_id)));
  auditorState.selectedId = nextPending ? nextPending.pdf_id : (auditorState.records[0]?.pdf_id || null);
}

function renderHeroStats() {
  const mine = getCurrentReviewerJudgments();
  const judged = new Set(mine.map((item) => Number(item.pdf_id)));
  document.getElementById('hero-reviewer').textContent = auditorState.reviewer?.name || 'Sin registrar';
  document.getElementById('hero-saved').textContent = String(mine.length);
  document.getElementById('hero-pending').textContent = auditorState.records.length ? String(auditorState.records.length - judged.size) : '—';
}

function renderReviewerForm() {
  const form = document.getElementById('reviewer-form');
  document.getElementById('reviewer-name').value = auditorState.reviewer?.name || '';
  document.getElementById('reviewer-affiliation').value = auditorState.reviewer?.affiliation || '';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('reviewer-name').value.trim();
    const affiliation = document.getElementById('reviewer-affiliation').value.trim();
    if (!name) return;
    saveReviewerProfile({ name, affiliation });
    renderAll();
  });
  document.getElementById('clear-profile').addEventListener('click', () => {
    clearReviewerProfile();
    renderAll();
  });
}

function renderSummaryCards() {
  const mine = getCurrentReviewerJudgments();
  const queue = filteredQueue();
  const lastSaved = mine[0];
  const html = [
    {
      label: 'Casos guardados',
      value: mine.length,
      hint: 'Un registro local por caso y auditor',
    },
    {
      label: 'Casos visibles',
      value: queue.length,
      hint: 'Cola filtrada para ensayo',
    },
    {
      label: 'Ultimo guardado',
      value: lastSaved ? (recordById(lastSaved.pdf_id)?.case_label || `#${lastSaved.pdf_id}`) : '—',
      hint: lastSaved ? new Date(lastSaved.updated_at).toLocaleString('es-PY') : 'Sin registros locales',
    },
  ];
  document.getElementById('summary-grid').innerHTML = html.map((card) => `
    <div class="summary-card">
      <div class="summary-label">${card.label}</div>
      <div class="summary-value">${card.value}</div>
      <div class="summary-hint">${card.hint}</div>
    </div>
  `).join('');
}

function renderQueue() {
  const list = document.getElementById('queue-list');
  const judgments = new Set(getCurrentReviewerJudgments().map((item) => Number(item.pdf_id)));
  const items = filteredQueue().slice(0, 14);
  if (!items.length) {
    list.innerHTML = '<div class="placeholder">Sin casos que coincidan con la busqueda actual.</div>';
    return;
  }
  list.innerHTML = items.map((record) => {
    const isSaved = judgments.has(Number(record.pdf_id));
    const active = Number(record.pdf_id) === Number(auditorState.selectedId);
    return `
      <button class="queue-item ${active ? 'is-active' : ''}" type="button" data-case="${record.pdf_id}">
        <div class="queue-top">
          <span class="queue-id">${record.case_label || `#${record.pdf_id}`}</span>
          ${badge(isSaved ? 'Guardado' : 'Pendiente', isSaved ? 'success' : 'muted')}
        </div>
        <div class="queue-title">${record.titulo}</div>
        <div class="queue-meta">${formatCaseMeta(record)}</div>
      </button>
    `;
  }).join('');
  list.querySelectorAll('[data-case]').forEach((button) => {
    button.addEventListener('click', () => {
      auditorState.selectedId = Number(button.dataset.case);
      hydrateFormFromSaved();
      renderAll();
    });
  });
}

function renderSavedList() {
  const list = document.getElementById('saved-list');
  const mine = getCurrentReviewerJudgments().slice(0, 12);
  if (!mine.length) {
    list.innerHTML = '<div class="placeholder">Aun no guardaste ensayos locales.</div>';
    return;
  }
  list.innerHTML = mine.map((item) => {
    const record = recordById(item.pdf_id);
    return `
      <button class="saved-item" type="button" data-saved-case="${item.pdf_id}">
        <div class="saved-top">
          <span class="saved-id">${record?.case_label || `#${item.pdf_id}`}</span>
          ${badge(item.D || 'Sin D', verdictTone(item.D))}
        </div>
        <div class="saved-title">${record?.titulo || item.pdf_nombre || 'Caso guardado'}</div>
        <div class="saved-meta">${new Date(item.updated_at).toLocaleString('es-PY')} · A=${item.A} · B=${item.B} · C=${item.C}</div>
      </button>
    `;
  }).join('');
  list.querySelectorAll('[data-saved-case]').forEach((button) => {
    button.addEventListener('click', () => {
      auditorState.selectedId = Number(button.dataset.savedCase);
      hydrateFormFromSaved();
      renderAll();
    });
  });
}

function renderCase() {
  const record = recordById(auditorState.selectedId);
  if (!record) return;
  document.getElementById('case-label').textContent = record.case_label || `pdf_id ${record.pdf_id}`;
  document.getElementById('case-title').textContent = record.titulo;
  document.getElementById('case-meta').textContent = formatCaseMeta(record);
  document.getElementById('detail-catalog-link').href = `./?case=${record.pdf_id}`;
  document.getElementById('open-pdf-link').href = record.pdf_public_path || '#';
  document.getElementById('central-case-link').href = centralAuditorUrl(record) || '#';
  const centralTop = document.getElementById('hero-central-link');
  if (centralTop) centralTop.href = centralAuditorUrl(record) || '#';
  const alert = document.getElementById('case-alert');
  if (getJudgmentForCase(record.pdf_id)) {
    alert.hidden = false;
    alert.textContent = 'Ya tienes un ensayo local guardado para este caso. Si guardas de nuevo, se actualizara ese registro.';
  } else {
    alert.hidden = true;
    alert.textContent = '';
  }
  const frame = document.getElementById('case-frame');
  if (record.pdf_available) frame.src = `${record.pdf_public_path}#view=FitH`;
  else frame.removeAttribute('src');
}

function setChoice(field, value) {
  auditorState.form[field] = value;
  highlightChoiceButtons();
}

function highlightChoiceButtons() {
  document.querySelectorAll('[data-field]').forEach((group) => {
    const field = group.dataset.field;
    group.querySelectorAll('[data-value]').forEach((button) => {
      button.classList.toggle('is-active', auditorState.form[field] === button.dataset.value);
    });
  });
  document.getElementById('judge-notes').value = auditorState.form.notes || '';
}

function hydrateFormFromSaved() {
  const saved = getJudgmentForCase(auditorState.selectedId);
  auditorState.form = saved
    ? { A: saved.A, B: saved.B, C: saved.C, D: saved.D, notes: saved.notes || '' }
    : { A: '', B: '', C: '', D: '', notes: '' };
}

function resetForm() {
  auditorState.form = { A: '', B: '', C: '', D: '', notes: '' };
  auditorState.lastSavedCaseId = null;
  highlightChoiceButtons();
  renderComparison();
}

function validateJudgmentForm() {
  if (!auditorState.reviewer?.name) return 'Primero registra el auditor local.';
  if (!auditorState.selectedId) return 'No hay caso seleccionado.';
  if (!auditorState.form.A || !auditorState.form.B || !auditorState.form.C || !auditorState.form.D) {
    return 'Completa A, B, C y D antes de guardar.';
  }
  return '';
}

function saveCurrentJudgment() {
  const error = validateJudgmentForm();
  const status = document.getElementById('save-status');
  if (error) {
    status.textContent = error;
    return false;
  }
  const record = recordById(auditorState.selectedId);
  const now = new Date().toISOString();
  const key = reviewerKey();
  const payload = {
    reviewer_key: key,
    reviewer_name: auditorState.reviewer.name,
    reviewer_affiliation: auditorState.reviewer.affiliation || '',
    pdf_id: record.pdf_id,
    pdf_nombre: record.pdf_nombre,
    case_label: record.case_label,
    A: auditorState.form.A,
    B: auditorState.form.B,
    C: auditorState.form.C,
    D: auditorState.form.D,
    notes: document.getElementById('judge-notes').value.trim(),
    updated_at: now,
  };
  const existingIndex = auditorState.judgments.findIndex((item) => item.reviewer_key === key && Number(item.pdf_id) === Number(record.pdf_id));
  if (existingIndex >= 0) auditorState.judgments.splice(existingIndex, 1, payload);
  else auditorState.judgments.push(payload);
  saveJudgments();
  auditorState.form.notes = payload.notes;
  auditorState.lastSavedCaseId = record.pdf_id;
  status.textContent = `Guardado local: ${record.case_label || `#${record.pdf_id}`} · ${new Date(now).toLocaleString('es-PY')}`;
  renderAll();
  return true;
}

function nextPendingRecord() {
  const mine = new Set(getCurrentReviewerJudgments().map((item) => Number(item.pdf_id)));
  return auditorState.records.find((record) => !mine.has(Number(record.pdf_id))) || auditorState.records[0] || null;
}

function randomRecord() {
  const queue = filteredQueue();
  if (!queue.length) return null;
  if (queue.length === 1) return queue[0];
  let next = queue[Math.floor(Math.random() * queue.length)];
  while (Number(next.pdf_id) === Number(auditorState.selectedId)) {
    next = queue[Math.floor(Math.random() * queue.length)];
  }
  return next;
}

function renderComparison() {
  const container = document.getElementById('post-save-compare');
  const body = document.getElementById('compare-body');
  const badges = document.getElementById('compare-badges');
  const comment = document.getElementById('compare-comment');
  const record = recordById(auditorState.selectedId);
  if (!record) {
    container.hidden = true;
    return;
  }
  const judgment = getJudgmentForCase(record.pdf_id);
  if (!judgment || auditorState.lastSavedCaseId !== record.pdf_id) {
    container.hidden = true;
    return;
  }

  const rows = [
    ['A', judgment.A, record.referencia.A, record.ia.A],
    ['B', judgment.B, record.referencia.B, record.ia.B],
    ['C', judgment.C, record.referencia.C, record.ia.C],
    ['D', judgment.D, record.referencia.veredicto_ac || '—', record.ia.veredicto || '—'],
  ];
  body.innerHTML = rows.map(([name, mine, reference, ia]) => `
    <tr>
      <td>${name}</td>
      <td class="right">${mine ?? '—'}</td>
      <td class="right">${reference ?? '—'}</td>
      <td class="right">${ia ?? '—'}</td>
    </tr>
  `).join('');

  const matchesReference = String(judgment.D) === String(record.referencia.veredicto_ac || '');
  const matchesIa = String(judgment.D) === String(record.ia.veredicto || '');
  badges.innerHTML = [
    badge(`Tu D: ${judgment.D}`, verdictTone(judgment.D)),
    badge(`Referencia: ${record.referencia.veredicto_ac || 'sin carga'}`, verdictTone(record.referencia.veredicto_ac)),
    badge(`IA: ${record.ia.veredicto || '—'}`, verdictTone(record.ia.veredicto)),
    badge(matchesReference ? 'Coincide con referencia' : 'Difiere de referencia', matchesReference ? 'success' : 'warning'),
    badge(matchesIa ? 'Coincide con IA' : 'Difiere de IA', matchesIa ? 'success' : 'warning'),
  ].join('');
  comment.textContent = record.referencia.comentario || record.referencia.evidencia_inferencia || '';
  container.hidden = false;
}

function exportJudgmentsCsv() {
  const mine = getCurrentReviewerJudgments();
  if (!mine.length) {
    document.getElementById('save-status').textContent = 'No hay guardados locales para exportar.';
    return;
  }
  const headers = ['reviewer_name', 'reviewer_affiliation', 'pdf_id', 'case_label', 'pdf_nombre', 'A', 'B', 'C', 'D', 'notes', 'updated_at'];
  const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    headers.join(','),
    ...mine.map((item) => headers.map((header) => escapeCsv(item[header])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const nameSlug = (auditorState.reviewer?.name || 'auditor').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const link = document.createElement('a');
  link.href = url;
  link.download = `ensayos_referencia_${nameSlug || 'auditor'}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderAll() {
  renderHeroStats();
  renderSummaryCards();
  renderQueue();
  renderCase();
  renderSavedList();
  highlightChoiceButtons();
  renderComparison();
  syncStaticLinks();
}

function bindEvents() {
  renderReviewerForm();

  document.getElementById('queue-search').addEventListener('input', (event) => {
    auditorState.query = event.target.value || '';
    renderQueue();
  });

  document.querySelectorAll('[data-field] [data-value]').forEach((button) => {
    button.addEventListener('click', () => setChoice(button.closest('[data-field]').dataset.field, button.dataset.value));
  });

  document.getElementById('judge-notes').addEventListener('input', (event) => {
    auditorState.form.notes = event.target.value;
  });

  document.getElementById('save-judgment').addEventListener('click', () => {
    saveCurrentJudgment();
  });

  document.getElementById('next-after-save').addEventListener('click', () => {
    if (!saveCurrentJudgment()) return;
    const next = nextPendingRecord();
    if (!next) return;
    auditorState.selectedId = next.pdf_id;
    hydrateFormFromSaved();
    renderAll();
  });

  document.getElementById('reset-judgment').addEventListener('click', () => {
    resetForm();
  });

  document.getElementById('pick-next').addEventListener('click', () => {
    const next = nextPendingRecord();
    if (!next) return;
    auditorState.selectedId = next.pdf_id;
    hydrateFormFromSaved();
    renderAll();
  });

  document.getElementById('pick-random').addEventListener('click', () => {
    const next = randomRecord();
    if (!next) return;
    auditorState.selectedId = next.pdf_id;
    hydrateFormFromSaved();
    renderAll();
  });

  ['export-csv-top', 'export-csv-side'].forEach((id) => {
    document.getElementById(id).addEventListener('click', exportJudgmentsCsv);
  });

  document.querySelectorAll('.viewer-size').forEach((button) => {
    button.addEventListener('click', () => {
      auditorState.viewerSize = button.dataset.size || 'medium';
      document.querySelectorAll('.viewer-size').forEach((item) => item.classList.toggle('is-active', item === button));
      syncViewerHeight();
    });
  });
}

async function bootAuditor() {
  syncViewerHeight();
  bindEvents();
  syncStaticLinks();
  await loadData();
  chooseDefaultCase();
  hydrateFormFromSaved();
  renderAll();
}

bootAuditor().catch((error) => {
  const shell = document.querySelector('.shell');
  if (shell) {
    shell.innerHTML = `<div class="placeholder">No se pudo abrir el panel auditor: ${error.message}</div>`;
  }
});
