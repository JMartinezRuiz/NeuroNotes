from datetime import datetime
from app import db


class Note(db.Model):
    """Modelo para las notas"""
    __tablename__ = 'notes'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), nullable=True)
    title = db.Column(db.String(100), nullable=True)
    content = db.Column(db.Text, nullable=False)
    color = db.Column(db.String(20), default='#ffffff')
    is_hidden = db.Column(db.Boolean, default=False)
    is_disposable = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<Note {self.title or self.id}>'

    def to_dict(self):
        """Convierte el objeto a un diccionario"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'group_id': self.group_id,
            'title': self.title,
            'content': self.content,
            'color': self.color,
            'is_hidden': self.is_hidden,
            'is_disposable': self.is_disposable,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'categories': [cat.to_dict() for cat in self.categories]
        }


class NoteCategory(db.Model):
    """Modelo para la relación entre notas y categorías"""
    __tablename__ = 'note_categories'

    note_id = db.Column(db.Integer, db.ForeignKey('notes.id', ondelete='CASCADE'), primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id', ondelete='CASCADE'), primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relación directa con nota y categoría
    note = db.relationship('Note', backref=db.backref('note_categories', cascade='all, delete-orphan'))
    category = db.relationship('Category', backref=db.backref('note_categories', cascade='all, delete-orphan'))

    def __repr__(self):
        return f'<NoteCategory note_id={self.note_id}, category_id={self.category_id}>'