from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from app.config import Config

# Inicialización de extensiones
db = SQLAlchemy()
migrate = Migrate()


def create_app(config_class=Config):
    """Función factory para crear la aplicación Flask"""
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Inicializar extensiones con la app
    db.init_app(app)
    migrate.init_app(app, db)

    # Registrar blueprints
    from app.routes.notes import notes_bp
    app.register_blueprint(notes_bp)

    # Crear tablas de base de datos si no existen
    with app.app_context():
        db.create_all()

    # Función de contexto para plantillas
    @app.context_processor
    def inject_now():
        from datetime import datetime
        return {'now': datetime.utcnow()}

    return app


# Importar modelos para asegurar que SQLAlchemy los reconozca
from app.models import note