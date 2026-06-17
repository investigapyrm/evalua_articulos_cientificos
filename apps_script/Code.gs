/**
 * evalua_articulos_cientificos — backend Apps Script
 *
 * Flujo doble ciego, multi-revisor:
 * 1. La app pide al revisor que se identifique con un nombre (persistido en localStorage).
 * 2. Muestra un PDF auditable sin revelar la calificación IA.
 * 3. El humano califica A, B, C y un veredicto integral (D), incluyendo "No evaluable".
 * 4. Tras submit, se muestra el contraste con la IA y se guarda con el nombre del revisor.
 * 5. El mismo PDF puede ser calificado por múltiples revisores; el dashboard
 *    contrasta IA vs humanos (todos), y entre humanos (kappa pairwise).
 */

// ───────────────────── CONFIG ─────────────────────────────────────────────
const FOLDER_ID  = '';
const SHEET_ID   = '';
const CSV_URL    = 'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/articulos_auditables_346.csv';

const HOJA_AUDITABLES     = 'auditables';
const HOJA_CALIFICACIONES = 'calificaciones';
const HOJA_COMPARACION    = 'comparacion';

// Columnas de la hoja calificaciones (orden fijo)
const COLS_CAL = ['timestamp', 'pdf_id', 'pdf_nombre',
                  'A_humano', 'B_humano', 'C_humano', 'D_humano',
                  'notas', 'A_ia', 'B_ia', 'C_ia', 'veredicto_ia',
                  'revisor'];

// Categorías válidas para D (incluye "No evaluable" para casos donde el humano
// determina que el PDF no debió haber sido auditado)
const CATEGORIAS_D = [
  'FF clasica',
  'FF con reconocimiento',
  'Debilidad importante',
  'Sin falla relevante',
  'No evaluable'
];

