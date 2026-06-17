# Arquitectura

```
┌────────────────────────────┐         ┌──────────────────────────┐
│  Google Drive              │         │  Google Sheet privado    │
│  - carpeta con 346 PDFs    │         │  - hoja "auditables"     │
│  - articulos_auditables_   │         │      (346 filas, ground  │
│    346.csv                 │         │       truth IA)          │
└─────────────┬──────────────┘         │  - hoja "calificaciones" │
              │                        │      (calificaciones     │
              │ DriveApp.getFileById   │       humanas, append)   │
              ▼                        └──────────┬───────────────┘
       ┌─────────────────────────────────────────┘
       │
┌──────┴────────────────────────────────────────────┐
│  Apps Script Web App                              │
│  - Code.gs        (backend: getSiguientePDF,      │
│                    submitCalificacion,            │
│                    getEstadisticas)               │
│  - Index.html     (UI doble panel: PDF + form)    │
│  - DashboardStats.html (acuerdo, kappa, matriz)   │
│  - styles.html                                    │
└──────────────────┬────────────────────────────────┘
                   │ HTTPS (URL de la web app)
                   ▼
              ┌─────────┐
              │ Browser │
              │  (vos)  │
              └─────────┘
```

## Flujo de doble ciego

1. `getSiguientePDF()` filtra los 346 auditables menos los ya presentes en
   `calificaciones`, devuelve el siguiente. **No** devuelve `A_ia`, `B_ia`, `C_ia` ni
   `veredicto_ia` — el front nunca los ve antes del submit.
2. Usuario califica A, B, C, D y notas. Submit.
3. `submitCalificacion(payload)` guarda en `calificaciones` (incluyendo las cifras IA
   en columnas separadas para análisis posterior) y devuelve el contraste.
4. El front renderiza el contraste y un botón "Siguiente PDF" que vuelve al paso 1.

## Persistencia

Cada calificación humana es una fila en la hoja `calificaciones` con:

| Campo | Tipo |
|---|---|
| `timestamp` | datetime |
| `pdf_id` | int |
| `pdf_nombre` | string |
| `A_humano`, `B_humano`, `C_humano` | 0/1 |
| `D_humano` | string (4 categorías) |
| `notas` | string libre |
| `A_ia`, `B_ia`, `C_ia` | 0/1 (copia de la base IA) |
| `veredicto_ia` | string (categoría IA) |

## Métricas

`getEstadisticas()` calcula sobre la hoja `calificaciones`:

- **Acuerdo simple** por dimensión: proporción de filas donde humano y IA coinciden.
- **Cohen's kappa** sobre la categórica D:
  - `pO` = acuerdo observado (suma de la diagonal de la matriz / total).
  - `pE` = acuerdo esperado por azar (producto de marginales).
  - `kappa = (pO − pE) / (1 − pE)`.
- **Matriz de confusión 4×4**: filas humano, columnas IA.

## Caching

Para evitar consultas repetidas a Drive, el lookup de cada PDF (`_buscarPDFEnDrive`)
usa `CacheService` con TTL de 6 horas. Si el archivo cambia de ubicación, se purga
solo o forzar `cache.removeAll()` desde el editor.

## Rate limits

Apps Script tiene límites de cuota diaria (https://developers.google.com/apps-script/guides/services/quotas):

- Tiempo máximo de ejecución por llamada: 6 minutos.
- Operaciones de lectura/escritura en Sheet: ~10.000/día.

Para single-user califciando 346 artículos, ningún límite es relevante.
