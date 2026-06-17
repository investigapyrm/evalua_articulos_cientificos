## 2026-06-17 04:15

### Proyecto

* Nombre: evalua_articulos_cientificos
* Cliente o institucion: InvestigapyRM / paquete de replicacion para DADOS
* Ruta local: `/tmp/evalua_articulos_cientificos_target`
* Repositorio: `https://github.com/investigapyrm/evalua_articulos_cientificos`
* URL publica: `https://investigapyrm.github.io/evalua_articulos_cientificos/`
* Responsable: Codex con supervision de Diego
* Version: main

### Objetivo de la intervencion

* Alinear el despliegue publico oficial con la version verificable que expone los 346 casos y sus PDFs anonimizados.

### Diagnostico inicial

* GitHub Pages estaba activo en la URL oficial, pero seguia mostrando una portada antigua.
* La app verificable mas completa habia sido publicada en otro repositorio.
* La documentacion y algunos enlaces internos todavia apuntaban al repo anterior.

### Acciones realizadas

* Se clono `investigapyrm/evalua_articulos_cientificos` y se sincronizaron los archivos de la app publica vigente.
* Se incorporaron `app.js`, `public_data/`, `anonymized_pdfs/` y `scripts/`.
* Se actualizaron `README.md`, `DEPLOY.md`, `index.html`, `apps_script/Code.gs` y `docs/arquitectura.md` para apuntar al repo oficial.
* Se reemplazo el enlace autoreferencial del `index.html` por el manifiesto publico de anonimización.
* Se vaciaron `FOLDER_ID` y `SHEET_ID` en `apps_script/Code.gs` para no publicar IDs operativos privados.

### Archivos modificados

* `.gitignore`
* `README.md`
* `DEPLOY.md`
* `index.html`
* `app.js`
* `apps_script/Code.gs`
* `docs/arquitectura.md`
* `public_data/anonymized_pdf_manifest.csv`
* `public_data/anonymized_pdf_manifest.json`
* `public_data/auditables_346.json`
* `anonymized_pdfs/*.pdf`
* `scripts/anonymize_public_pdfs.py`
* `scripts/build_public_catalog.py`
* `BITACORA.md`

### Comandos o scripts ejecutados

* `git clone --depth 1 https://github.com/investigapyrm/evalua_articulos_cientificos.git /tmp/evalua_articulos_cientificos_target`
* `curl -I -L https://investigapyrm.github.io/evalua_articulos_cientificos/`
* `rsync -av --delete ... califica_articulos_inferenciales/ /tmp/evalua_articulos_cientificos_target/`
* Verificaciones con `rg`, `diff`, `git status` y `python3 -m http.server`

### Resultados verificados

* El catalogo JSON contiene `346` registros.
* Los `346` registros tienen `pdf_is_anonymized = true`.
* Se generaron `346` PDFs en `anonymized_pdfs/`.

### Pruebas realizadas

* Verificacion HTTP de la URL publica oficial.
* Validacion de conteo de registros y PDFs anonimizados desde `public_data/auditables_346.json`.
* Revision de enlaces y referencias de repositorio en archivos clave.

### Errores o incidentes

* El entorno no tenia `gh`; se trabajo con `git` y `curl`.
* La copia inicial arrastro una bitacora del repo anterior; se reemplazo por una bitacora propia del repo oficial.

### Soluciones aplicadas

* Se adopto una publicacion centrada solo en PDFs anonimizados para el sitio abierto.
* Se dejaron los IDs de Apps Script vacios para evitar exponer configuracion operativa.

### Pendientes

* Hacer commit y push al repo oficial.
* Esperar la actualizacion de GitHub Pages y verificar la URL final.
* Revisar manualmente 2 o 3 PDFs de una sola pagina marcados para revision adicional.

### Riesgos

* GitHub Pages puede tardar algunos minutos en reflejar el push.
* Los 3 casos de una sola pagina siguen dependiendo de una revision manual complementaria si se exige anonimización extrema.

### Recomendaciones

* Mantener el manifiesto de anonimización como evidencia publica adjunta al resometimiento.
* No volver a publicar PDFs originales en la URL abierta.