// ───────────────────── ENTRYPOINT WEB ─────────────────────────────────────
function doGet(e) {
  // Endpoint admin: solo accesible con token compartido entre el codigo
  // del proyecto y el llamador (yo, el agente). Permite ejecutar funciones
  // de mantenimiento via HTTP sin abrir el editor. Token rotable.
  if (e && e.parameter && e.parameter.action === 'admin') {
    return _adminEndpoint(e.parameter);
  }
  const page = (e && e.parameter && e.parameter.page) || 'index';
  const tpl = HtmlService.createTemplateFromFile(page === 'stats' ? 'DashboardStats' : 'Index');
  return tpl.evaluate()
    .setTitle('Califica artículos inferenciales')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

const ADMIN_TOKEN = 'cai_admin_x9k2pq_2026';

function _adminEndpoint(p) {
  if (p.token !== ADMIN_TOKEN) {
    return ContentService.createTextOutput(JSON.stringify({error:'token invalido'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const out = {};
  try {
    if (p.fn === 'unificar') {
      unificar_revisor(p.revisor || 'DIEGO MEZA');
      out.ok = true; out.fn = 'unificar';
    } else if (p.fn === 'importar_pilotos') {
      importar_pilotos_claude_y_gemini2();
      out.ok = true; out.fn = 'importar_pilotos';
    } else if (p.fn === 'setup_completo') {
      unificar_revisor(p.revisor || 'DIEGO MEZA');
      importar_pilotos_claude_y_gemini2();
      out.ok = true; out.fn = 'setup_completo';
    } else if (p.fn === 'comparacion_humano_ia') {
      const r = comparar_humanos_con_ias_guardadas();
      Object.keys(r).forEach(k => out[k] = r[k]);
    } else if (p.fn === 'tasas_guardadas') {
      const r = calcular_tasas_guardadas();
      Object.keys(r).forEach(k => out[k] = r[k]);
    } else if (p.fn === 'export_calificaciones') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      let cal = _leerHoja(ss, HOJA_CALIFICACIONES);
      if (p.revisor) {
        const target = String(p.revisor).trim();
        cal = cal.filter(r => String(r.revisor || '').trim() === target);
      }
      out.total = cal.length;
      out.filas = cal;
    } else if (p.fn === 'diagnostico') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const cal = _leerHoja(ss, HOJA_CALIFICACIONES);
      const revisores = {};
      cal.forEach(r => { const v = String(r.revisor||'(vacio)'); revisores[v] = (revisores[v]||0)+1; });
      out.total = cal.length; out.por_revisor = revisores;
      const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
      out.header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      out.lastRow = sh.getLastRow();
      out.lastCol = sh.getLastColumn();
      const ult5 = sh.getRange(Math.max(2, sh.getLastRow()-4), 1, 5, sh.getLastColumn()).getValues();
      out.ultimas5_filas = ult5;
    } else if (p.fn === 'fix_revisor') {
      // Repara revisor vacio en filas de claude/gemini_v2 segun pdf_nombre
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const idxRev = head.indexOf('revisor');
      const idxNotas = head.indexOf('notas');
      const idxD = head.indexOf('D_humano');
      const lastRow = sh.getLastRow();
      const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
      let cambios = 0;
      // Heuristica: si revisor esta vacio, mirar las notas para distinguir claude vs gemini
      // Las notas de claude empiezan con "Estudio" o "..." y son largas. Gemini son cortas tipicamente.
      // Mejor: re-importar las dos bases pero borrando primero las filas con revisor vacio.
      out.error = 'fix_revisor desactivado por seguridad. Use clean_imports y reimporte.';
    } else if (p.fn === 'fix_estructura') {
      // Elimina la columna 13 (la "vacia") para corregir el desalineo causado
      // por una migracion previa. Las filas existentes pierden el separador,
      // y el revisor pasa de columna 14 a 13.
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const idxVacio = head.indexOf('');
      if (idxVacio < 0) { out.info = 'no hay columna vacia'; }
      else {
        sh.deleteColumn(idxVacio + 1); // 1-indexed
        out.borrada = idxVacio + 1;
        out.head_nuevo = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      }
    } else if (p.fn === 'clean_imports') {
      // Borra filas con revisor vacio en la hoja calificaciones
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const idxRev = head.indexOf('revisor');
      const lastRow = sh.getLastRow();
      const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
      const keep = vals.filter(row => String(row[idxRev] || '').trim() !== '');
      sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, sh.getLastColumn()).setValues(keep);
      out.borradas = vals.length - keep.length;
      out.quedan = keep.length;
    } else if (p.fn === 'clean_revisor') {
      // Borra filas de un revisor especifico (p.ej. claude) para reimportar limpio
      if (!p.revisor) { out.error = 'Falta parametro revisor'; }
      else {
        const target = String(p.revisor).trim();
        const ss = SpreadsheetApp.openById(SHEET_ID);
        const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
        const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
        const idxRev = head.indexOf('revisor');
        const lastRow = sh.getLastRow();
        const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
        const keep = vals.filter(row => String(row[idxRev] || '').trim() !== target);
        sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
        if (keep.length) sh.getRange(2, 1, keep.length, sh.getLastColumn()).setValues(keep);
        out.borradas = vals.length - keep.length;
        out.quedan = keep.length;
        out.revisor = target;
      }
    } else if (p.fn === 'importar_codex_gpt') {
      // Atomico: borra filas codex_gpt y reimporta CSV (nombre estable)
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const idxRev = head.indexOf('revisor');
      const lastRow = sh.getLastRow();
      const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
      const keep = vals.filter(row => String(row[idxRev] || '').trim() !== 'codex_gpt');
      sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, sh.getLastColumn()).setValues(keep);
      out.codex_borradas = vals.length - keep.length;
      const r = importarEvaluacionesIA(
        'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_codex_gpt.csv',
        'codex_gpt'
      );
      out.importadas = r.ok;
      out.saltadas = r.skipped;
    } else if (p.fn === 'importar_gemini_flash') {
      // Atomico: borra filas gemini_flash y reimporta CSV (nombre estable)
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const idxRev = head.indexOf('revisor');
      const lastRow = sh.getLastRow();
      const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
      const keep = vals.filter(row => String(row[idxRev] || '').trim() !== 'gemini_flash');
      sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, sh.getLastColumn()).setValues(keep);
      out.gemini_flash_borradas = vals.length - keep.length;
      const r = importarEvaluacionesIA(
        'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_gemini_flash.csv',
        'gemini_flash'
      );
      out.importadas = r.ok;
      out.saltadas = r.skipped;
    } else if (p.fn === 'importar_claude_haiku_346') {
      // Borra filas claude_haiku previas y reimporta el CSV de los 346
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const idxRev = head.indexOf('revisor');
      const lastRow = sh.getLastRow();
      const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
      const keep = vals.filter(row => String(row[idxRev] || '').trim() !== 'claude_haiku');
      sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, sh.getLastColumn()).setValues(keep);
      out.claude_haiku_borradas = vals.length - keep.length;
      const r = importarEvaluacionesIA(
        'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_claude_haiku_346.csv',
        'claude_haiku'
      );
      out.importadas = r.ok;
      out.saltadas = r.skipped;
    } else if (p.fn === 'importar_notebooklm') {
      // Borra filas notebooklm previas y reimporta el CSV normalizado de los 346
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const idxRev = head.indexOf('revisor');
      const lastRow = sh.getLastRow();
      const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
      const keep = vals.filter(row => String(row[idxRev] || '').trim() !== 'notebooklm');
      sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, sh.getLastColumn()).setValues(keep);
      out.notebooklm_borradas = vals.length - keep.length;
      const r = importarEvaluacionesIA(
        'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_notebooklm.csv',
        'notebooklm'
      );
      out.importadas = r.ok;
      out.saltadas = r.skipped;
    } else if (p.fn === 'importar_imputacion_diego_notebooklm') {
      // Escenario imputado: completa faltantes de DIEGO MEZA a partir de
      // NotebookLM, marcado en notas para no confundir con observaciones reales.
      out.imputadas_borradas = _borrarFilasImputadasDiegoNotebookLM_();
      const r = importarEvaluacionesIA(
        'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/imputacion_diego_meza_notebooklm_proporcional.csv',
        'DIEGO MEZA'
      );
      out.importadas = r.ok;
      out.saltadas = r.skipped;
    } else if (p.fn === 'importar_modelos_346') {
      // Atomico para la app web: refresca las revisiones IA externas
      // que se comparan en el dashboard.
      const modelos = [
        {
          revisor: 'codex_gpt',
          url: 'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_codex_gpt.csv'
        },
        {
          revisor: 'gemini_flash',
          url: 'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_gemini_flash.csv'
        },
        {
          revisor: 'claude_haiku',
          url: 'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_claude_haiku_346.csv'
        },
        {
          revisor: 'notebooklm',
          url: 'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_notebooklm.csv'
        }
      ];
      out.modelos = {};
      modelos.forEach(m => {
        const borradas = _borrarFilasRevisor_(m.revisor);
        const r = importarEvaluacionesIA(m.url, m.revisor);
        out.modelos[m.revisor] = {
          borradas: borradas,
          importadas: r.ok,
          saltadas: r.skipped
        };
      });
    } else if (p.fn === 'reimportar_claude') {
      // Atomico: borra filas claude existentes y reimporta el CSV corregido
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const idxRev = head.indexOf('revisor');
      const lastRow = sh.getLastRow();
      const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
      const keep = vals.filter(row => String(row[idxRev] || '').trim() !== 'claude');
      sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, sh.getLastColumn()).setValues(keep);
      out.claude_borradas = vals.length - keep.length;
      const r = importarEvaluacionesIA(
        'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_claude_piloto.csv',
        'claude'
      );
      out.importadas = r.ok;
      out.saltadas = r.skipped;
    } else {
      out.error = 'fn desconocida: ' + p.fn;
    }
  } catch (ex) {
    out.error = ex.message;
    out.stack = ex.stack;
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function importar_modelos_346() {
  const modelos = [
    {
      revisor: 'codex_gpt',
      url: 'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_codex_gpt.csv'
    },
    {
      revisor: 'gemini_flash',
      url: 'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_gemini_flash.csv'
    },
    {
      revisor: 'claude_haiku',
      url: 'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_claude_haiku_346.csv'
    },
    {
      revisor: 'notebooklm',
      url: 'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_notebooklm.csv'
    }
  ];
  const out = {};
  modelos.forEach(m => {
    const borradas = _borrarFilasRevisor_(m.revisor);
    const r = importarEvaluacionesIA(m.url, m.revisor);
    out[m.revisor] = {
      borradas: borradas,
      importadas: r.ok,
      saltadas: r.skipped
    };
  });
  actualizar_hoja_comparacion();
  return out;
}

// ───────────────────── SETUP / MIGRACIÓN ─────────────────────────────────
function setup_inicial() {
  const ss = SpreadsheetApp.create('evalua_articulos_cientificos - calificaciones');
  Logger.log('SHEET creado: ' + ss.getId() + ' (pega este ID en SHEET_ID)');

  const resp = UrlFetchApp.fetch(CSV_URL, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('No se pudo descargar el CSV: HTTP ' + resp.getResponseCode());
  }
  const data  = Utilities.parseCsv(resp.getContentText('UTF-8'));
  const hojaA = ss.getSheets()[0].setName(HOJA_AUDITABLES);
  hojaA.getRange(1, 1, data.length, data[0].length).setValues(data);
  hojaA.setFrozenRows(1);

  const hojaC = ss.insertSheet(HOJA_CALIFICACIONES);
  hojaC.getRange(1, 1, 1, COLS_CAL.length).setValues([COLS_CAL]);
  hojaC.setFrozenRows(1);

  ss.insertSheet(HOJA_COMPARACION);
  actualizar_hoja_comparacion();

  Logger.log('Auditables cargados: ' + (data.length - 1) + ' filas');
  Logger.log('Pegá el SHEET_ID arriba en Code.gs y volvé a publicar la web app.');
  return ss.getId();
}

/**
 * Migración: si la hoja calificaciones existente NO tiene la columna "revisor",
 * la agrega al final y rellena las filas existentes con "(anonimo)".
 * Idempotente: si ya está, no hace nada.
 */
function migrar_agregar_columna_revisor() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (head.indexOf('revisor') !== -1) {
    Logger.log('Ya existe columna revisor. Sin cambios.');
    return;
  }
  const newCol = head.length + 1;
  sh.getRange(1, newCol).setValue('revisor');
  const nFilas = sh.getLastRow() - 1;
  if (nFilas > 0) {
    const fill = Array(nFilas).fill(['(anonimo)']);
    sh.getRange(2, newCol, nFilas, 1).setValues(fill);
  }
  Logger.log('Columna revisor agregada. Filas migradas: ' + nFilas);
}

