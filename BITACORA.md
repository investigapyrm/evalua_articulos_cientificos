## 2026-06-17 05:05

### Proyecto

* Nombre: evalua_articulos_cientificos
* Cliente o institucion: InvestigapyRM / paquete de replicacion para DADOS
* Ruta local: `/tmp/evalua_articulos_cientificos_target`
* Repositorio: `https://github.com/investigapyrm/evalua_articulos_cientificos`
* URL publica: `https://investigapyrm.github.io/evalua_articulos_cientificos/`
* Responsable: Codex con supervision de Diego
* Version: main

### Objetivo de la intervencion

* Alinear los KPIs del sitio publico con las metricas del manuscrito final sometido y retirar de la UI cualquier exposicion de nombres de revisores.

### Diagnostico inicial

* La app publica mostraba conteos por veredicto IA (`122`, `85`, `49`) que no coinciden con las metricas centrales reportadas por el articulo final.
* El JSON publico todavia exponia `summary_rows` con nombres de revisores y cada registro incluia el campo `revisor`.
* La interfaz visible seguia usando la palabra `humano`, mientras que el manuscrito final usa `referencia`.
* El primer PDF visible tendia a quedar fijado por el orden de origen del catalogo.

### Acciones realizadas

* Se actualizo `scripts/build_public_catalog.py` para:
  * eliminar `summary_rows` del JSON publico;
  * renombrar la clave publica `humano` a `referencia`;
  * retirar el campo `revisor` de cada registro;
  * incorporar `reference_metrics` con las cifras del manuscrito final:
    * `231` con muestreo no probabilistico;
    * `181` con A∩C;
    * `83` con A∩C sin reconocimiento de limites;
    * `98` con A∩B∩C;
    * nota de fuente del manuscrito final local.
* Se regenero `public_data/auditables_346.json`.
* Se actualizo `app.js` para:
  * mostrar KPIs basados en `reference_metrics`;
  * sustituir `Humano` por `Referencia` en todo el texto visible;
  * quitar la tabla de comparacion sensible;
  * agregar navegacion `Caso anterior`, `Otro caso`, `Siguiente caso`;
  * mezclar el orden del catalogo por sesion para evitar que siempre abra el mismo primer caso.
* Se actualizo `index.html` para retirar el panel de resumen sensible y dejar una nota corta con las cifras del manuscrito.

### Archivos modificados

* `app.js`
* `index.html`
* `scripts/build_public_catalog.py`
* `public_data/auditables_346.json`
* `BITACORA.md`

### Comandos o scripts ejecutados

* `python3 scripts/build_public_catalog.py`
* `node --check app.js`
* `rsync -av --delete ... califica_articulos_inferenciales/ /tmp/evalua_articulos_cientificos_target/`

### Resultados verificados

* El JSON publico ya no contiene `summary_rows`.
* El JSON publico ya no contiene la clave `humano`; ahora usa `referencia`.
* El JSON publico ya no expone `revisor`.
* `public_data/auditables_346.json` mantiene `346` registros y `346` PDFs disponibles.
* Las metricas publicas quedaron listas para mostrar `231`, `181`, `83` y `98`, coherentes con el manuscrito final.

### Pruebas realizadas

* Validacion sintactica con `node --check app.js`.
* Regeneracion del catalogo con `records=346 pdfs=346 missing=0`.
* Verificacion estructural del JSON publico para confirmar ausencia de `summary_rows`, `humano` y `revisor`.

### Errores o incidentes

* El `rsync` desde el repo auxiliar reintrodujo una bitacora con metadatos del repo anterior; se reemplazo por una bitacora propia del repo oficial.

### Soluciones aplicadas

* Se adopto `referencia` como vocabulario publico estable.
* Se separaron las metricas del manuscrito de los conteos crudos del veredicto IA para evitar contradicciones entre app y articulo.

### Pendientes

