export const generateClientId = (): string => {
    // A simple way to generate a somewhat unique client ID for the session
    return `client-${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36).substring(6)}`;
};