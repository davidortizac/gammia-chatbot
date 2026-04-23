# GammIA - Gobernanza RAG con Google Drive

Este manual sirve a los administradores de Inteligencia Artificial para gobernar el conocimiento que GammIA lee a través de su base de datos vectorial (pgvector + LangChain), todo ello administrado fácilmente desde una Carpeta de Google Drive.

## Arquitectura de Ingesta

La arquitectura configurada asegura que **los analistas no saben de código**, solo de arrastrar archivos.
1. Se ha construido el pipeline en `app/rag/pipeline.py`.
2. Las fragmentaciones del texto se hacen solas mediante `langchain_text_splitters` (`chunk_size=1000`).
3. La incrustación vectorial mapea con el API key de Gemini vía `text-embedding-004`.

## Instrucciones para el Administrador de Drive

### 1. Preparar la Carpeta Maestra
1. Entra a tu Google Workspace corporativo.
2. Crea una carpeta compartida y nómbrala: `GammIA - Brain`.
3. Comparte esta carpeta en modo **Lector** con la Service Account de tu proyecto GCP (ej. `gammia-sa@gamma-ingenieros.iam.gserviceaccount.com`).

### 2. Flujo de Trabajo (Subiendo información)

**¿Cómo agregar nuevas políticas (PDF, DOCX)?**
Solo arrástralas y suéltalas en la carpeta `GammIA - Brain`. El webhook de Google Drive disparará un evento automático contra la API, desencadenando la indexación.

**¿Cómo actualizar un archivo existente?**
Google Drive maneja las versiones. Da clic derecho en el archivo de Google Drive -> **Administrar Versiones** -> **Subir versión nueva**.
- Esto garantiza que el "doc_id" se mantenga igual.
- El Pipeline de GammIA (`GammiaRAGPipeline`) detectará el cambio y realizará automáticamente un **Hard-Delete** de las versiones anteriores en la mente de la IA para luego insertar la nueva versión.

**¿Cómo eliminar por completo una política?**
Elimina el archivo de la carpeta. Esto disparará un Hook que destruirá definitivamente todos los vectores matemáticos vinculados en tu instancia de Cloud SQL.

## Monitoreo en Base de Datos
Todos estos archivos se mapean en la tabla SQL estructurada `document_nodes`. Los vectores obsoletos desaparecen solitos y se incrementa el contador `version` para evitar conflictos en la telemetría de las respuestas.