// ───────────────────── API SERVER → CLIENTE ──────────────────────────────
/**
 * Devuelve la lista completa de los 346 PDFs con metadatos cortos y
 * estado por revisor: si yo (revisor) ya lo califiqué y cuántos otros
 * lo evaluaron. NO incluye URL de Drive (se carga on-demand al elegir
 * un PDF) para mantener la lista liviana.
 */
function getListaPDFs(revisor) {
  if (!revisor || !String(revisor).trim()) {
    throw new Error('Falta nombre de revisor.');
  }
  revisor = String(revisor).trim();

  const ss = SpreadsheetApp.openById(SHEET_ID);

  // Lectura rápida de auditables: solo columnas necesarias
  const shA = ss.getSheetByName(HOJA_AUDITABLES);
  if (!shA) throw new Error('Hoja auditables no encontrada en el Sheet.');
  const lastRowA = shA.getLastRow();
  const lastColA = shA.getLastColumn();
  if (lastRowA < 2) {
    return { revisor: revisor, total: 0, calificados_por_mi: 0, items: [] };
  }
  const headA = shA.getRange(1, 1, 1, lastColA).getValues()[0];
  const idxA = {
    pdf_id:    headA.indexOf('pdf_id'),
    pdf_nombre: headA.indexOf('pdf_nombre'),
    revista:   headA.indexOf('revista'),
    pais:      headA.indexOf('pais'),
    macroarea: headA.indexOf('macroarea'),
    anio:      headA.indexOf('anio'),
    titulo:    headA.indexOf('titulo')
  };
  const valoresA = shA.getRange(2, 1, lastRowA - 1, lastColA).getValues();

  // Lectura de calificaciones (solo pdf_id y revisor)
  const yoCal = new Set();
  const evalsPorPdf = {};
  const shC = ss.getSheetByName(HOJA_CALIFICACIONES);
  if (shC && shC.getLastRow() > 1) {
    const headC = shC.getRange(1, 1, 1, shC.getLastColumn()).getValues()[0];
    const idxPdf = headC.indexOf('pdf_id');
    const idxRev = headC.indexOf('revisor');
    const valoresC = shC.getRange(2, 1, shC.getLastRow() - 1, shC.getLastColumn()).getValues();
    for (var i = 0; i < valoresC.length; i++) {
      const row = valoresC[i];
      const pid = String(row[idxPdf]);
      const rev = idxRev >= 0 ? String(row[idxRev] || '(anonimo)').trim() : '(anonimo)';
      if (rev === revisor) yoCal.add(pid);
      if (!evalsPorPdf[pid]) evalsPorPdf[pid] = new Set();
      evalsPorPdf[pid].add(rev);
    }
  }

  const items = valoresA.map(row => {
    const pid = String(row[idxA.pdf_id]);
    const todos = evalsPorPdf[pid] ? Array.from(evalsPorPdf[pid]) : [];
    const otros = todos.filter(rv => rv !== revisor);
    return {
      pdf_id:    row[idxA.pdf_id],
      pdf_nombre: String(row[idxA.pdf_nombre] || ''),
      revista:   String(row[idxA.revista] || ''),
      pais:      String(row[idxA.pais] || ''),
      macroarea: String(row[idxA.macroarea] || ''),
      anio:      String(row[idxA.anio] || ''),
      titulo:    String(row[idxA.titulo] || ''),
      yo_califique: yoCal.has(pid),
      eval_otros_count: otros.length
    };
  });

  return {
    revisor: revisor,
    total: items.length,
    calificados_por_mi: items.filter(x => x.yo_califique).length,
    items: items
  };
}

/**
 * Devuelve los datos de un PDF específico por pdf_id (o el primero
 * pendiente si no se pasa pdf_id), con la URL preview de Drive.
 * No expone la calificación IA → doble ciego.
 */
function getPDF(pdf_id, revisor) {
  if (!revisor || !String(revisor).trim()) {
    throw new Error('Falta nombre de revisor.');
  }
  revisor = String(revisor).trim();

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const calificaciones = _leerHoja(ss, HOJA_CALIFICACIONES);

  const yoCal = new Set(
    calificaciones.filter(r => String(r.revisor) === revisor)
                  .map(r => String(r.pdf_id))
  );
  const evalsPorPdf = {};
  calificaciones.forEach(r => {
    const k = String(r.pdf_id);
    if (!evalsPorPdf[k]) evalsPorPdf[k] = [];
    evalsPorPdf[k].push(String(r.revisor));
  });

  let target;
  if (pdf_id != null && String(pdf_id) !== '') {
    target = auditables.find(r => String(r.pdf_id) === String(pdf_id));
    if (!target) throw new Error('pdf_id no encontrado: ' + pdf_id);
  } else {
    target = auditables.find(r => !yoCal.has(String(r.pdf_id)));
    if (!target) {
      return {
        fin: true,
        total: auditables.length,
        calificados: yoCal.size,
        revisor: revisor
      };
    }
  }

  const drive_url = _buscarPDFEnDrive(target.pdf_nombre);
  const otros = (evalsPorPdf[String(target.pdf_id)] || []).filter(rv => rv !== revisor);

  return {
    fin: false,
    total: auditables.length,
    calificados: yoCal.size,
    revisor: revisor,
    pdf_id: target.pdf_id,
    pdf_nombre: target.pdf_nombre,
    revista: target.revista,
    pais: target.pais,
    macroarea: target.macroarea,
    anio: target.anio,
    titulo: target.titulo,
    drive_preview_url: drive_url,
    yo_califique: yoCal.has(String(target.pdf_id)),
    eval_otros_count: otros.length,
    eval_otros_revisores: otros
  };
}

/** Alias retrocompatible: devuelve el primer PDF pendiente del revisor. */
function getSiguientePDF(revisor) {
  return getPDF(null, revisor);
}

/**
 * Recibe la calificación humana, la persiste con el revisor indicado,
 * y devuelve el contraste con la IA base y con otros revisores del mismo PDF.
 */
