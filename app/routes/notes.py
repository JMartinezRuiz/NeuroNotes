from flask import Blueprint, render_template, request, redirect, url_for, flash
from app import db
from app.models.note import Note

notes_bp = Blueprint('notes', __name__)


@notes_bp.route('/')
def index():
    """Ruta para la página principal que muestra todas las notas"""
    notes = Note.query.order_by(Note.created_at.desc()).all()
    return render_template('index.html', notes=notes)


@notes_bp.route('/notes/new', methods=['GET', 'POST'])
def create_note():
    """Ruta para crear una nueva nota"""
    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')

        if not title or not content:
            flash('El título y contenido son obligatorios.')
            return redirect(url_for('notes.create_note'))

        note = Note(title=title, content=content)
        db.session.add(note)
        db.session.commit()

        flash('¡Nota creada con éxito!')
        return redirect(url_for('notes.index'))

    return render_template('notes/create.html')


@notes_bp.route('/notes/<int:id>')
def view_note(id):
    """Ruta para ver una nota específica"""
    note = Note.query.get_or_404(id)
    return render_template('notes/view.html', note=note)


@notes_bp.route('/notes/<int:id>/edit', methods=['GET', 'POST'])
def edit_note(id):
    """Ruta para editar una nota existente"""
    note = Note.query.get_or_404(id)

    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')

        if not title or not content:
            flash('El título y contenido son obligatorios.')
            return redirect(url_for('notes.edit_note', id=id))

        note.title = title
        note.content = content
        db.session.commit()

        flash('¡Nota actualizada con éxito!')
        return redirect(url_for('notes.view_note', id=id))

    return render_template('notes/edit.html', note=note)


@notes_bp.route('/notes/<int:id>/delete', methods=['POST'])
def delete_note(id):
    """Ruta para eliminar una nota"""
    note = Note.query.get_or_404(id)
    db.session.delete(note)
    db.session.commit()

    flash('¡Nota eliminada con éxito!')
    return redirect(url_for('notes.index'))