* Empujar este ajuste adicional a `main`.
* Verificar en GitHub Pages que el cache ya sirva el `index` y el `public_data/auditables_346.json` nuevos.

### Riesgos

* GitHub Pages puede demorar algunos minutos adicionales en invalidar cache del `index.html`.
* El sitio sigue exponiendo evidencia textual de codificacion; si luego se quisiera reducir aun mas el nivel de detalle, habria que definir otra pasada de publicacion.

### Recomendaciones

* Mantener los KPIs publicos anclados al manuscrito final y no a un resumen auxiliar de revisores parciales.
* Si se publica un nuevo corte del articulo, actualizar primero `reference_metrics` y luego regenerar el catalogo.

## 2026-06-17 08:10

### Proyecto

* Nombre: evalua_articulos_cientificos
* Cliente o institucion: InvestigapyRM / paquete de replicacion para DADOS
* Ruta local: `/tmp/evalua_articulos_cientificos_target`
* Repositorio: `https://github.com/investigapyrm/evalua_articulos_cientificos`
* URL publica: `https://investigapyrm.github.io/evalua_articulos_cientificos/`
* Responsable: Codex con supervision de Diego
* Version: main

### Objetivo de la intervencion

* Quitar la nota redundante de metricas del sitio publico y agregar una segunda vista de auditoria que muestre el protocolo de botones y conduzca al guardado de nuevos juzgamientos.

### Diagnostico inicial

* La portada publica seguia mostrando un texto largo bajo los KPIs que no aportaba informacion nueva.
* El sitio publicado no dejaba visible el panel con botones A/B/C/D ni orientaba bien a un nuevo auditor sobre como registrarse y guardar ensayos.
* La app de Apps Script ya guardaba calificaciones, pero el ingreso seguia dependiendo de un `prompt` y no tomaba bien el caso seleccionado desde Pages.

### Acciones realizadas

* Se actualizo `index.html` para:
  * retirar la nota explicativa larga de metricas;
  * agregar botones `Panel auditor` y `App de auditoria`.
* Se actualizo `app.js` para:
  * abrir un caso especifico via `?case=`;
  * agregar `Ensayar este caso` y `Auditar con guardado` en el panel de detalle.
* Se agregaron `auditor.html`, `auditor.js` y `site-config.js` para una segunda vista publica de auditoria con:
  * registro local de auditor;
  * botones A/B/C/D visibles;
  * guardado local por navegador;
  * exportacion CSV;
  * enlace a la web app central de Apps Script.
* Se actualizaron `apps_script/Index.html` y `apps_script/styles.html` para:
  * reemplazar el alta por `prompt` por una pantalla de registro;
  * aceptar `?revisor=` y `?pdf_id=` desde la URL;
  * mantener el lenguaje visible en `referencia`.
* Se ajustaron `README.md` y `DEPLOY.md` para documentar la nueva superficie `auditor.html`.

### Archivos modificados

* `index.html`
* `app.js`
* `auditor.html`
* `auditor.js`
* `site-config.js`
* `apps_script/Index.html`
* `apps_script/styles.html`
* `README.md`
* `DEPLOY.md`
* `BITACORA.md`

### Comandos o scripts ejecutados

* `node --check app.js`
* `node --check auditor.js`
* `python3 -m http.server 8019`
* `npx playwright screenshot --browser=chromium --viewport-size=1440,2200 http://127.0.0.1:8019/ /tmp/califica_public_20260617.png`
* `npx playwright screenshot --browser=chromium --viewport-size=1440,2200 http://127.0.0.1:8019/auditor.html /tmp/califica_auditor_20260617.png`

### Resultados verificados

* La vista publica ya no muestra la nota larga de metricas.
* La portada publica ofrece acceso directo al panel auditor y a la app central de guardado.
* `auditor.html` expone el protocolo A/B/C/D, registro local, guardado local y exportacion CSV.
* La app central queda preparada para abrir con auditor y caso preseleccionado una vez que se vuelva a publicar la web app de Apps Script.

