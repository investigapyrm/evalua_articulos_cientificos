# evalua_articulos_cientificos

Aplicación web para facilitar la revisión humana trazable de artículos científicos. La herramienta fue diseñada para una auditoría documental de artículos cuantitativos sudamericanos y permite registrar, por cada PDF, decisiones de codificación metodológica, evidencia textual y metadatos mínimos de revisión.

El repositorio contiene el código de la aplicación, documentación de despliegue y archivos de datos auxiliares usados para inicializar la matriz de artículos y contrastar revisiones. No incluye PDFs ni credenciales privadas de Google Drive, Google Sheets o Apps Script.

## Funcionalidades

- Presentación de cada PDF auditable junto con una matriz de codificación.
- Registro de respuestas por revisor, notas y evidencia textual.
- Flujo de revisión doble ciego: la codificación auxiliar no se muestra antes del envío humano.
- Persistencia en Google Sheets.
- Lectura de PDFs desde una carpeta privada de Google Drive.
- Dashboard de cobertura, acuerdos simples, kappa y matrices de confusión.
- Importación opcional de evaluaciones auxiliares de modelos de lenguaje para contraste metodológico.

## Stack

- Google Apps Script como backend y frontend.
- Google Drive para los PDF.
- Google Sheets como base de datos de revisión.
- GitHub como repositorio versionado.
- `clasp` para sincronizar el código con Apps Script.

## Estructura

```text
apps_script/
  appsscript.json
  Code.gs
  Index.html
  DashboardStats.html
  styles.html
data/
  articulos_auditables_346.csv
  evaluaciones_codex_gpt.csv
  evaluaciones_gemini_flash.csv
  evaluaciones_claude_haiku_346.csv
  evaluaciones_notebooklm.csv
docs/
  arquitectura.md
DEPLOY.md
index.html
```

## Variables de codificación

| Variable | Pregunta operativa | Tipo |
|---|---|---|
| A | ¿El artículo usa o permite inferir muestreo no probabilístico? | Binaria |
| B | ¿El texto advierte limitaciones del muestreo o de la generalización? | Binaria |
| C | ¿El artículo extrapola a una población o dominio más amplio que la muestra observada? | Binaria |
| D | Veredicto integral usado como descriptor complementario de revisión. | Categórica |

## Privacidad

El código se publica sin IDs reales de Drive, IDs de Sheets, tokens administrativos ni archivos PDF. Para desplegar una copia funcional se deben completar localmente las constantes `FOLDER_ID` y `SHEET_ID` en `apps_script/Code.gs`, y configurar opcionalmente el token administrativo en las propiedades del proyecto de Apps Script.

## Despliegue

Ver [DEPLOY.md](DEPLOY.md).

## Cita sugerida del software

```text
InvestigapyRM. (2026). evalua_articulos_cientificos: aplicación web para revisión trazable de artículos científicos. GitHub. https://github.com/investigapyrm/evalua_articulos_cientificos
```
