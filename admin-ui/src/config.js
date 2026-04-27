// Configuración centralizada de API para el panel admin GammIA
//
// En producción Docker: VITE_API_URL="" (vacío) → las llamadas van a rutas
// relativas (/api/...) y nginx hace proxy al backend configurado en BACKEND_URL.
//
// En desarrollo local (npm run dev): VITE_API_URL="" también funciona gracias
// al proxy de Vite configurado en vite.config.js.

const TOKEN_KEY = 'gammia_admin_token';

export const API_CONFIG = {
    BASE_URL: import.meta.env.VITE_API_URL || "",

    getToken: () => localStorage.getItem(TOKEN_KEY) || "",

    getHeaders: () => ({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}`,
    }),
};
