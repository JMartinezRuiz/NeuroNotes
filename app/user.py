from datetime import datetime
from app import db
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin


class User(db.Model, UserMixin):
    """Modelo para los usuarios"""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), nullable=False, unique=True)
    email = db.Column(db.String(120), nullable=False, unique=True)
    password_hash = db.Column(db.String(128), nullable=False)
    timezone = db.Column(db.String(50), default='UTC')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones
    notes = db.relationship('Note', backref='author', lazy='dynamic', foreign_keys='Note.user_id')
    owned_groups = db.relationship('Group', backref='owner', lazy='dynamic', foreign_keys='Group.owner_id')
    personal_categories = db.relationship('Category',
                                          backref='owner',
                                          lazy='dynamic',
                                          primaryjoin="and_(Category.user_id==User.id, Category.type=='personal')")

    # Relación muchos a muchos con grupos (a través de group_members)
    groups = db.relationship('Group',
                             secondary='group_members',
                             backref=db.backref('members', lazy='dynamic'),
                             lazy='dynamic',
                             overlaps="owned_groups")

    def __repr__(self):
        return f'<User {self.username}>'

    def set_password(self, password):
        """Genera un hash de la contraseña proporcionada"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Verifica si la contraseña proporcionada coincide con el hash almacenado"""
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        """Convierte el objeto a un diccionario"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'timezone': self.timezone,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }