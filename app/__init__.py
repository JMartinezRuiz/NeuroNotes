from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from app.config import Config

# Inicialización de extensiones
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
login_manager.login_view = 'auth.login'
login_manager.login_message = 'Por favor, inicia sesión para acceder a esta página.'


def create_app(config_class=Config):
    """Función factory para crear la aplicación Flask"""
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Inicializar extensiones con la app
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    # Registrar blueprints
    from app.routes.notes import notes_bp
    app.register_blueprint(notes_bp)

    # Registrar blueprint para autenticación
    from app.routes.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')

    # Registrar blueprint para usuarios
    from app.routes.users import users_bp
    app.register_blueprint(users_bp, url_prefix='/users')

    # Registrar blueprint para grupos
    from app.routes.groups import groups_bp
    app.register_blueprint(groups_bp, url_prefix='/groups')

    # Registrar blueprint para categorías
    from app.routes.categories import categories_bp
    app.register_blueprint(categories_bp, url_prefix='/categories')

    # Registrar blueprint para PWA
    from app.routes.pwa import pwa_bp
    app.register_blueprint(pwa_bp)

    # Registrar filtros personalizados para plantillas
    from app.template_filters import register_filters
    register_filters(app)

    # Crear tablas de base de datos si no existen
    with app.app_context():
        db.create_all()

    # Configurar el user loader para Flask-Login
    from app.models.user import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # Función de contexto para plantillas
    @app.context_processor
    def inject_now():
        from datetime import datetime
        return {'now': datetime.utcnow()}

    return app


# Importar modelos para asegurar que SQLAlchemy los reconozca
from app.models import user, group, category, note