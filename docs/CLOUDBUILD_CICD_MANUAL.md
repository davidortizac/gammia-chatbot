# Manual de CI/CD: Estandarización Google Cloud Build (GammIA)

Este documento instruye al equipo de DevOps sobre cómo operar y mantener las reglas de Despliegue e Integración Continua (CI/CD) de GammIA dentro del marco arquitectónico provisto por `cloudbuild.yaml`.

## Introducción al Flujo (Zero-Downtime)
Cloud Build es el motor nativo Serverless de ejecución en GCP. Al fusionarlo con nuestro repositorio de GitHub, **cada vez que un desarrollador hace un "Push", Cloud Build enciende contenedores efímeros** que construyen, prueban, aprovisionan (Terraform) y suben en vivo la nueva versión con cero caída de servicio.

---

## 1. Funcionamiento del Pipeline (`cloudbuild.yaml`)
El archivo maestro en el root realiza los siguientes pasos secuenciales:

1. **Test y QA de Python:** Levanta un entorno en blanco para medir si el código FastAPI o Langchain rompe alguna dependencia.
2. **Build Docker:** Convierte la aplicación a un contenedor sellado, tagueado con el `${COMMIT_SHA}` exacto de Github para trazabilidad perfecta.
3. **Artifact Registry:** Guarda la imagen compilada centralizadamente.
4. **Terraform (Infra as Code)**: Viaja automáticamente a la carpeta `deploy/terraform/{_ENV}` e inyecta la infraestructura.
5. **Cloud Run:** Ordena a los servidores que descarguen la nueva imagen compilada y corten el tráfico viejo (Blue/Green Deployment) enviándolo a la nueva versión segura.

---

## 2. Instrucciones de Configuración Inicial (Para el Administrador DevOps)

Para que GCP "lea" tu repositorio automáticamente y ejecute `cloudbuild.yaml`, debes hacer esto una única vez:

### Paso A: Conectando GitHub a GCP
1. Ve a la consola web de **Google Cloud (GCP) -> Cloud Build -> Triggers**.
2. Dale clic a "Connect Repository" y vincula tu GitHub.

### Paso B: Creando los 3 Triggers (Dev, Test, Prod)
Crearás TRES disparadores, cada uno anclado a un "Branch" distinto de git.
- **Trigger Dev:** Configurado para saltar cuando se haga push en el branch `/dev`. 
  Lanzará una variable fundamental de Substitución: `_ENV=dev`.
- **Trigger Test:** Reacciona al branch `/test`. Substitución: `_ENV=test`.
- **Trigger Producción:** Por estricta gobernanza, **NO** arranca automático en "push". Debe requerir "Aprobación Manual" en la interfaz. Reacciona a `/master`. Substitución: `_ENV=prod`.

### Paso C: Secret Manager Obligatorio
El Cloud Build NO debe tener contraseñas hardcodeadas. Nuestro YAML requiere leer de secretos.
1. Ve a **Secret Manager**.
2. Crea el secreto `gammia-db-pass`.
3. Da permisos al correo del Cloud Build Service Account para que sea "Secret Accessor". *Sin esto, el paso de Terraform fallará.*

---

## 3. Manejo de Multi-Ambiente y Arquitectura de Carpetas Terraform

Debido al diseño modular que aplicamos, el código de IaC está particionado para evitar catástrofes:
- `deploy/terraform/dev/` => Usa instancias muy baratas (`db-f1-micro`). Usa una VPC diferente (`dev-gamma-vpc`). Las pruebas y borrados aquí no dañan el negocio.
- `deploy/terraform/prod/` => Contiene configuración `High Availability` en Postgresql (`db-custom-4-15360`), protección contra eliminación accidental (deletion_protection=true) y redes segmentadas más complejas.

El pipeline es inteligente; dependiendo de qué Trigger ejecute (`_ENV`), usará los archivos de una de esas carpetas.

---

## 4. Rollbacks (Salida de Emergencia)
Si el código subido en la interfaz del Agente introdujo alucinaciones incontrolables:
1. Entra a **Google Cloud Run**.
2. Ve al servicio afectado (`gammia-backend-prod`).
3. Ve a la pestaña **Revisiones** (Revisions).
4. Dale clic directo a "Manage Traffic" y devuelve el 100% del tráfico a la revisión del día anterior. La corrección se hace en 2 segundos absolutos, dando respiro para revisar GammIA en Desarrollo.
