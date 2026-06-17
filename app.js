const state = {
  data: null,
  filtered: [],
  selectedId: null,
  query: '',
  country: 'ALL',
  area: 'ALL',
  verdict: 'ALL',
  availability: 'ALL',
  viewerSize: 'medium',
};

const VIEWER_HEIGHTS = {
  compact: '620px',
  medium: '860px',
  large: '1120px',
};

function centralAuditorUrl(record = null) {
  const raw = window.SITE_CONFIG?.centralAuditorUrl || '';
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (record?.pdf_id) url.searchParams.set('pdf_id', String(record.pdf_id));
    url.searchParams.set('source', 'pages');
    return url.toString();
  } catch (error) {
    return raw;
  }
}

function auditorTrialUrl(record = null) {
  const url = new URL('auditor.html', window.location.href);
  if (record?.pdf_id) url.searchParams.set('case', String(record.pdf_id));
  return url.toString();
}

async function loadData() {
  const res = await fetch('public_data/auditables_346.json');
  if (!res.ok) throw new Error(`No se pudo cargar el catalogo: ${res.status}`);
  state.data = await res.json();
  state.data.records = shuffleRecords(state.data.records.slice(), getSessionSeed());
  state.filtered = state.data.records.slice();
  const requested = Number(new URLSearchParams(window.location.search).get('case') || '');
  if (requested && state.filtered.some((record) => Number(record.pdf_id) === requested)) {
    state.selectedId = requested;
  } else if (state.filtered.length) state.selectedId = state.filtered[0].pdf_id;
}

function getSessionSeed() {
  const key = 'catalog_random_seed_v1';
  const cached = sessionStorage.getItem(key);
  if (cached) return Number(cached);
  const seed = Math.floor(Math.random() * 2147483647) || 1;
  sessionStorage.setItem(key, String(seed));
  return seed;
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

function uniqueValues(key) {
  return [...new Set(state.data.records.map((r) => r[key]).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), 'es')
  );
}

function buildSelectOptions(select, values, allLabel) {
  select.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'ALL';
  allOpt.textContent = allLabel;
  select.appendChild(allOpt);
  for (const value of values) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
}

function applyFilters() {
  const query = state.query.trim().toLowerCase();
  state.filtered = state.data.records.filter((record) => {
    const haystack = String(record.search_text || '').toLowerCase();
    const matchQuery = !query || haystack.includes(query);
    const matchCountry = state.country === 'ALL' || record.pais === state.country;
    const matchArea = state.area === 'ALL' || record.macroarea === state.area;
    const matchVerdict =
      state.verdict === 'ALL' ||
      record.ia.veredicto === state.verdict ||
      record.referencia.veredicto_ac === state.verdict;
    const matchAvailability =
      state.availability === 'ALL' ||
      (state.availability === 'AVAILABLE' && record.pdf_available) ||
      (state.availability === 'MISSING' && !record.pdf_available);
    return matchQuery && matchCountry && matchArea && matchVerdict && matchAvailability;
  });

  if (!state.filtered.some((r) => r.pdf_id === state.selectedId)) {
    state.selectedId = state.filtered.length ? state.filtered[0].pdf_id : null;
  }
}

function hasActiveFilters() {
  return (
    Boolean(state.query.trim()) ||
    state.country !== 'ALL' ||
    state.area !== 'ALL' ||
    state.verdict !== 'ALL' ||
    state.availability !== 'ALL'
  );
}

function renderActiveFilters() {
  const target = document.getElementById('active-filters');
  if (!target) return;

  const parts = [];
  if (state.query.trim()) parts.push(`busqueda: ${state.query.trim()}`);
  if (state.country !== 'ALL') parts.push(`pais: ${state.country}`);
  if (state.area !== 'ALL') parts.push(`macroarea: ${state.area}`);
  if (state.verdict !== 'ALL') parts.push(`veredicto: ${state.verdict}`);
  if (state.availability !== 'ALL') {
    parts.push(state.availability === 'AVAILABLE' ? 'solo PDF disponible' : 'solo PDF pendiente');
  }

  target.textContent = parts.length ? `Filtros activos: ${parts.join(' | ')}` : 'Sin filtros activos.';
}

function syncViewerHeight() {
  document.documentElement.style.setProperty('--viewer-height', VIEWER_HEIGHTS[state.viewerSize] || VIEWER_HEIGHTS.medium);
}

function statCard(label, value, hint = '') {
  return `
    <div class="stat-card">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
      ${hint ? `<div class="stat-hint">${hint}</div>` : ''}
    </div>
  `;
}

