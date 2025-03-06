# NotasApp

Una aplicación moderna y minimalista de notas creada con Flask.

## Características

- Interfaz moderna y minimalista
- Crear, leer, actualizar y eliminar notas
- Base de datos SQLite temporal (fácilmente escalable)
- Estructura modular y escalable

## Estructura del Proyecto

```
notas_app/
├── app/
│   ├── __init__.py          # Inicialización de la aplicación Flask
│   ├── config.py            # Configuraciones de la aplicación
│   ├── models/              # Modelos de base de datos
│   ├── routes/              # Rutas y controladores
│   ├── services/            # Lógica de negocio
│   ├── static/              # Archivos estáticos (CSS, JS, imágenes)
│   └── templates/           # Plantillas HTML
├── migrations/              # Migraciones de base de datos
├── tests/                   # Archivos de prueba
├── .gitignore               # Archivos a ignorar por Git
├── README.md                # Documentación del proyecto
├── requirements.txt         # Dependencias del proyecto
└── run.py                   # Punto de entrada de la aplicación
```

## Instalación y Configuración

1. Clonar el repositorio:
   ```
   git clone https://github.com/tu-usuario/notas-app.git
   cd notas-app
   ```

2. Crear y activar un entorno virtual:
   ```
   python -m venv venv
   
   # En Windows
   venv\Scripts\activate
   
   # En macOS/Linux
   source venv/bin/activate
   ```

3. Instalar dependencias:
   ```
   pip install -r requirements.txt
   ```

4. Ejecutar la aplicación:
   ```
   python run.py
   ```

5. Abrir en el navegador: `http://127.0.0.1:5000`

## Escalabilidad

Este proyecto está diseñado para escalar fácilmente:

- **Estructura Modular**: Organizada en componentes independientes (modelos, rutas, servicios)
- **Capa de Servicios**: Separa la lógica de negocio de las rutas
- **Blueprint de Flask**: Facilita la adición de nuevas funcionalidades
- **Base de Datos**: Fácilmente intercambiable por PostgreSQL, MySQL, etc.

## Próximas Funcionalidades

- Autenticación de usuarios
- Categorías para notas
- Búsqueda y filtrado
- API RESTful

## Licencia

MIT