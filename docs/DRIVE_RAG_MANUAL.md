# GammIA Platform — Manual de Gestión RAG y Base de Conocimiento

> **Versión:** 2.0 · **Actualizado:** Abril 2026  
> **Componente:** `app/rag/` · Motor: pgvector + GIN full-text (Hybrid Search con RRF)

---

## 1. Arquitectura del RAG

GammIA usa un **Hybrid Search** que combina búsqueda semántica y búsqueda léxica para máxima precisión:

```
Pregunta del usuario
        │
        ├─── Búsqueda semántica ──► pgvector HNSW (cosine distance)
        │    (embedding con                  │
        │     gemini-embedding-001)           │
        │                                    ▼
        │                          Reciprocal Rank Fusion (RRF)
        │                            score = Σ 1/(60 + rank_i)
        │                                    ▲
        ├─── Búsqueda léxica ─────► GIN index + tsvector (español)
             (plainto_tsquery)               │
                                    Top K fragmentos fusionados
                                             │
                                    System Prompt + Contexto RAG
                                             │
                                    Gemini genera respuesta final
```

**RBAC por tags:** Cada fragmento tiene uno o más tags. El filtro se aplica antes de la búsqueda:

- Contexto `public` → solo documentos con tag `public`
- Contexto `internal` → acceso a todos los documentos
- Agente con `rag_tags` → solo documentos que compartan al menos un tag con el agente (ej: `iris-rrhh` con tags `["rrhh","policies"]` solo lee esos documentos)

---

## 2. Sistema de tags

Los tags son la unidad de control de acceso y organización del conocimiento.

### Tags del sistema (predefinidos)

| Tag | Propósito |
|---|---|
| `public` | Visible en el widget público (web corporativa). Sin este tag, el documento solo es accesible internamente. |
| `general` | Conocimiento general de Gamma. Visible para todos los agentes internos. |
| `internal` | Solo contexto interno (intranet). |
| `portfolio` | Portafolio de servicios y soluciones. |
| `solutions` | Soluciones técnicas específicas. |
| `services` | Catálogo de servicios. |
| `policies` | Políticas y procedimientos corporativos. |
| `csoc` | Conocimiento del Centro de Operaciones de Seguridad. |
| `cx` | Customer Experience. |
| `cux` | Customer & User Experience. |
| `marketing` | Material y estrategia de marketing. |
| `Project_manager` | Metodologías y gestión de proyectos. |

### Tags personalizados

Se pueden crear tags adicionales desde el panel admin (RAG Brain → Tags). Por ejemplo, para los agentes de Iris: `rrhh`, `finanzas`, `legal`, `operaciones`.

### Regla de visibilidad

Un documento con tags `["rrhh", "policies"]` será visible para:
- El agente `iris-rrhh` (si tiene `rag_tags: ["rrhh"]`)
- El agente `iris-legal` (si tiene `rag_tags: ["policies"]`)
- Cualquier agente interno sin filtro de tags
- **No visible** en contexto público (no tiene el tag `public`)

---

## 3. Subir documentos al RAG

### 3.1 Desde el panel admin (recomendado)

1. Ir al panel admin → **RAG Brain**
2. Pestaña **Documentos**
3. Arrastrar o seleccionar el archivo (PDF, DOCX, XLSX, PPTX)
4. Asignar tags según el tipo de contenido y área de acceso
5. Clic en **"Indexar"**

El pipeline hace automáticamente:
- Extracción de texto del archivo
- Segmentación en chunks (~1000 caracteres con overlap)
- Generación de embeddings con `gemini-embedding-001` (vector 3072 dims)
- Inserción en `document_nodes` con los tags asignados
- Actualización del índice HNSW y GIN full-text

### 3.2 Vía API (para automatizaciones)

```bash
curl -X POST https://gammia-api-1028680563477.us-central1.run.app/api/v1/rag/upload \
  -H "Authorization: Bearer <token_admin>" \
  -F "file=@politica-vacaciones-2026.pdf" \
  -F 'tags=["rrhh","policies","internal"]' \
  -F "title=Política de Vacaciones 2026"
```

Respuesta exitosa:

```json
{
  "ok": true,
  "doc_id": "politica-vacaciones-2026-pdf",
  "chunks_created": 12,
  "title": "Política de Vacaciones 2026"
}
```

### 3.3 Sincronización desde Google Drive

Para sincronizar una carpeta completa de Drive:

**Prerrequisito:** La Service Account de GCP debe tener acceso de Lector a la carpeta.

1. Ir al panel admin → **RAG Brain** → pestaña **Drive Sync**
2. Pegar el ID de la carpeta de Google Drive (de la URL: `drive.google.com/drive/folders/ESTE_ID`)
3. Seleccionar los tags a asignar a todos los archivos sincronizados
4. Clic en **"Sincronizar Carpeta"**

