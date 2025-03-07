from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user
from app import db
from app.services.note_service import NoteService
from app.services.category_service import CategoryService
from app.services.group_service import GroupService

notes_bp = Blueprint('notes', __name__)


@notes_bp.route('/')
@login_required
def index():
    """Ruta para la página principal que muestra las notas personales del usuario"""
    notes = NoteService.get_all_notes(user_id=current_user.id)
    return render_template('index.html', notes=notes)


@notes_bp.route('/notes/new', methods=['GET', 'POST'])
@login_required
def create_note():
    """Ruta para crear una nueva nota personal"""
    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        color = request.form.get('color', '#ffffff')
        categories = request.form.getlist('categories')

        if not content:
            flash('El contenido es obligatorio.')
            return redirect(url_for('notes.create_note'))

        note = NoteService.create_note(
            title=title,
            content=content,
            user_id=current_user.id,
            color=color,
            categories=categories
        )

        flash('¡Nota creada con éxito!')
        return redirect(url_for('notes.view_note', note_id=note.id))

    # Obtener categorías personales del usuario para el formulario
    categories = CategoryService.get_user_categories(current_user.id)
    return render_template('notes/create.html', categories=categories)


@notes_bp.route('/group/<int:group_id>/notes/new', methods=['GET', 'POST'])
@login_required
def create_group_note(group_id):
    """Ruta para crear una nueva nota en un grupo"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es miembro del grupo
    if not GroupService.is_member(group_id, current_user.id):
        flash('No tienes acceso a este grupo')
        return redirect(url_for('groups.index'))

    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        color = request.form.get('color', '#ffffff')
        categories = request.form.getlist('categories')

        if not content:
            flash('El contenido es obligatorio.')
            return redirect(url_for('notes.create_group_note', group_id=group_id))

        note = NoteService.create_note(
            title=title,
            content=content,
            user_id=current_user.id,
            group_id=group_id,
            color=color,
            categories=categories
        )

        flash('¡Nota de grupo creada con éxito!')
        return redirect(url_for('notes.view_note', note_id=note.id))

    # Obtener categorías del grupo para el formulario
    categories = CategoryService.get_group_categories(group_id)
    return render_template('notes/create_group.html', group=group, categories=categories)


@notes_bp.route('/notes/<int:note_id>')
@login_required
def view_note(note_id):
    """Ruta para ver una nota específica"""
    note = NoteService.get_note_by_id(note_id, current_user.id)

    if not note:
        flash('Nota no encontrada o no tienes permiso para verla')
        return redirect(url_for('notes.index'))

    return render_template('notes/view.html', note=note)


@notes_bp.route('/notes/<int:note_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_note(note_id):
    """Ruta para editar una nota existente"""
    note = NoteService.get_note_by_id(note_id, current_user.id)

    if not note:
        flash('Nota no encontrada o no tienes permiso para editarla')
        return redirect(url_for('notes.index'))

    # Verificar si es una nota personal o de grupo
    is_group_note = note.group_id is not None

    if is_group_note:
        # Verificar que el usuario es miembro del grupo
        if not GroupService.is_member(note.group_id, current_user.id):
            flash('No tienes permiso para editar esta nota')
            return redirect(url_for('notes.view_note', note_id=note_id))
    else:
        # Verificar que es el propietario de la nota personal
        if note.user_id != current_user.id:
            flash('No tienes permiso para editar esta nota')
            return redirect(url_for('notes.view_note', note_id=note_id))

    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        color = request.form.get('color')
        categories = request.form.getlist('categories')

        if not content:
            flash('El contenido es obligatorio.')
            return redirect(url_for('notes.edit_note', note_id=note_id))

        updated_note = NoteService.update_note(
            note_id=note_id,
            title=title,
            content=content,
            color=color,
            user_id=current_user.id,
            categories=categories
        )

        if not updated_note:
            flash('Hubo un problema al actualizar la nota')
            return redirect(url_for('notes.edit_note', note_id=note_id))

        flash('¡Nota actualizada con éxito!')
        return redirect(url_for('notes.view_note', note_id=note_id))

    # Obtener categorías para el formulario
    if is_group_note:
        categories = CategoryService.get_group_categories(note.group_id)
    else:
        categories = CategoryService.get_user_categories(current_user.id)

    # Obtener IDs de las categorías actuales de la nota
    current_categories = [c.id for c in note.categories]

    return render_template('notes/edit.html',
                           note=note,
                           categories=categories,
                           current_categories=current_categories)


@notes_bp.route('/notes/<int:note_id>/delete', methods=['POST'])
@login_required
def delete_note(note_id):
    """Ruta para eliminar una nota"""
    note = NoteService.get_note_by_id(note_id, current_user.id)

    if not note:
        flash('Nota no encontrada o no tienes permiso para eliminarla')
        return redirect(url_for('notes.index'))

    # Verificar permisos
    if note.user_id != current_user.id:
        flash('Solo el creador puede eliminar esta nota')
        return redirect(url_for('notes.view_note', note_id=note_id))

    success = NoteService.delete_note(note_id, current_user.id)

    if success:
        flash('¡Nota eliminada con éxito!')
    else:
        flash('Hubo un problema al eliminar la nota')

    # Redirigir a la página adecuada (grupo o notas personales)
    if note.group_id:
        return redirect(url_for('groups.view_group', group_id=note.group_id))
    else:
        return redirect(url_for('notes.index'))


@notes_bp.route('/group/<int:group_id>/notes')
@login_required
def group_notes(group_id):
    """Ruta para ver las notas de un grupo"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es miembro del grupo
    if not GroupService.is_member(group_id, current_user.id):
        flash('No tienes acceso a este grupo')
        return redirect(url_for('groups.index'))

    notes = NoteService.get_all_notes(group_id=group_id)
    return render_template('notes/group_notes.html', notes=notes, group=group)