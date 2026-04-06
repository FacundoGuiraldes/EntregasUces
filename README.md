# UCES · Próximas Entregas

App web simple para llevar el control de entregas de:

- `Arquitectura en Computadoras`
- `Integración Tecnológico Académica`
- `Base de Datos I`
- `Programación I`
- `Diseño de Objetos`
- `Diseño de Interfaces`

## Qué hace

- Permite cargar actividades con materia, fecha y hora.
- Muestra cuáles están próximas, vencidas o completadas.
- Guarda la información en el navegador (`localStorage`).
- Puede mostrar notificaciones del navegador para entregas cercanas.

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

## Archivos

- `index.html`: interfaz principal
- `styles.css`: estilos
- `app.js`: lógica de la app
