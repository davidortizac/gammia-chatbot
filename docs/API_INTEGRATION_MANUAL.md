# GammIA - Manual de Integración API (Frontend / UX)

Este documento guía a los desarrolladores de UI/UX en cómo consumir el backend de GammIA desde JavaScript (Web Pública e Intranet).

## 1. Autenticación y Seguridad

GammIA rutea las respuestas según el nivel de autorización del cliente:
- **Intranet:** Debe inyectar un **Bearer Token** en las cabeceras. Este token es emitido directamente por Google Workspace (vía Identity Aware Proxy u OAuth2 estándar).
- **Web (Pública):** Aunque la Web es pública, la llamada a la API debe estar blindada con un token temporal o estar enrutada a través del backend del servidor web en lugar de llamarse directamente desde el browser, para prevenir *Bot-nets*.

---

## 2. Consumo del Endpoint Principal de Chat

**URL:** `POST <HOST_API>/api/v1/chat?query=<texto>`

**Headers Básicos Requeridos:**
```http
Content-Type: application/json
Authorization: Bearer <TOKEN> # Si aplica
```

### Ejemplo Práctico (JavaScript - `fetch`)

Este es un componente estándar para usar React, Vue o Vanilla JS.

```javascript
async function interrogarGammia(preguntaDelUsuario, esInterno, googleToken) {
    try {
        const urlRequest = new URL('https://api.gammaingenieros.com/api/v1/chat');
        urlRequest.searchParams.append('query', preguntaDelUsuario);

        const config = {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                // Omitir si es llamado anónimo en un flujo público seguro
                'Authorization': esInterno ? `Bearer ${googleToken}` : '' 
            }
        };

        const respuesta = await fetch(urlRequest, config);

        if (respuesta.status === 400) {
            throw new Error("Violación de política detectada. El Bot te ha bloqueado.");
        }
        
        if (respuesta.status === 401) {
            throw new Error("Sesión expirada o no autorizada.");
        }

        const data = await respuesta.json();
        
        // Manejar el renderizado
        console.log("Respuesta de GammIA:", data.response);
        console.log("Fuente Consultada (Analítica):", data.source);

        return data.response;

    } catch (error) {
        console.error("GammIA Falló:", error);
        // Retornar mensaje visual seguro en la UI
        return "Lo siento, GammIA se encuentra blindando la red actualmente. Intenta luego.";
    }
}
```

---

## 3. Códigos de Estado y Manejo en UI

Toda la UX generada debe estar preparada para atajar los siguientes códigos `HTTP`:
| Código | Significado | Acción UX recomendada |
|--------|-------------|-------------------------|
| `200` | Éxito | Mostrar mensaje de *escribiendo...* y luego imprimir `data.response`. |
| `400` | Guardrail Activado | Mostrar error: *"Ese tema vulnera nuestras directrices organizacionales."*. Redirigir la UX al inicio. |
| `401` | Token Inválido o Ausente | Si es Intranet, forzar refesh del Sign-In de Google. Si es Web Pública, reportar anomalía de CORS. |
| `422` | Validation Error | Faltó el parámetro `query`. Re-validar input vacío en front. |

## 4. Analítica Comercial

La API registra cada latencia, token y fuente de manera automática ("the smart way"). No es necesario que envíes telemetría desde el frontend. El propio FastAPI registrará el ID de usuario desde el Token JWT para reportar dashboards a Gerencia.
