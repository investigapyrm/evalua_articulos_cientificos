# Despliegue

Esta guía permite desplegar una copia propia de la aplicación en Google Apps Script.

## 1. Requisitos

- Cuenta de Google.
- Carpeta de Google Drive con los PDF que serán revisados.
- Node.js instalado.
- `clasp`, la CLI oficial de Google Apps Script.

```bash
npm install -g @google/clasp
clasp login
```

Antes de usar `clasp`, habilitar la API de Apps Script en:

```text
https://script.google.com/home/usersettings
```

## 2. Clonar el repositorio

```bash
git clone https://github.com/investigapyrm/evalua_articulos_cientificos.git
cd evalua_articulos_cientificos/apps_script
```

## 3. Crear proyecto Apps Script

```bash
clasp create --type webapp --title "evalua_articulos_cientificos"
clasp push -f
```

El comando genera un archivo `.clasp.json` local. Ese archivo contiene el `scriptId` y no debe publicarse.

## 4. Configurar `Code.gs`

En `apps_script/Code.gs`, completar:

```javascript
const FOLDER_ID = 'PEGAR_FOLDER_ID_DE_DRIVE';
const SHEET_ID = 'PEGAR_SHEET_ID';
```

El `FOLDER_ID` corresponde a la carpeta de Google Drive donde se alojan los PDF. El `SHEET_ID` se obtiene después de ejecutar `setup_inicial()`.

La constante `CSV_URL` apunta por defecto al archivo público:

```text
data/articulos_auditables_346.csv
```

Si se usa otro corpus, se puede reemplazar por una URL RAW propia.

## 5. Ejecutar inicialización

Abrir el proyecto:

```bash
clasp open
```

En el editor de Apps Script, seleccionar y ejecutar:

```javascript
setup_inicial()
```

La primera ejecución solicita permisos de Drive, Sheets y UrlFetch. Al finalizar, el log muestra el ID del Google Sheet creado. Copiar ese valor en `SHEET_ID`, guardar y volver a subir:

```bash
clasp push -f
```

## 6. Token administrativo opcional

Algunas funciones de mantenimiento se ejecutan mediante endpoint administrativo. Para habilitarlas, crear una propiedad de script:

```text
ADMIN_TOKEN = un_token_largo_y_privado
```

No escribir ese token directamente en el código fuente.

## 7. Publicar la Web App

En Apps Script:

1. Implementar.
2. Nueva implementación.
3. Tipo: Aplicación web.
4. Ejecutar como: Yo.
5. Acceso: según política del proyecto.

La URL generada puede agregarse manualmente al `index.html` público del repositorio si se desea mostrar un botón de acceso.

## 8. Actualizaciones

Para subir cambios locales:

```bash
clasp push -f
```

Para bajar cambios realizados en el editor web:

```bash
clasp pull -f
```

## Nota sobre datos y PDFs

Este repositorio no distribuye los archivos PDF. La aplicación los busca por nombre dentro de la carpeta configurada en `FOLDER_ID`. El archivo CSV debe contener, como mínimo, las columnas esperadas por la app, incluyendo `pdf_id` y `pdf_nombre`.