### Pruebas realizadas

* Validacion sintactica de `app.js` y `auditor.js`.
* Verificacion visual local de `index.html` y `auditor.html` con capturas Playwright.

### Pendientes

* Empujar este ajuste a `main`.
* Esperar propagacion de GitHub Pages y confirmar que sirva `auditor.html`.
* Publicar de nuevo la web app de Apps Script para activar el nuevo registro visual y los query params.

### Riesgos

* `auditor.html` guarda ensayos en el navegador local; no sustituye por si sola la base central en Google Sheets.
* La mejora de la app de Apps Script no queda operativa hasta hacer `clasp push` y nueva implementacion.

### Recomendaciones

* Mantener dos superficies claramente separadas: evidencia publica en Pages y captura central en Apps Script.
* Si cambia la URL de la app central, actualizar solo `site-config.js`.

## 2026-06-17 08:32

### Objetivo de la intervencion

* Quitar la duplicacion de los botones de juzgamiento en el panel lateral de `auditor.html`.

### Diagnostico inicial

* La vista `auditor.html` mostraba el protocolo A/B/C/D dos veces: una maqueta en la barra lateral y el formulario real en el panel principal.

### Acciones realizadas

* Se elimino del sidebar la seccion `Botones de juzgamiento`.
* Se mantuvo el formulario operativo de juzgamiento solamente en la zona principal del caso.

### Archivos modificados

* `auditor.html`

### Resultados verificados

* La vista auditor ya no repite el protocolo en el lateral.
* El usuario conserva registro, avance, cola de casos y el formulario principal sin ruido duplicado.

## 2026-06-17 09:05

### Objetivo de la intervencion

* Garantizar que los auditores externos de la revista puedan usar la appweb sin bloqueo por permisos de Google.

### Diagnostico inicial

* La URL de Apps Script seguia protegida y devolvia `403` para accesos externos.
* La portada publica y la vista auditora todavia incluian accesos hacia esa app restringida.
* Faltaba una forma nativa de importar guardados en otra maquina sin depender de login.

### Acciones realizadas

* Se desactivo el uso publico de `centralAuditorUrl` en `site-config.js`.
* Se simplifico la portada publica para que el flujo externo apunte solo a `auditor.html`.
* Se retiro del detalle de cada caso el enlace a la app restringida.
* Se actualizo `auditor.html` para:
  * copiar enlace del auditor;
  * copiar enlace del caso;
  * exportar e importar guardados CSV;
  * explicitar que funciona sin login.
* Se actualizo `auditor.js` para:
  * importar CSV;
  * precargar `reviewer` y `case` desde la URL;
  * operar completamente en Pages sin depender de Apps Script.
* Se ajustaron `README.md` y `DEPLOY.md` para documentar este modo de acceso publico sin login.

### Archivos modificados

* `site-config.js`
* `index.html`
* `app.js`
* `auditor.html`
* `auditor.js`
* `README.md`
* `DEPLOY.md`
* `BITACORA.md`

### Resultados verificados

* La portada publica ya no dirige al GAS restringido.
* `auditor.html?reviewer=Auditor%20Revista&case=335` carga correctamente y muestra el flujo de juzgamiento completo.
* La appweb publica ya exporta e importa CSV para continuidad entre equipos.

### Pruebas realizadas

* `node --check app.js`
* `node --check auditor.js`
* capturas Playwright de portada y `auditor.html` con auditor prellenado

### Riesgos

* El guardado para auditores externos sigue siendo local al navegador hasta consolidar manualmente los CSV.

### Recomendaciones

* Enviar a revisores externos enlaces directos de `auditor.html` con `reviewer=` y, si corresponde, `case=`.
* Usar la app de Apps Script solo como superficie interna o administrativa mientras mantenga restricciones de acceso.
