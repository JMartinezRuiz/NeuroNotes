from datetime import datetime
from app import db


class Category(db.Model):
    """Modelo para las categorías"""
    __tablename__ = 'categories'

    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(20), nullable=False)  # 'personal' o 'group'
    name = db.Column(db.String(64), nullable=False)
    color = db.Column(db.String(20), default='#4361ee')
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relación muchos a muchos con notas
    notes = db.relationship('Note',
                            secondary='note_categories',
                            backref=db.backref('categories', lazy='dynamic'),
                            lazy='dynamic')

    def __repr__(self):
        if self.type == 'personal':
            return f'<Category {self.name} (personal, user {self.user_id})>'
        else:
            return f'<Category {self.name} (group, group {self.group_id})>'

    def to_dict(self):
        """Convierte el objeto a un diccionario"""
        return {
            'id': self.id,
            'type': self.type,
            'name': self.name,
            'color': self.color,
            'user_id': self.user_id,
            'group_id': self.group_id,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }