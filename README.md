# Tablero PC Magdalena Contreras (PWA)

Tablero de **solo lectura**, pensado para celular, con los reportes operativos y médicos del sistema Django de Protección Civil (`lu34.pythonanywhere.com`). Se instala en la pantalla de inicio y se abre como app (sin barra del navegador). Funciona sin internet mostrando los últimos datos descargados.

- Estático (HTML/CSS/JS, sin build), pensado para GitHub Pages.
- Diseño basado en el mockup de Stitch (`Downloads\stitch_dashboard_pc_magdalena_contreras.zip`).
- Pestañas: Operativo · Médico · Opiniones (próximamente) · Info.

## Datos

Lee dos rutas propias del Django (sección 19 de `dashboard/views.py`, independiente del bot de WhatsApp) con el token de solo lectura de `config.js` (`PWA_TOKEN`, distinto al del bot).

- `/api/pwa/catalogo/` — colonias oficiales, categorías operativas y tablas médicas (filtros).
- `/api/pwa/resumen/?modulo=operativo|medico&fecha_inicio=&colonia=&tipo=` — totales, top colonias, tipos, turnos, unidades y últimos 10 servicios (sin edad/sexo del paciente).

## Probar en local

```
python -m http.server 8795        # en esta carpeta
```

Con el Django local corriendo en `127.0.0.1:8011`, abrir
`http://127.0.0.1:8795/?api=http://127.0.0.1:8011&periodo=todo`.
`?api=` (vacío) regresa al servidor normal.

## Publicar cambios

Subir `CACHE` en `sw.js` y el `?v=` de `index.html`/`sw.js` en cada cambio para que los celulares bajen la versión nueva.
