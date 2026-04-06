# UCES · Próximas Entregas

App web simple para cualquier estudiante de UCES, pensada para organizar materias, actividades y fechas de cierre desde una sola interfaz.

## Qué hace

- Permite agregar y quitar materias libremente.
- Permite cargar actividades con materia, fecha y hora.
- Muestra cuáles están próximas, vencidas o completadas.
- Guarda la información en el navegador (`localStorage`).
- Puede mostrar notificaciones del navegador para entregas cercanas.
- Soporta importación desde una extensión para leer las próximas entradas desde la sección `ACTIVIDADES` o desde las unidades de cada materia en Campus UCES, filtrando solo las que tengan fecha de cierre o vencimiento visible.

> Nota: las notificaciones funcionan mientras la app está abierta en `localhost`.

## Cómo usarla

1. Abrí una terminal en esta carpeta.
2. Ejecutá:

```powershell
py -m http.server 3000
```

3. Abrí `http://localhost:3000`
4. Presioná **Activar notificaciones**.
5. Cargá tus entregas reales.

## Extensión para importar desde Campus UCES

Dentro de la carpeta `uces-campus-extension/` quedó una extensión para Chrome/Edge que:

1. se usa estando logueado en Campus UCES,
2. toma solo las actividades visibles de la sección `ACTIVIDADES` o de las unidades de cada materia,
3. filtra las próximas,
4. y las envía a esta app automáticamente.

### Instalación rápida

1. Abrí `chrome://extensions/` o `edge://extensions/`
2. Activá **Modo desarrollador**
3. Elegí **Cargar descomprimida**
4. Seleccioná la carpeta `uces-campus-extension`
5. Abrí tu Campus UCES en una `unidad` de la materia o en `ACTIVIDADES` y usá la extensión

> Si abrís la app con `file:///...`, habilitá también el acceso de la extensión a URLs locales.
>
> Después de cambiar el ícono de la extensión, usá **Recargar** en `chrome://extensions/` o `edge://extensions/` para verlo en la barra de herramientas.

## Archivos

- `index.html`: interfaz principal
- `styles.css`: estilos
- `app.js`: lógica de la app
- `uces-campus-extension/`: extensión de importación desde Campus UCES
