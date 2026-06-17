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

async function loadData() {
  const res = await fetch('public_data/auditables_346.json');
  if (!res.ok) throw new Error(`No se pudo cargar el catalogo: ${res.status}`);
  state.data = await res.json();
  state.filtered = state.data.records.slice();
  if (state.filtered.length) state.selectedId = state.filtered[0].pdf_id;
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
      record.humano.veredicto_ac === state.verdict;
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
  const counts = state.data.stats.ia_verdict_counts;
  document.getElementById('stats-grid').innerHTML = [
    statCard('Casos auditables', meta.record_count),
    statCard('PDF disponibles', meta.pdf_available_count),
    statCard('PDF faltantes', meta.missing_pdfs.length),
    statCard('FF clásica IA', counts['FF clasica'] || 0),
    statCard('FF con reconocimiento IA', counts['FF con reconocimiento'] || 0),
    statCard('Sin falla relevante IA', counts['Sin falla relevante'] || 0),
  ].join('');

  const summaryTarget = document.getElementById('summary-table-body');
  summaryTarget.innerHTML = '';
  for (const row of state.data.stats.summary_rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.humano}</td>
      <td>${row.ia}</td>
      <td class="right">${row.n}</td>
      <td class="right">${pct(row.acuerdoD)}</td>
      <td class="right">${num(row.kappaD)}</td>
    `;
    summaryTarget.appendChild(tr);
  }
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
  if (low.includes('debilidad')) return 'warning';
  if (low.includes('sin falla')) return 'success';
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

function renderDetail() {
  const record = state.data.records.find((r) => r.pdf_id === state.selectedId);
  const panel = document.getElementById('detail-panel');
  if (!record) {
    panel.innerHTML = '<div class="placeholder">Selecciona un caso para ver sus detalles.</div>';
    return;
  }

  const humanA = record.humano.A == null ? '—' : String(record.humano.A);
  const humanB = record.humano.B == null ? '—' : String(record.humano.B);
  const humanC = record.humano.C == null ? '—' : String(record.humano.C);

  panel.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="eyebrow">${record.case_label || `pdf_id ${record.pdf_id}`}</div>
        <h2>${record.titulo}</h2>
        <p class="detail-meta">${record.revista} · ${record.pais} · ${record.macroarea} · ${record.anio ?? 's/f'}</p>
      </div>
      <div class="detail-actions">
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
          ${badge(`Humano: ${record.humano.veredicto_ac || 'sin carga'}`, verdictTone(record.humano.veredicto_ac))}
        </div>
        <table class="mini-table">
          <thead><tr><th>Dimension</th><th class="right">Humano</th><th class="right">IA</th></tr></thead>
          <tbody>
            ${metricRow('A · muestreo no probabilistico', humanA, record.ia.A)}
            ${metricRow('B · advierte limites', humanB, record.ia.B)}
            ${metricRow('C · extrapola / infiere', humanC, record.ia.C)}
          </tbody>
        </table>
      </section>

      <section class="detail-card">
        <h3>Evidencia y trazabilidad</h3>
        <dl class="detail-list">
          <dt>PDF publico</dt><dd>${record.pdf_nombre || '—'}</dd>
          <dt>Anonimizado</dt><dd>${record.pdf_is_anonymized ? 'Si' : 'No'}</dd>
          <dt>Estrategia</dt><dd>${record.anonymization?.strategy || '—'}</dd>
          <dt>Revisor</dt><dd>${record.humano.revisor || '—'}</dd>
          <dt>Fecha revision</dt><dd>${record.humano.fecha_revision || '—'}</dd>
          <dt>Pagina o seccion</dt><dd>${record.humano.pagina_o_seccion || '—'}</dd>
          <dt>Acuerdo IA vs humano</dt><dd>${record.humano.acuerdo_ia_humano_ac || '—'}</dd>
          <dt>Tipo de discrepancia</dt><dd>${record.humano.tipo_discrepancia || '—'}</dd>
          <dt>Accion recomendada</dt><dd>${record.humano.accion_recomendada || '—'}</dd>
        </dl>
      </section>

      <section class="detail-card detail-card-wide">
        <h3>Notas de codificacion humana</h3>
        <div class="text-block"><strong>Muestreo:</strong> ${record.humano.evidencia_muestreo || '—'}</div>
        <div class="text-block"><strong>Inferencia:</strong> ${record.humano.evidencia_inferencia || '—'}</div>
        <div class="text-block"><strong>Extrapolacion:</strong> ${record.humano.evidencia_extrapolacion || '—'}</div>
        <div class="text-block"><strong>Comentario:</strong> ${record.humano.comentario || '—'}</div>
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
    [...new Set(state.data.records.map((r) => [r.ia.veredicto, r.humano.veredicto_ac]).flat().filter(Boolean))].sort((a, b) =>
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

function renderHeaderMeta() {
  document.getElementById('catalog-size').textContent = `${state.data.meta.record_count} casos auditables`;
  document.getElementById('pdf-size').textContent = `${state.data.meta.pdf_available_count} PDF publicos`;
  document.getElementById('missing-size').textContent = `${state.data.meta.missing_pdfs.length} faltantes`;
}

async function boot() {
  try {
    await loadData();
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