function submitCalificacion(payload) {
  if (!payload.revisor || !String(payload.revisor).trim()) {
    throw new Error('Falta revisor.');
  }
  if (CATEGORIAS_D.indexOf(payload.D) === -1) {
    throw new Error('Veredicto D inválido: ' + payload.D);
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const calificaciones = _leerHoja(ss, HOJA_CALIFICACIONES);
  const reg = auditables.find(r => String(r.pdf_id) === String(payload.pdf_id));
  if (!reg) throw new Error('pdf_id no encontrado: ' + payload.pdf_id);

  const hojaC = ss.getSheetByName(HOJA_CALIFICACIONES);
  hojaC.appendRow([
    new Date(),
    payload.pdf_id,
    reg.pdf_nombre,
    payload.A,
    payload.B,
    payload.C,
    payload.D,
    payload.notas || '',
    reg.A_ia, reg.B_ia, reg.C_ia, reg.veredicto_ia,
    String(payload.revisor).trim()
  ]);

  const humano = {
    A: String(payload.A),
    B: String(payload.B),
    C: String(payload.C),
    D: String(payload.D)
  };
  const comparaciones = [{
    revisor: 'IA base',
    tipo: 'ia_base',
    A: String(reg.A_ia),
    B: String(reg.B_ia),
    C: String(reg.C_ia),
    D: String(reg.veredicto_ia),
    notas: reg.motivo_ia || ''
  }];

  const previas = calificaciones
    .filter(r => String(r.pdf_id) === String(payload.pdf_id))
    .map(r => ({
      revisor: String(r.revisor || '(anonimo)'),
      tipo: _tipoRevisor_(String(r.revisor || '')),
      A: String(r.A_humano),
      B: String(r.B_humano),
      C: String(r.C_humano),
      D: String(r.D_humano),
      notas: String(r.notas || '')
    }));

  // Mantener una fila por revisor, tomando la ultima previa si hay duplicados.
  const porRevisor = {};
  previas.forEach(r => { porRevisor[r.revisor] = r; });
  Object.keys(porRevisor).sort().forEach(k => comparaciones.push(porRevisor[k]));

  comparaciones.forEach(r => {
    r.A_match = r.A === humano.A;
    r.B_match = r.B === humano.B;
    r.C_match = r.C === humano.C;
    r.D_match = r.D === humano.D;
    r.coincidencias = [r.A_match, r.B_match, r.C_match, r.D_match].filter(Boolean).length;
  });

  return {
    A_humano: payload.A, A_ia: reg.A_ia, A_match: String(payload.A) === String(reg.A_ia),
    B_humano: payload.B, B_ia: reg.B_ia, B_match: String(payload.B) === String(reg.B_ia),
    C_humano: payload.C, C_ia: reg.C_ia, C_match: String(payload.C) === String(reg.C_ia),
    D_humano: payload.D, D_ia: reg.veredicto_ia, D_match: payload.D === reg.veredicto_ia,
    motivo_ia: reg.motivo_ia,
    confianza_ia: reg.confianza_ia,
    comparaciones: comparaciones
  };
}

function _tipoRevisor_(revisor) {
  const r = String(revisor || '').toLowerCase();
  if (r === 'codex_gpt' || r === 'gemini_flash' || r === 'gemini_v2' ||
      r === 'claude_haiku' || r === 'claude' || r === 'notebooklm') {
    return 'modelo';
  }
  return 'humano';
}

function comparar_humanos_con_ias_guardadas() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const cal = _leerHoja(ss, HOJA_CALIFICACIONES);
  const labelsD = CATEGORIAS_D.slice();
  const modelos = {
    'IA base': {},
    'Codex/GPT': {},
    'Gemini 2.5 Flash': {},
    'Claude Haiku': {},
    'NotebookLM': {}
  };
  auditables.forEach(a => {
    modelos['IA base'][String(a.pdf_id)] = {
      A: String(a.A_ia), B: String(a.B_ia), C: String(a.C_ia), D: String(a.veredicto_ia)
    };
  });
  const mapaRevisores = {};
  cal.forEach(r => {
    const rev = String(r.revisor || '').trim();
    const pid = String(r.pdf_id);
    if (!mapaRevisores[rev]) mapaRevisores[rev] = {};
    // Si hay duplicados, conservar la ultima fila leida.
    mapaRevisores[rev][pid] = {
      A: String(r.A_humano), B: String(r.B_humano), C: String(r.C_humano), D: String(r.D_humano)
    };
  });
  if (mapaRevisores.codex_gpt) modelos['Codex/GPT'] = mapaRevisores.codex_gpt;
  if (mapaRevisores.gemini_flash) modelos['Gemini 2.5 Flash'] = mapaRevisores.gemini_flash;
  if (mapaRevisores.claude_haiku) modelos['Claude Haiku'] = mapaRevisores.claude_haiku;
  if (mapaRevisores.notebooklm) modelos['NotebookLM'] = mapaRevisores.notebooklm;

  const revisoresHumanos = Object.keys(mapaRevisores)
    .filter(r => _tipoRevisor_(r) === 'humano')
    .sort();

  const filas = [];
  revisoresHumanos.forEach(h => {
    const hmap = mapaRevisores[h];
    Object.keys(modelos).forEach(modelo => {
      const mmap = modelos[modelo];
      const comunes = Object.keys(hmap).filter(pid => mmap[pid]).sort((a, b) => Number(a) - Number(b));
      const n = comunes.length;
      const fila = {
        humano: h,
        ia: modelo,
        n: n,
        acuerdoA: null,
        acuerdoB: null,
        acuerdoC: null,
        acuerdoD: null,
        kappaD: null,
        d_discrepancias: 0,
        pdfs_discrepantes_D: []
      };
      if (n) {
        ['A','B','C','D'].forEach(dim => {
          fila['acuerdo' + dim] = comunes.filter(pid => hmap[pid][dim] === mmap[pid][dim]).length / n;
        });
        const paresD = comunes.map(pid => [hmap[pid].D, mmap[pid].D]);
        fila.kappaD = _kappa(paresD, labelsD);
        fila.d_discrepancias = comunes.filter(pid => hmap[pid].D !== mmap[pid].D).length;
        fila.pdfs_discrepantes_D = comunes
          .filter(pid => hmap[pid].D !== mmap[pid].D)
          .map(pid => ({
            pdf_id: Number(pid),
            humano_D: hmap[pid].D,
            ia_D: mmap[pid].D
          }));
      }
      filas.push(fila);
    });
  });

  return {
    total_calificaciones: cal.length,
    revisores_humanos: revisoresHumanos,
    modelos: Object.keys(modelos),
    filas: filas
  };
}

