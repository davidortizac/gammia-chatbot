// Configuración centralizada para conectar React con el Orquestador GammIA en GCP

export const API_CONFIG = {
    // La URL de Cloud Run donde vive el motor de Inteligencia Artificial
    BASE_URL: "https://gammia-api-1028680563477.us-central1.run.app",
    
    // Mock Token que engaña temporalmente al backend haciéndole creer 
    // que la petición proviene de un usuario logueado en la intranet
    MOCK_AUTH_TOKEN: "GAMMA_MOCK_ADMIN_TOKEN_999",

    getHeaders: () => ({
        "Content-Type": "application/json",
        "Authorization": `Bearer GAMMA_MOCK_ADMIN_TOKEN_999`
    })
};
