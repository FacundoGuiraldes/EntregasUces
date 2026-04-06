# UCES Importador de Actividades

Extensión local para Chrome/Edge que toma las actividades próximas desde la sección `ACTIVIDADES` de Campus UCES y las manda a la app web de este repositorio.

## Cómo instalar

1. Abrí `chrome://extensions/` o `edge://extensions/`
2. Activá **Modo desarrollador**
3. Elegí **Cargar descomprimida**
4. Seleccioná esta carpeta: `uces-campus-extension/`
5. Si usás la app por `file:///`, habilitá también **Allow access to file URLs**

## Cómo usar

1. Iniciá sesión en Campus UCES
2. Abrí la sección `ACTIVIDADES`
3. Hacé clic en la extensión y luego en **Importar actividades próximas**
4. La app `Entregas UCES` las cargará automáticamente

## Importante

- La extracción está pensada para elementos visibles en la sección `ACTIVIDADES`
- Filtra actividades con fecha futura
- Si Campus cambia mucho su HTML, puede requerir un ajuste de selectores