function calcular_tasas_guardadas() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const cal = _leerHoja(ss, HOJA_CALIFICACIONES);
  const porRevisor = {};
  cal.forEach(r => {
    const rev = String(r.revisor || '').trim();
    if (!porRevisor[rev]) porRevisor[rev] = [];
    porRevisor[rev].push({
      pdf_id: String(r.pdf_id),
      A: String(r.A_humano),
      B: String(r.B_humano),
      C: String(r.C_humano),
      D: String(r.D_humano)
    });
  });
  porRevisor['IA base'] = auditables.map(a => ({
    pdf_id: String(a.pdf_id),
    A: String(a.A_ia),
    B: String(a.B_ia),
    C: String(a.C_ia),
    D: String(a.veredicto_ia)
  }));

  const revisores = Object.keys(porRevisor).sort();
  const filas = revisores.map(rev => _tasasFilas_(rev, porRevisor[rev]));
  const humanos = [];
  Object.keys(porRevisor).forEach(rev => {
    if (rev !== 'IA base' && _tipoRevisor_(rev) === 'humano') {
      porRevisor[rev].forEach(r => humanos.push(r));
    }
  });
  const modelos = [];
  ['IA base','codex_gpt','gemini_flash','claude_haiku','notebooklm'].forEach(rev => {
    if (porRevisor[rev]) porRevisor[rev].forEach(r => modelos.push(r));
  });

  return {
    total_calificaciones: cal.length,
    filas: filas,
    agregado_humanos: _tasasFilas_('Humanos agregados', humanos),
    agregado_ias: _tasasFilas_('IAs agregadas', modelos)
  };
}

function _tasasFilas_(nombre, rows) {
  const n = rows.length;
  const c = pred => rows.filter(pred).length;
  const out = {
    revisor: nombre,
    n: n,
    A: c(r => r.A === '1'),
    B: c(r => r.B === '1'),
    C: c(r => r.C === '1'),
    AC: c(r => r.A === '1' && r.C === '1'),
    A_noB_C: c(r => r.A === '1' && r.B !== '1' && r.C === '1'),
    A_B_C: c(r => r.A === '1' && r.B === '1' && r.C === '1')
  };
  ['A','B','C','AC','A_noB_C','A_B_C'].forEach(k => {
    out[k + '_tasa'] = n ? out[k] / n : null;
  });
  return out;
}

/** Devuelve la URL del Sheet para el botón "Ir al libro". */
function getURLSheet() {
  return 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit';
}

function _borrarFilasRevisor_(revisor) {
  const target = String(revisor || '').trim();
  if (!target) return 0;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
  if (!sh || sh.getLastRow() < 2) return 0;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idxRev = head.indexOf('revisor');
  if (idxRev < 0) return 0;
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const vals = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const keep = vals.filter(row => String(row[idxRev] || '').trim() !== target);
  sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, lastCol).setValues(keep);
  return vals.length - keep.length;
}

function _borrarFilasImputadasDiegoNotebookLM_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
  if (!sh || sh.getLastRow() < 2) return 0;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idxRev = head.indexOf('revisor');
  const idxNotas = head.indexOf('notas');
  if (idxRev < 0 || idxNotas < 0) return 0;
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const vals = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const keep = vals.filter(row => {
    const rev = String(row[idxRev] || '').trim();
    const notas = String(row[idxNotas] || '').trim();
    return !(rev === 'DIEGO MEZA' && notas.indexOf('IMPUTADO_NOTEBOOKLM_PROPORCIONAL') === 0);
  });
  sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, lastCol).setValues(keep);
  return vals.length - keep.length;
}

/**
 * Resumen por revisor para el panel de la app: nombre, total de filas
 * (calificaciones), PDFs únicos calificados y última fecha. Ordenado
 * por total desc.
 */
function getResumenRevisores() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
  if (!sh || sh.getLastRow() < 2) return { total_pdfs: 0, revisores: [] };
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idx = {
    pdf_id: head.indexOf('pdf_id'),
    revisor: head.indexOf('revisor'),
    timestamp: head.indexOf('timestamp')
  };
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const map = {};
  vals.forEach(row => {
    const r = String(row[idx.revisor] || '').trim();
    if (!r) return;
    if (!map[r]) map[r] = { revisor: r, n: 0, pdfs: new Set(), ultima: null };
    map[r].n++;
    map[r].pdfs.add(String(row[idx.pdf_id]));
    const ts = row[idx.timestamp];
    if (ts && (!map[r].ultima || ts > map[r].ultima)) map[r].ultima = ts;
  });
  // PDFs auditables totales (denominador)
  const shA = ss.getSheetByName(HOJA_AUDITABLES);
  const totalPdfs = shA ? Math.max(0, shA.getLastRow() - 1) : 0;
  const revisores = Object.values(map).map(x => ({
    revisor: x.revisor,
    n: x.n,
    pdfs_unicos: x.pdfs.size,
    ultima: x.ultima ? Utilities.formatDate(new Date(x.ultima), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : ''
  })).sort((a, b) => b.n - a.n);
  return { total_pdfs: totalPdfs, revisores: revisores };
}

/**
 * Estadísticas: acuerdo IA vs cada revisor, kappa vs IA, kappa entre
 * humanos (pairwise) cuando hay PDFs con ≥2 revisores.
 */
function getEstadisticas() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const cal = _leerHoja(ss, HOJA_CALIFICACIONES);
  const n = cal.length;
  if (n === 0) return { n: 0 };

  const revisores = Array.from(new Set(cal.map(r => String(r.revisor || '(anonimo)')))).sort();
  const labelsD = CATEGORIAS_D.slice();

  // Por revisor: acuerdo simple por dimensión, kappa vs IA en D, matriz
  const porRevisor = revisores.map(rv => {
    const filas = cal.filter(r => String(r.revisor) === rv);
    const acu = (kh, ki) => filas.filter(r => String(r[kh]) === String(r[ki])).length / filas.length;
    return {
      revisor: rv,
      n: filas.length,
      acuerdoA: acu('A_humano', 'A_ia'),
      acuerdoB: acu('B_humano', 'B_ia'),
      acuerdoC: acu('C_humano', 'C_ia'),
      acuerdoD: acu('D_humano', 'veredicto_ia'),
      kappaD: _kappa(filas.map(r => [r.D_humano, r.veredicto_ia]), labelsD),
      matriz: _matrizConfusion(filas, 'D_humano', 'veredicto_ia', labelsD)
    };
  });

  // Kappa entre humanos: pares de revisores que hayan calificado el mismo PDF
  const kappasHumanos = [];
  for (let i = 0; i < revisores.length; i++) {
    for (let j = i + 1; j < revisores.length; j++) {
      const a = revisores[i], b = revisores[j];
      const filasA = cal.filter(r => String(r.revisor) === a);
      const filasB = cal.filter(r => String(r.revisor) === b);
      const mapA = {}; filasA.forEach(r => { mapA[r.pdf_id] = r.D_humano; });
      const mapB = {}; filasB.forEach(r => { mapB[r.pdf_id] = r.D_humano; });
      const pares = [];
      Object.keys(mapA).forEach(pid => { if (mapB[pid]) pares.push([mapA[pid], mapB[pid]]); });
      if (pares.length >= 2) {
        kappasHumanos.push({
          revisorA: a, revisorB: b,
          n: pares.length,
          kappa: _kappa(pares, labelsD),
          matriz: _matrizPares(pares, labelsD)
        });
      }
    }
  }

  return {
    n: n,
    revisores: revisores,
    porRevisor: porRevisor,
    kappasHumanos: kappasHumanos,
    comparacionModelos: _comparacionModelos(cal, labelsD),
    labelsD: labelsD
  };
}