function renderStats() {
  const meta = state.data.meta;
  const referenceMetrics = state.data.stats.reference_metrics || {};
  document.getElementById('stats-grid').innerHTML = [
    statCard('Casos auditables', meta.record_count),
    statCard('PDF disponibles', meta.pdf_available_count),
    statCard('PDF faltantes', meta.missing_pdfs.length),
    statCard(
      'Muestreo no probabilistico referencia',
      referenceMetrics.a_no_prob?.n ?? '—',
      referenceMetrics.a_no_prob ? `${String(referenceMetrics.a_no_prob.pct_corpus).replace('.', ',')} % del corpus` : ''
    ),
    statCard(
      'EINR A∩C referencia',
      referenceMetrics.ac_einr?.n ?? '—',
      referenceMetrics.ac_einr
        ? `${String(referenceMetrics.ac_einr.pct_corpus).replace('.', ',')} % del corpus | ${String(referenceMetrics.ac_einr.pct_a_subset).replace('.', ',')} % entre A=Si`
        : ''
    ),
    statCard(
      'A∩C sin reconocimiento',
      referenceMetrics.ac_sin_reconocimiento?.n ?? '—',
      referenceMetrics.ac_sin_reconocimiento
        ? `${String(referenceMetrics.ac_sin_reconocimiento.pct_a_subset).replace('.', ',')} % entre A=Si`
        : ''
    ),
    statCard(
      'A∩B∩C con reconocimiento',
      referenceMetrics.abc_con_reconocimiento?.n ?? '—',
      referenceMetrics.abc_con_reconocimiento
        ? `${String(referenceMetrics.abc_con_reconocimiento.pct_a_subset).replace('.', ',')} % entre A=Si`
        : ''
    ),
  ].join('');
}

function pct(value) {
  if (value === '' || value == null) return '—';
  return `${(Number(value) * 100).toFixed(1)} %`;
}

function num(value) {
  if (value === '' || value == null) return '—';
  return Number(value).toFixed(3);
}

function badge(label, tone = 'neutral') {
  return `<span class="badge badge-${tone}">${label || '—'}</span>`;
}

function verdictTone(value) {
  if (!value) return 'neutral';
  const low = value.toLowerCase();
  if (low.includes('ff')) return 'danger';
  if (low.includes('falla fuerte')) return 'danger';
  if (low.includes('debilidad')) return 'warning';
  if (low.includes('sin falla')) return 'success';
  if (low.includes('no falla')) return 'success';
  if (low.includes('no evaluable')) return 'muted';
  return 'neutral';
}

