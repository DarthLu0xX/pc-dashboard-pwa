// Configuración de la PWA.
// Ya no hay token público: se entra con contraseña (ver PWA_CLAVES en
// dashboard/views.py) y el servidor entrega una sesión que se guarda en el celular.
window.PC_CONFIG = {
  API_BASE: 'https://lu34.pythonanywhere.com',
  VERSION: '6.1.0',
};