/**
 * Comparacion directa entre revisores-modelo sobre los 346 PDFs.
 * No usa la IA base del CSV auditables como verdad, sino cada fila importada
 * como una lectura independiente del mismo protocolo.
 */
function _comparacionModelos(cal, labelsD) {
  const modelos = ['codex_gpt', 'gemini_flash', 'claude_haiku', 'notebooklm'];
  const porModelo = {};
  modelos.forEach(m => {
    const filas = cal.filter(r => String(r.revisor) === m);
    const ids = {};
    filas.forEach(r => { ids[String(r.pdf_id)] = r; });
    porModelo[m] = ids;
  });

  const cobertura = modelos.map(m => {
    const ids = Object.keys(porModelo[m]).map(Number).sort((a, b) => a - b);
    const faltantes = [];
    for (var i = 1; i <= 346; i++) if (!porModelo[m][String(i)]) faltantes.push(i);
    return {
      revisor: m,
      n: ids.length,
      faltantes: faltantes,
      distribucionD: _conteoD(Object.values(porModelo[m]), labelsD)
    };
  });

  const pares = [];
  for (var a = 0; a < modelos.length; a++) {
    for (var b = a + 1; b < modelos.length; b++) {
      const ma = modelos[a], mb = modelos[b];
      const comunes = Object.keys(porModelo[ma]).filter(pid => porModelo[mb][pid]).sort((x, y) => Number(x) - Number(y));
      const paresD = comunes.map(pid => [porModelo[ma][pid].D_humano, porModelo[mb][pid].D_humano]);
      const acuerdoD = paresD.length ? paresD.filter(p => String(p[0]) === String(p[1])).length / paresD.length : null;
      pares.push({
        revisorA: ma,
        revisorB: mb,
        n: paresD.length,
        acuerdoD: acuerdoD,
        kappaD: _kappa(paresD, labelsD),
        matriz: _matrizPares(paresD, labelsD)
      });
    }
  }

  const comunesTodos = [];
  for (var pid = 1; pid <= 346; pid++) {
    const k = String(pid);
    if (modelos.every(m => porModelo[m][k])) comunesTodos.push(k);
  }
  const consensoD = {
    unanimidad: 0,
    mayoria: 0,
    empate: 0,
    todos_distintos: 0
  };
  comunesTodos.forEach(pid => {
    const conteo = {};
    modelos.forEach(m => {
      const d = String(porModelo[m][pid].D_humano);
      conteo[d] = (conteo[d] || 0) + 1;
    });
    const frecs = Object.keys(conteo).map(k => conteo[k]).sort((a, b) => b - a);
    if (frecs[0] === modelos.length) consensoD.unanimidad++;
    else if (frecs[0] >= 3) consensoD.mayoria++;
    else if (frecs[0] === 2) consensoD.empate++;
    else consensoD.todos_distintos++;
  });

  return {
    modelos: modelos,
    cobertura: cobertura,
    pares: pares,
    comunesTodos: comunesTodos.length,
    consensoD: consensoD
  };
}

function _conteoD(filas, labelsD) {
  const out = {};
  labelsD.forEach(l => out[l] = 0);
  filas.forEach(r => {
    const d = String(r.D_humano || '');
    out[d] = (out[d] || 0) + 1;
  });
  return out;
}

/**
 * Construye/actualiza la hoja "comparacion" con una fila por PDF y una
 * columna por revisor + IA. Útil para revisar visualmente desde el Sheet.
 */
function actualizar_hoja_comparacion() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const cal = _leerHoja(ss, HOJA_CALIFICACIONES);

  const revisores = Array.from(new Set(cal.map(r => String(r.revisor || '(anonimo)')))).sort();
  const head = ['pdf_id', 'pdf_nombre', 'titulo', 'IA_veredicto']
                 .concat(revisores.map(r => 'humano: ' + r))
                 .concat(['n_humanos', 'acuerdo_total']);

  // Indexar calificaciones por (pdf_id, revisor)
  const idx = {};
  cal.forEach(r => {
    const k = String(r.pdf_id);
    if (!idx[k]) idx[k] = {};
    idx[k][String(r.revisor)] = r.D_humano;
  });

  const filas = auditables.map(a => {
    const k = String(a.pdf_id);
    const cells = [a.pdf_id, a.pdf_nombre, a.titulo, a.veredicto_ia];
    let nHumanos = 0;
    const valoresHumanos = [];
    revisores.forEach(rv => {
      const v = (idx[k] || {})[rv] || '';
      cells.push(v);
      if (v) { nHumanos++; valoresHumanos.push(v); }
    });
    const todosIguales = (nHumanos > 0) &&
                         valoresHumanos.every(v => v === a.veredicto_ia);
    cells.push(nHumanos);
    cells.push(todosIguales ? 'TODOS_OK' : (nHumanos === 0 ? '' : 'REVISAR'));
    return cells;
  });

  let sh = ss.getSheetByName(HOJA_COMPARACION);
  if (!sh) sh = ss.insertSheet(HOJA_COMPARACION);
  sh.clear();
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  if (filas.length) sh.getRange(2, 1, filas.length, head.length).setValues(filas);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  Logger.log('Hoja comparacion actualizada. Filas: ' + filas.length + '. Revisores: ' + revisores.join(', '));
}

// ───────────────────── HELPERS ────────────────────────────────────────────
function _leerHoja(ss, nombre) {
  const sh = ss.getSheetByName(nombre);
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const head = v[0];
  return v.slice(1).map(row => Object.fromEntries(head.map((h, i) => [h, row[i]])));
}

function _matrizConfusion(filas, keyA, keyB, labels) {
  const M = labels.map(() => labels.map(() => 0));
  filas.forEach(r => {
    const i = labels.indexOf(r[keyA]);
    const j = labels.indexOf(r[keyB]);
    if (i >= 0 && j >= 0) M[i][j] += 1;
  });
  return M;
}

function _matrizPares(pares, labels) {
  const M = labels.map(() => labels.map(() => 0));
  pares.forEach(([a, b]) => {
    const i = labels.indexOf(a);
    const j = labels.indexOf(b);
    if (i >= 0 && j >= 0) M[i][j] += 1;
  });
  return M;
}

/** Cohen's kappa entre dos vectores de etiquetas (pares [a, b]). */
function _kappa(pares, labels) {
  const M = _matrizPares(pares, labels);
  const total = M.flat().reduce((s, x) => s + x, 0);
  if (!total) return null;
  let pO = 0; for (let k = 0; k < labels.length; k++) pO += M[k][k];
  pO /= total;
  let pE = 0;
  for (let k = 0; k < labels.length; k++) {
    const fila = M[k].reduce((s, x) => s + x, 0) / total;
    const col  = M.map(r => r[k]).reduce((s, x) => s + x, 0) / total;
    pE += fila * col;
  }
  return pE === 1 ? null : (pO - pE) / (1 - pE);
}

