# califica_articulos_inferenciales

> **Verificador publico estatico:** GitHub Pages del mismo repositorio, con `index.html`, `app.js`, `public_data/auditables_346.json` y `public_pdfs/`.
> **🌐 App pública:** <https://script.google.com/macros/s/AKfycby-SQDUuxxpHl2ApM3xosLbFrxAvxxyZY7yFRhU7fytgqn_NS1MO0uqq5piKcHTc1fLvg/exec>
> _(Cualquier usuario con cuenta de Google. Identifícate como revisor al entrar; las calificaciones se guardan por nombre)._

App web de evaluación humana **doble ciego** y comparación multi-modelo para los 346 artículos auditables del estudio
**Errores Inferenciales Críticos en Estudios Cuantitativos Sudamericanos** (DOAJ 2025).

Permite ir viendo cada PDF, calificarlo manualmente sobre las dimensiones operacionales
del protocolo v4.1 (A, B, C) más un veredicto integral (D), y luego contrastar la
calificación humana o de modelo con la auditoría IA base. El dashboard compara además
las revisiones completas de **Codex/GPT**, **Gemini 2.5 Flash** y **Claude Haiku** para obtener
medidas de **acuerdo inter-rater** (porcentaje de coincidencia + Cohen's kappa).

## Dos superficies distintas

### 1. Verificador publico estatico

Esta es la superficie pensada para compartir evidencia verificable a terceros, incluida la revista:

- no requiere Google Apps Script;
- no requiere login;
- expone los `346` registros auditables;
- permite abrir y descargar cada PDF copiado al sitio;
- muestra metadatos, veredictos IA, contraste humano y trazabilidad;
- incluye un `Panel auditor` para ensayos locales y un enlace directo a la app central de auditoria;
- se alimenta desde `04_INVESTIGACION_REPO/tabla_validacion_humano_vs_ia_auditables_346.csv`.

Archivos clave:

- `index.html`
- `app.js`
- `auditor.html`
- `auditor.js`
- `site-config.js`
- `scripts/build_public_catalog.py`
- `scripts/anonymize_public_pdfs.py`
- `public_data/auditables_346.json`
- `public_pdfs/*.pdf`
- `anonymized_pdfs/*.pdf`
- `public_data/anonymized_pdf_manifest.csv`

### 2. App privada de calificacion

La Web App de Google Apps Script sigue siendo la superficie para captura y comparacion interactiva de revisores.

## Stack

- **Google Apps Script** (frontend + backend en una sola pieza, sin servidor externo).
- **Google Drive** para almacenar los PDFs (carpeta compartida ya existente).
- **Google Sheets** como base de datos de calificaciones humanas y metadatos auditables.
- **Repositorio versionado en GitHub** con sincronización automática vía
  [`clasp`](https://github.com/google/clasp) (CLI oficial de Google Apps Script).

## Estructura del repositorio

```
califica_articulos_inferenciales/
├── apps_script/
│   ├── appsscript.json          # manifest con scopes Drive + Sheets
│   ├── Code.gs                  # backend
│   ├── Index.html               # UI principal (PDF + formulario de calificación)
│   ├── DashboardStats.html      # acuerdo, kappa, matriz de confusión
│   └── styles.html              # CSS reutilizable
├── data/
│   ├── articulos_auditables_346.csv             # 346 PDFs con sus cifras IA base
│   ├── evaluaciones_codex_gpt.csv               # 346 evaluaciones Codex/GPT
│   ├── evaluaciones_gemini_flash.csv            # 345 evaluaciones Gemini 2.5 Flash
│   ├── evaluaciones_claude_haiku_346.csv        # 346 evaluaciones Claude Haiku
│   ├── evaluaciones_notebooklm.csv              # 346 evaluaciones NotebookLM para importar
│   ├── evaluaciones_notebooklm_muestreo.csv     # 346 evaluaciones NotebookLM con evidencias A/B/C
│   └── comparacion_codex_gemini_claude.csv      # cruce completo por pdf_id
├── docs/
│   ├── arquitectura.md
│   └── flujo_doble_ciego.md
├── public_data/
│   └── auditables_346.json                 # catalogo publico generado
├── public_pdfs/
│   └── *.pdf                               # 346 PDFs auditables copiados para verificacion
├── scripts/
│   └── build_public_catalog.py             # genera JSON y copia PDFs al sitio publico
├── DEPLOY.md
└── README.md
```

## Generar o refrescar el verificador publico

Desde la raiz del repo:

```bash
python3 scripts/anonymize_public_pdfs.py
python3 scripts/build_public_catalog.py
python3 -m http.server 8016
```

Luego abre `http://localhost:8016/`.

Resultado esperado del script:

```text
records=346 pdfs=346 missing=0
```

Si la fuente cambia, vuelve a generar antes de publicar en GitHub Pages.

## Anonimizacion de PDFs

El pipeline publico ya incluye una capa de anonimización reproducible.

```bash
python3 scripts/anonymize_public_pdfs.py
```

Salida principal:

- `anonymized_pdfs/case_0001.pdf` ... `case_0346.pdf`
- `public_data/anonymized_pdf_manifest.csv`
- `public_data/anonymized_pdf_manifest.json`

Criterio actual:

- PDFs de varias paginas: se reemplaza la primera pagina por una portada sintetica neutra y se redaccionan bandas de encabezado/pie en paginas internas.
- PDFs de una sola pagina: se aplica redaccion parcial de la primera pagina y quedan marcados para revision manual en el manifiesto.
- Siempre se eliminan metadatos embebidos del PDF.

`build_public_catalog.py` ahora prefiere automaticamente estas copias anonimizadas cuando el manifiesto existe.

## Variables operacionales calificadas

| Var | Pregunta | Tipo |
|-----|----------|------|
| **A** | ¿Muestreo no probabilístico? (conveniencia, voluntarios, bola de nieve, intencional, consecutivo) | binaria |
| **B** | ¿Advierte la limitación del muestreo en cualquier parte del texto? | binaria |
| **C** | ¿Extrapola a una población más amplia que la muestra observada? | binaria |
| **D** | Veredicto integral del juez humano/modelo | categórica de 5 |

Categorías de D:
- `FF clasica` — Falla fuerte sin advertencia (A & ¬B & C).
- `FF con reconocimiento` — Falla fuerte con advertencia pero generaliza igual (A & B & C).
- `Debilidad importante` — problema metodológico que no cumple A & C.
- `Sin falla relevante` — muestreo apropiado o conclusiones acotadas.
- `No evaluable` — PDF/artículo no apto para computar el protocolo.

## Métricas reportadas en el dashboard

- Acuerdo simple por dimensión (A, B, C, D).
- Acuerdo global (D = veredicto integral).
- **Cohen's kappa** sobre D, corregido por acuerdo esperado por azar.
- Matriz de confusión 5×5 entre revisores.
- Comparación directa Codex/GPT ↔ Gemini ↔ Claude.
- Taxonomía de discrepancias: consenso triple, mayoría 2-vs-1 y tres distintos.

## Despliegue

Ver [DEPLOY.md](DEPLOY.md) para los pasos paso a paso. En resumen:

### Sitio publico de verificacion

1. Ejecutar `python3 scripts/build_public_catalog.py`.
2. Confirmar que `public_data/auditables_346.json` y `public_pdfs/` quedaron actualizados.
3. Subir `index.html`, `app.js`, `public_data/` y `public_pdfs/` al branch publicado.
4. Activar GitHub Pages sobre ese branch.

### App privada de Google Apps Script

1. Subir `data/articulos_auditables_346.csv` a Google Drive y copiar su file ID.
2. Crear un proyecto Apps Script vacío vinculado a tu cuenta de Google.
3. `clasp clone <SCRIPT_ID>` o `clasp push` desde la carpeta `apps_script/`.
4. Editar las constantes `FOLDER_ID`, `CSV_FILE_ID` en `Code.gs`.
5. Ejecutar la función `setup_inicial()` una vez. Copiar el `SHEET_ID` que imprime al log.
6. Pegar el `SHEET_ID` en `Code.gs` y volver a desplegar.
7. Deploy → Web App → ejecutar como "Mí mismo", acceso "Solo yo".
8. Acceder a la URL pública de la app.

## Privacidad y acceso

- El verificador publico estatico expone PDFs y trazabilidad para replicacion.
- Antes de publicar en abierto, ejecutar `scripts/anonymize_public_pdfs.py`; el catalogo ya enlaza preferentemente `anonymized_pdfs/`.
- La app se despliega con `access: MYSELF` — solo tu cuenta puede entrar.
- No se exponen los PDFs públicamente.
- Las calificaciones se guardan en tu propio Google Sheet privado.
- El código es público (este repo) pero **no contiene secretos**: los IDs de Drive y
  Sheet se pegan localmente y no se commitean (`Code.gs` los expone como constantes
  vacías para que las completes en tu copia desplegada).

## Cita

Si usas estas calificaciones humanas como complemento de la auditoría IA, citá la
tesis y el paquete `inferencia.audit` que generó el ground truth IA:

> Meza Bogado, D. B. (2026). *Errores inferenciales críticos en estudios cuantitativos
> sudamericanos: una auditoría documental probabilística asistida por IA*. Tesis
> Doctoral en Ciencias, FACEN-UNA.