O vía API:

```bash
curl -X POST /api/v1/rag/sync-drive \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"folder_id": "1AbCdEfGhIjK", "tags": ["internal", "general"]}'
```

### 3.4 Formatos soportados

| Formato | Extensión | Notas |
|---|---|---|
| PDF | `.pdf` | Texto e imágenes con OCR básico |
| Word | `.docx` | Extrae texto y tablas |
| Excel | `.xlsx` | Extrae texto de celdas |
| PowerPoint | `.pptx` | Extrae texto de diapositivas |
| URL web | URL | Extrae el texto visible de la página |

---

## 4. Actualizar un documento existente

Para actualizar el contenido de un documento sin cambiar su `doc_id`:

1. Eliminar el documento actual: panel admin → RAG Brain → buscar el documento → icono de papelera
2. Volver a subirlo con el mismo título y tags

El sistema usa `doc_id` (derivado del nombre del archivo) para detectar duplicados. Si el hash del contenido cambió, elimina los chunks anteriores e inserta los nuevos con `version + 1`.

---

## 5. Estrategia de tagging para agentes Iris

Cada instancia de Iris debe leer solo el conocimiento de su área. Convención recomendada:

```
Agente: iris-rrhh
rag_tags: ["rrhh", "policies", "general"]

Documentos de RRHH deben tener tag "rrhh":
  - Manual del empleado        → tags: ["rrhh", "internal"]
  - Política de vacaciones     → tags: ["rrhh", "policies", "internal"]
  - Procedimiento de nómina    → tags: ["rrhh", "internal"]

Documentos generales (compartidos con todos los agentes internos):
  - Presentación corporativa   → tags: ["general", "internal"]
  - Organigrama                → tags: ["general", "internal"]
```

De esta forma `iris-rrhh` solo accede a documentos de RRHH + los generales, y nunca ve documentos de CSOC o Finanzas.

---

## 6. Monitoreo del RAG

### Ver el estado del índice vectorial

```sql
-- Número de documentos activos por tag
SELECT unnest(tags) as tag, count(*) as chunks
FROM document_nodes
WHERE active = 1
GROUP BY tag
ORDER BY chunks DESC;

-- Documentos sin embedding (pendientes de indexar)
SELECT id, title, doc_id FROM document_nodes
WHERE embedding IS NULL AND active = 1;
```

### Métricas en el panel admin

El **Dashboard** muestra en tiempo real:
- Total de vectores activos en el índice
- Interacciones totales del sistema
- Tokens consumidos (proxy del costo de Gemini)
- Latencia promedio de respuesta

### Calidad de las respuestas del RAG

Si GammIA o Iris responden con información incorrecta o desactualizada:

1. Identificar el documento fuente (el campo `source` en la respuesta indica `rag_public` o `rag_internal`)
2. Buscar el documento en RAG Brain por título o contenido
3. Eliminarlo y volver a subir la versión correcta con los tags adecuados
4. Verificar que el nuevo documento tiene el tag correcto para el contexto donde falló

---

## 7. Índices de base de datos

La tabla `document_nodes` tiene tres índices para la búsqueda híbrida:

| Índice | Tipo | Campo | Uso |
|---|---|---|---|
| `idx_document_nodes_embedding_hnsw` | HNSW (pgvector) | `embedding` | Búsqueda semántica por coseno |
| `idx_document_nodes_content_gin` | GIN | `content_tsv` | Búsqueda léxica full-text en español |
| `idx_document_nodes_doc_id` | B-tree | `doc_id` | Lookups por documento |

El índice HNSW puede no crearse si los vectores superan 2000 dimensiones en versiones antiguas de pgvector. En ese caso la búsqueda semántica cae a un scan secuencial (más lento pero funcional).

---

## 8. Límites y recomendaciones

| Parámetro | Valor actual | Ajustable en |
|---|---|---|
| `rag_top_k` (chunks recuperados) | 15 | Widget Config o por agente |
| Chunk size | ~1000 chars | `app/rag/pipeline.py` |
| Chunk overlap | 200 chars | `app/rag/pipeline.py` |
| Dimensión del embedding | 3072 | gemini-embedding-001 (fijo) |
| Documentos por sync de Drive | Sin límite | — |

**Recomendaciones:**
- Usar `rag_top_k = 10-15` para respuestas rápidas. Aumentar a 20+ para preguntas muy específicas donde se necesita más contexto.
- Documentos muy largos (>50 páginas) se fragmentan en muchos chunks. Considerar dividirlos por sección temática para mejorar la relevancia.
- Asignar siempre al menos un tag de área además del tag de visibilidad (`public` o `internal`). Un documento con solo `["internal"]` es accesible para todos los usuarios internos pero ningún agente con `rag_tags` específicos lo verá.
