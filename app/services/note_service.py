from app import db
from app.models.note import Note


class NoteService:
    """Clase de servicio para operaciones con notas"""

    @staticmethod
    def get_all_notes():
        """Obtiene todas las notas ordenadas por fecha de creación"""
        return Note.query.order_by(Note.created_at.desc()).all()

    @staticmethod
    def get_note_by_id(note_id):
        """Obtiene una nota por su ID"""
        return Note.query.get_or_404(note_id)

    @staticmethod
    def create_note(title, content):
        """Crea una nueva nota"""
        note = Note(title=title, content=content)
        db.session.add(note)
        db.session.commit()
        return note

    @staticmethod
    def update_note(note_id, title, content):
        """Actualiza una nota existente"""
        note = Note.query.get_or_404(note_id)
        note.title = title
        note.content = content
        db.session.commit()
        return note

    @staticmethod
    def delete_note(note_id):
        """Elimina una nota"""
        note = Note.query.get_or_404(note_id)
        db.session.delete(note)
        db.session.commit()
        return True