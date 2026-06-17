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