function renderList() {
  const target = document.getElementById('results-list');
  const empty = document.getElementById('empty-state');
  target.innerHTML = '';
  document.getElementById('result-count').textContent = `${state.filtered.length} casos`;

  if (!state.filtered.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const record of state.filtered) {
    const btn = document.createElement('button');
    btn.className = `result-item ${record.pdf_id === state.selectedId ? 'is-active' : ''}`;
    btn.type = 'button';
    btn.innerHTML = `
      <div class="result-top">
        <span class="result-id">${record.case_label || `#${record.pdf_id}`}</span>
        ${badge(record.ia.veredicto, verdictTone(record.ia.veredicto))}
      </div>
      <div class="result-title">${record.titulo}</div>
      <div class="result-meta">${record.revista} · ${record.pais} · ${record.anio ?? 's/f'}</div>
      <div class="result-meta">${record.macroarea}</div>
      <div class="result-pdf">${record.pdf_available ? 'PDF publico disponible' : 'PDF no disponible aun'}</div>
    `;
    btn.addEventListener('click', () => {
      state.selectedId = record.pdf_id;
      renderList();
      renderDetail();
    });
    target.appendChild(btn);
  }
}

function metricRow(name, human, ia) {
  return `
    <tr>
      <td>${name}</td>
      <td class="right">${human ?? '—'}</td>
      <td class="right">${ia ?? '—'}</td>
    </tr>
  `;
}

function currentFilteredIndex() {
  return state.filtered.findIndex((record) => record.pdf_id === state.selectedId);
}

function selectRelative(delta) {
  if (!state.filtered.length) return;
  const current = currentFilteredIndex();
  const start = current === -1 ? 0 : current;
  const nextIndex = (start + delta + state.filtered.length) % state.filtered.length;
  state.selectedId = state.filtered[nextIndex].pdf_id;
  renderList();
  renderDetail();
}

function selectRandomRecord() {
  if (!state.filtered.length) return;
  const current = currentFilteredIndex();
  if (state.filtered.length === 1) {
    state.selectedId = state.filtered[0].pdf_id;
  } else {
    let nextIndex = current;
    while (nextIndex === current) {
      nextIndex = Math.floor(Math.random() * state.filtered.length);
    }
    state.selectedId = state.filtered[nextIndex].pdf_id;
  }
  renderList();
  renderDetail();
}

function renderDetail() {
  const record = state.data.records.find((r) => r.pdf_id === state.selectedId);
  const panel = document.getElementById('detail-panel');
  if (!record) {
    panel.innerHTML = '<div class="placeholder">Selecciona un caso para ver sus detalles.</div>';
    return;
  }

  const referenceA = record.referencia.A == null ? '—' : String(record.referencia.A);
  const referenceB = record.referencia.B == null ? '—' : String(record.referencia.B);
  const referenceC = record.referencia.C == null ? '—' : String(record.referencia.C);

  panel.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="eyebrow">${record.case_label || `pdf_id ${record.pdf_id}`}</div>
        <h2>${record.titulo}</h2>
        <p class="detail-meta">${record.revista} · ${record.pais} · ${record.macroarea} · ${record.anio ?? 's/f'}</p>
      </div>
      <div class="detail-actions">
        <button class="btn btn-secondary nav-case" type="button" data-nav="prev">Caso anterior</button>
        <button class="btn btn-secondary nav-case" type="button" data-nav="random">Otro caso</button>
        <button class="btn btn-secondary nav-case" type="button" data-nav="next">Siguiente caso</button>
        <a class="btn btn-secondary" href="${auditorTrialUrl(record)}">Ensayar este caso</a>
        <a class="btn btn-secondary" href="${centralAuditorUrl(record) || '#'}" target="_blank" rel="noopener">Auditar con guardado</a>
        ${
          record.pdf_available
            ? `<a class="btn" href="${record.pdf_public_path}" target="_blank" rel="noopener">Abrir PDF</a>
               <a class="btn btn-secondary" href="${record.pdf_public_path}" download>Descargar</a>`
            : `<span class="missing-note">PDF no disponible aun</span>`
        }
      </div>
    </div>

    <div class="detail-grid">
      <section class="detail-card">
        <h3>Veredictos</h3>
        <div class="badge-row">
          ${badge(`IA: ${record.ia.veredicto || '—'}`, verdictTone(record.ia.veredicto))}
          ${badge(`Referencia: ${record.referencia.veredicto_ac || 'sin carga'}`, verdictTone(record.referencia.veredicto_ac))}
        </div>
        <table class="mini-table">
          <thead><tr><th>Dimension</th><th class="right">Referencia</th><th class="right">IA</th></tr></thead>
          <tbody>
            ${metricRow('A · muestreo no probabilistico', referenceA, record.ia.A)}
            ${metricRow('B · advierte limites', referenceB, record.ia.B)}
            ${metricRow('C · extrapola / infiere', referenceC, record.ia.C)}
          </tbody>
        </table>
      </section>

      <section class="detail-card">
        <h3>Evidencia y trazabilidad</h3>
        <dl class="detail-list">
          <dt>PDF publico</dt><dd>${record.pdf_nombre || '—'}</dd>
          <dt>Anonimizado</dt><dd>${record.pdf_is_anonymized ? 'Si' : 'No'}</dd>
          <dt>Estrategia</dt><dd>${record.anonymization?.strategy || '—'}</dd>
          <dt>Fuente de contraste</dt><dd>Codificacion de referencia</dd>
          <dt>Fecha de revision</dt><dd>${record.referencia.fecha_revision || '—'}</dd>
          <dt>Pagina o seccion</dt><dd>${record.referencia.pagina_o_seccion || '—'}</dd>
          <dt>Acuerdo IA vs referencia</dt><dd>${record.referencia.acuerdo_ia_referencia_ac || '—'}</dd>
          <dt>Tipo de discrepancia</dt><dd>${record.referencia.tipo_discrepancia || '—'}</dd>
          <dt>Accion recomendada</dt><dd>${record.referencia.accion_recomendada || '—'}</dd>
        </dl>
      </section>

      <section class="detail-card detail-card-wide">
        <h3>Notas de codificacion de referencia</h3>
        <div class="text-block"><strong>Muestreo:</strong> ${record.referencia.evidencia_muestreo || '—'}</div>
        <div class="text-block"><strong>Inferencia:</strong> ${record.referencia.evidencia_inferencia || '—'}</div>
        <div class="text-block"><strong>Extrapolacion:</strong> ${record.referencia.evidencia_extrapolacion || '—'}</div>
        <div class="text-block"><strong>Comentario:</strong> ${record.referencia.comentario || '—'}</div>
      </section>
    </div>

    <section class="viewer-card">
      <div class="viewer-head">
        <div>
          <h3>Visor del PDF auditado</h3>
          <div class="viewer-path">${record.pdf_nombre}</div>
        </div>
        <div class="viewer-tools">
          <div class="segmented" aria-label="Tamano del visor PDF">
            <button type="button" class="viewer-size ${state.viewerSize === 'compact' ? 'is-active' : ''}" data-size="compact">Compacto</button>
            <button type="button" class="viewer-size ${state.viewerSize === 'medium' ? 'is-active' : ''}" data-size="medium">Medio</button>
            <button type="button" class="viewer-size ${state.viewerSize === 'large' ? 'is-active' : ''}" data-size="large">Grande</button>
          </div>
        </div>
      </div>
      ${
        record.pdf_available
          ? `<iframe class="pdf-frame" src="${record.pdf_public_path}#view=FitH" title="${record.pdf_nombre}"></iframe>`
          : `<div class="placeholder">Este caso no tiene aun un PDF publico en el sitio. El registro y el veredicto siguen visibles para trazabilidad.</div>`
      }
    </section>
  `;

  for (const btn of panel.querySelectorAll('.viewer-size')) {
    btn.addEventListener('click', () => {
      state.viewerSize = btn.dataset.size || 'medium';
      syncViewerHeight();
      renderDetail();
    });
  }
  for (const btn of panel.querySelectorAll('.nav-case')) {
    btn.addEventListener('click', () => {
      const action = btn.dataset.nav;
      if (action === 'prev') selectRelative(-1);
      else if (action === 'next') selectRelative(1);
      else selectRandomRecord();
    });
  }
}

function resetAllFilters() {
  const search = document.getElementById('search');
  const country = document.getElementById('filter-country');
  const area = document.getElementById('filter-area');
  const verdict = document.getElementById('filter-verdict');
  const availability = document.getElementById('filter-availability');

  state.query = '';
  state.country = 'ALL';
  state.area = 'ALL';
  state.verdict = 'ALL';
  state.availability = 'ALL';

  search.value = '';
  country.value = 'ALL';
  area.value = 'ALL';
  verdict.value = 'ALL';
  availability.value = 'ALL';

  applyFilters();
  renderActiveFilters();
  renderList();
  renderDetail();
}

function bindControls() {
  const search = document.getElementById('search');
  const country = document.getElementById('filter-country');
  const area = document.getElementById('filter-area');
  const verdict = document.getElementById('filter-verdict');
  const availability = document.getElementById('filter-availability');

  buildSelectOptions(country, uniqueValues('pais'), 'Todos los paises');
  buildSelectOptions(area, uniqueValues('macroarea'), 'Todas las macroareas');
  buildSelectOptions(
    verdict,
    [...new Set(state.data.records.map((r) => [r.ia.veredicto, r.referencia.veredicto_ac]).flat().filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), 'es')
    ),
    'Todos los veredictos'
  );

  search.addEventListener('input', (e) => {
    state.query = e.target.value;
    applyFilters();
    renderActiveFilters();
    renderList();
    renderDetail();
  });
  country.addEventListener('change', (e) => {
    state.country = e.target.value;
    applyFilters();
    renderActiveFilters();
    renderList();
    renderDetail();
  });
  area.addEventListener('change', (e) => {
    state.area = e.target.value;
    applyFilters();
    renderActiveFilters();
    renderList();
    renderDetail();
  });
  verdict.addEventListener('change', (e) => {
    state.verdict = e.target.value;
    applyFilters();
    renderActiveFilters();
    renderList();
    renderDetail();
  });
  availability.addEventListener('change', (e) => {
    state.availability = e.target.value;
    applyFilters();
    renderActiveFilters();
    renderList();
    renderDetail();
  });

  document.getElementById('reset-filters').addEventListener('click', resetAllFilters);
  const topReset = document.getElementById('reset-filters-top');
  if (topReset) topReset.addEventListener('click', resetAllFilters);
}

function syncStaticLinks() {
  const link = document.getElementById('central-auditor-link');
  if (!link) return;
  const href = centralAuditorUrl();
  if (href) link.href = href;
}

function renderHeaderMeta() {
  document.getElementById('catalog-size').textContent = `${state.data.meta.record_count} casos auditables`;
  document.getElementById('pdf-size').textContent = `${state.data.meta.pdf_available_count} PDF publicos`;
  document.getElementById('missing-size').textContent = `${state.data.meta.missing_pdfs.length} faltantes`;
}

async function boot() {
  try {
    await loadData();
    syncStaticLinks();
    syncViewerHeight();
    renderHeaderMeta();
    renderStats();
    bindControls();
    applyFilters();
    renderActiveFilters();
    renderList();
    renderDetail();
    document.body.dataset.ready = 'true';
  } catch (err) {
    document.getElementById('boot-error').hidden = false;
    document.getElementById('boot-error').textContent = String(err.message || err);
  }
}

boot();