function _buscarPDFEnDrive(pdfNombre) {
  const cache = CacheService.getScriptCache();
  const k = 'pdf:' + pdfNombre;
  const c = cache.get(k);
  if (c) return c;

  const folder = DriveApp.getFolderById(FOLDER_ID);
  let files = folder.getFilesByName(pdfNombre);
  if (files.hasNext()) {
    const id = files.next().getId();
    const url = 'https://drive.google.com/file/d/' + id + '/preview';
    cache.put(k, url, 21600);
    return url;
  }
  const idRecursivo = _buscarRecursivo(folder, pdfNombre);
  if (idRecursivo) {
    const url = 'https://drive.google.com/file/d/' + idRecursivo + '/preview';
    cache.put(k, url, 21600);
    return url;
  }
  const it = DriveApp.getFilesByName(pdfNombre);
  if (it.hasNext()) {
    const id = it.next().getId();
    const url = 'https://drive.google.com/file/d/' + id + '/preview';
    cache.put(k, url, 21600);
    return url;
  }
  return '';
}

function _buscarRecursivo(folder, pdfNombre) {
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    const f = sub.getFilesByName(pdfNombre);
    if (f.hasNext()) return f.next().getId();
    const id = _buscarRecursivo(sub, pdfNombre);
    if (id) return id;
  }
  return '';
}

/**
 * Diagnostico de getListaPDFs: ejecutalo desde el editor para ver
 * cuanto tarda y si hay algun error.
 */
function diagnostico_lista() {
  const t0 = Date.now();
  try {
    const r = getListaPDFs('test');
    const ms = Date.now() - t0;
    Logger.log('OK en ' + ms + 'ms');
    Logger.log('total: ' + r.total + ', calificados_por_mi: ' + r.calificados_por_mi);
    Logger.log('primer item: ' + JSON.stringify(r.items[0]));
    Logger.log('ultimo item: ' + JSON.stringify(r.items[r.items.length - 1]));
  } catch (e) {
    Logger.log('ERROR: ' + e.message);
    Logger.log(e.stack);
  }
}

/**
 * Análisis exhaustivo de concordancia humano vs IA sobre las calificaciones
 * realizadas hasta el momento. Imprime al log:
 *   - n total y por revisor
 *   - acuerdo bruto y Cohen's kappa por dimensión (A, B, C, D)
 *   - matriz de confusión D (humano filas, IA columnas)
 *   - distribución direccional de los desacuerdos
 *   - listado de PDFs con desacuerdo en D y motivo IA
 *
 * Ejecutar manualmente desde el editor para diagnóstico.
 */
/**
 * Lista los pdf_ids ya calificados por humanos (cualquier revisor).
 * Útil para identificar los PDFs que debe evaluar Claude/GPT en el piloto.
 */
/**
 * Renombra todas las filas con revisor "(anonimo)" al nombre dado.
 * Útil para unificar calificaciones que se hicieron antes de identificarse.
 * Idempotente: si ya no quedan "(anonimo)", no hace nada.
 */
function unificar_revisor(nombreReal) {
  if (!nombreReal || !String(nombreReal).trim()) {
    throw new Error('Pasale tu nombre real, ej: unificar_revisor("DIEGO MEZA")');
  }
  nombreReal = String(nombreReal).trim();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(HOJA_CALIFICACIONES);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idx = head.indexOf('revisor');
  if (idx < 0) throw new Error('Falta columna revisor. Correr migrar_agregar_columna_revisor primero.');
  const lastRow = sh.getLastRow();
  if (lastRow < 2) { Logger.log('Sin filas a migrar.'); return; }
  const rng = sh.getRange(2, idx + 1, lastRow - 1, 1);
  const vals = rng.getValues();
  let cambios = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = String(vals[i][0] || '').trim();
    if (v === '(anonimo)' || v === '') {
      vals[i][0] = nombreReal;
      cambios++;
    }
  }
  if (cambios > 0) rng.setValues(vals);
  Logger.log('Filas migradas a "' + nombreReal + '": ' + cambios);
}

/**
 * Importa de un saque las dos bases del piloto (Claude y Gemini v2)
 * desde el repo público de GitHub.
 */
function importar_pilotos_claude_y_gemini2() {
  importarEvaluacionesIA(
    'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_claude_piloto.csv',
    'claude'
  );
  importarEvaluacionesIA(
    'https://raw.githubusercontent.com/investigapyrm/evalua_articulos_cientificos/main/data/evaluaciones_gemini_v2_piloto.csv',
    'gemini_v2'
  );
}

function listarPdfIdsCalificados() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const cal = _leerHoja(ss, HOJA_CALIFICACIONES);
  const pares = cal.map(r => ({pdf_id: r.pdf_id, pdf_nombre: r.pdf_nombre, revisor: r.revisor}));
  Logger.log('Total: ' + pares.length);
  Logger.log('JSON: ' + JSON.stringify(pares));
  return pares;
}

/**
 * Importa evaluaciones desde un CSV publicado en una URL pública (ej. raw.githubusercontent.com).
 * El CSV debe tener columnas: pdf_id, A, B, C, D, notas (opcional), revisor (opcional).
 * Si revisor no está en el CSV, se usa el parámetro defaultRevisor.
 */
function importarEvaluacionesIA(url, defaultRevisor) {
  if (!url) throw new Error('Falta URL del CSV');
  if (!defaultRevisor) throw new Error('Falta defaultRevisor');

  const resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode());
  const data = Utilities.parseCsv(resp.getContentText('UTF-8'));
  const head = data[0];
  const idx = {};
  ['pdf_id','A','B','C','D','notas','revisor'].forEach(k => idx[k] = head.indexOf(k));
  if (idx.pdf_id < 0 || idx.A < 0 || idx.B < 0 || idx.C < 0 || idx.D < 0) {
    throw new Error('CSV debe tener al menos columnas: pdf_id, A, B, C, D');
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const audByPid = {};
  auditables.forEach(a => audByPid[String(a.pdf_id)] = a);
  const hojaC = ss.getSheetByName(HOJA_CALIFICACIONES);

  let ok = 0, skipped = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[idx.pdf_id]) continue;
    const pid = String(row[idx.pdf_id]);
    const a = audByPid[pid];
    if (!a) { skipped++; continue; }
    const D = String(row[idx.D] || '').trim();
    if (CATEGORIAS_D.indexOf(D) === -1) {
      Logger.log('Veredicto invalido en fila ' + i + ': ' + D);
      skipped++; continue;
    }
    const revisor = (idx.revisor >= 0 && row[idx.revisor]) ? String(row[idx.revisor]).trim() : defaultRevisor;
    hojaC.appendRow([
      new Date(),
      a.pdf_id, a.pdf_nombre,
      String(row[idx.A]).trim(),
      String(row[idx.B]).trim(),
      String(row[idx.C]).trim(),
      D,
      idx.notas >= 0 ? String(row[idx.notas] || '').trim() : '',
      a.A_ia, a.B_ia, a.C_ia, a.veredicto_ia,
      revisor
    ]);
    ok++;
  }
  Logger.log('Importadas: ' + ok + '. Saltadas: ' + skipped);
  return {ok: ok, skipped: skipped};
}

function diagnostico_acuerdo() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const cal = _leerHoja(ss, HOJA_CALIFICACIONES);
  Logger.log('Total filas calificaciones: ' + cal.length);
  if (!cal.length) { Logger.log('Aún no hay calificaciones. Volvé luego de calificar algunas.'); return; }

  // Por revisor
  const revisores = Array.from(new Set(cal.map(r => String(r.revisor || '(anonimo)'))));
  Logger.log('Revisores: ' + revisores.join(', '));
  revisores.forEach(rv => {
    const filas = cal.filter(r => String(r.revisor) === rv);
    Logger.log('  ' + rv + ': ' + filas.length + ' calificadas');
  });

  // Helper: kappa
  function kappa(pares, labels) {
    if (!pares.length) return null;
    const M = labels.map(() => labels.map(() => 0));
    pares.forEach(p => {
      const i = labels.indexOf(p[0]); const j = labels.indexOf(p[1]);
      if (i >= 0 && j >= 0) M[i][j]++;
    });
    const tot = M.flat().reduce((s,x) => s+x, 0);
    if (!tot) return null;
    let pO = 0; for (let k = 0; k < labels.length; k++) pO += M[k][k];
    pO /= tot;
    let pE = 0;
    for (let k = 0; k < labels.length; k++) {
      const fi = M[k].reduce((s,x)=>s+x,0)/tot;
      const co = M.map(r=>r[k]).reduce((s,x)=>s+x,0)/tot;
      pE += fi*co;
    }
    return pE === 1 ? null : (pO - pE) / (1 - pE);
  }

  // Acuerdo y kappa por dimension binaria (A, B, C)
  Logger.log('---- ACUERDO POR DIMENSIÓN BINARIA ----');
  ['A','B','C'].forEach(dim => {
    const pares = cal.map(r => [String(r[dim+'_humano']), String(r[dim+'_ia'])]);
    const ok = pares.filter(p => p[0] === p[1]).length;
    const pct = (100*ok/pares.length).toFixed(1);
    const k = kappa(pares, ['0','1']);
    Logger.log(dim + ': ' + ok + '/' + pares.length + ' = ' + pct + '%  kappa=' + (k!=null?k.toFixed(3):'n/a'));
  });

  // D (categórico de 5)
  Logger.log('---- ACUERDO EN VEREDICTO INTEGRAL D ----');
  const labelsD = ['FF clasica','FF con reconocimiento','Debilidad importante','Sin falla relevante','No evaluable'];
  const paresD = cal.map(r => [String(r.D_humano), String(r.veredicto_ia)]);
  const okD = paresD.filter(p => p[0] === p[1]).length;
  Logger.log('D: ' + okD + '/' + paresD.length + ' = ' + (100*okD/paresD.length).toFixed(1) + '%  kappa=' + (kappa(paresD, labelsD)||0).toFixed(3));

  // Matriz de confusión D
  Logger.log('---- MATRIZ D (filas humano, columnas IA) ----');
  const M = labelsD.map(() => labelsD.map(() => 0));
  paresD.forEach(p => {
    const i = labelsD.indexOf(p[0]); const j = labelsD.indexOf(p[1]);
    if (i >= 0 && j >= 0) M[i][j]++;
  });
  Logger.log('etiquetas: ' + labelsD.join(' | '));
  for (let i = 0; i < labelsD.length; i++) {
    Logger.log(labelsD[i].padEnd(28) + ' -> ' + M[i].map(x => String(x).padStart(4)).join(' '));
  }

  // Sesgo direccional: ¿en qué dirección se equivoca la IA según el humano?
  Logger.log('---- SESGO DIRECCIONAL (cuando humano e IA discrepan en D) ----');
  const desacuerdos = paresD.filter(p => p[0] !== p[1]);
  Logger.log('Desacuerdos: ' + desacuerdos.length + ' de ' + paresD.length);
  const grav = {'FF clasica':4,'FF con reconocimiento':3,'Debilidad importante':2,'Sin falla relevante':1,'No evaluable':0};
  let iaSobreestima = 0, iaSubestima = 0;
  desacuerdos.forEach(p => {
    const dh = grav[p[0]] || 0, di = grav[p[1]] || 0;
    if (di > dh) iaSobreestima++;
    if (di < dh) iaSubestima++;
  });
  Logger.log('IA juzga MÁS grave que humano: ' + iaSobreestima);
  Logger.log('IA juzga MENOS grave que humano: ' + iaSubestima);

  // Caso especial: humano marcó "No evaluable" → IA falla en filtro de aplicabilidad
  const noEvalHumano = cal.filter(r => String(r.D_humano) === 'No evaluable').length;
  Logger.log('---- ARTÍCULOS QUE HUMANO MARCÓ "No evaluable" pero IA clasificó como aplicable: ' + noEvalHumano);

  // Listar primeros 10 desacuerdos en D con motivo IA
  Logger.log('---- PRIMEROS 10 DESACUERDOS EN D (con motivo IA) ----');
  const auditables = _leerHoja(ss, HOJA_AUDITABLES);
  const motivoMap = {};
  auditables.forEach(a => motivoMap[String(a.pdf_id)] = a.motivo_ia);
  let cnt = 0;
  for (const r of cal) {
    if (String(r.D_humano) !== String(r.veredicto_ia)) {
      cnt++;
      Logger.log('PDF ' + r.pdf_id + ' (' + r.pdf_nombre + ')');
      Logger.log('  humano: ' + r.D_humano + '  ↔  IA: ' + r.veredicto_ia);
      Logger.log('  binarios humano: A=' + r.A_humano + ' B=' + r.B_humano + ' C=' + r.C_humano);
      Logger.log('  binarios IA   : A=' + r.A_ia + ' B=' + r.B_ia + ' C=' + r.C_ia);
      const m = motivoMap[String(r.pdf_id)];
      if (m) Logger.log('  motivo IA: ' + String(m).substring(0, 280));
      if (r.notas) Logger.log('  notas humano: ' + String(r.notas).substring(0, 200));
      Logger.log('');
      if (cnt >= 10) break;
    }
  }
}

function diagnostico_carpeta() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  Logger.log('Carpeta: ' + folder.getName() + ' (' + folder.getId() + ')');
  let nFiles = 0;
  const itF = folder.getFiles();
  while (itF.hasNext() && nFiles < 5) { itF.next(); nFiles++; }
  if (itF.hasNext()) Logger.log('Total archivos directos: >5 (truncado)');
  else Logger.log('Total archivos directos: ' + nFiles);
  let nSubs = 0;
  const itS = folder.getFolders();
  while (itS.hasNext()) { itS.next(); nSubs++; }
  Logger.log('Total subcarpetas: ' + nSubs);
  const m = '00033_Praxis_Educativa_2025.pdf';
  Logger.log('Buscar muestra ' + m + ' → ' + (_buscarPDFEnDrive(m) || 'NO ENCONTRADO'));
}
