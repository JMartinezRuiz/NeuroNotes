from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.services.category_service import CategoryService
from app.services.group_service import GroupService
from app.services.note_service import NoteService

categories_bp = Blueprint('categories', __name__)


@categories_bp.route('/')
@login_required
def index():
    """Ruta para mostrar todas las categorías accesibles por el usuario"""
    categories = CategoryService.get_accessible_categories(current_user.id)
    return render_template('categories/index.html', categories=categories)


@categories_bp.route('/personal')
@login_required
def personal_categories():
    """Ruta para mostrar categorías personales del usuario"""
    categories = CategoryService.get_user_categories(current_user.id)
    return render_template('categories/personal.html', categories=categories)


@categories_bp.route('/personal/new', methods=['GET', 'POST'])
@login_required
def create_personal_category():
    """Ruta para crear una nueva categoría personal"""
    if request.method == 'POST':
        name = request.form.get('name')
        color = request.form.get('color', '#4361ee')

        if not name:
            flash('El nombre de la categoría es obligatorio')
            return redirect(url_for('categories.create_personal_category'))

        category = CategoryService.create_personal_category(
            name,
            current_user.id,
            color=color
        )

        flash('Categoría creada con éxito')
        return redirect(url_for('categories.personal_categories'))

    return render_template('categories/create_personal.html')


@categories_bp.route('/personal/<int:category_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_personal_category(category_id):
    """Ruta para editar una categoría personal"""
    category = CategoryService.get_category_by_id(category_id)

    if not category or category.type != 'personal' or category.user_id != current_user.id:
        flash('Categoría no encontrada o no tienes permiso para editarla')
        return redirect(url_for('categories.personal_categories'))

    if request.method == 'POST':
        name = request.form.get('name')
        color = request.form.get('color')

        if not name:
            flash('El nombre de la categoría es obligatorio')
            return redirect(url_for('categories.edit_personal_category', category_id=category_id))

        updated_category, error = CategoryService.update_category(
            category_id,
            name=name,
            color=color,
            user_id=current_user.id
        )

        if error:
            flash(error)
            return redirect(url_for('categories.edit_personal_category', category_id=category_id))

        flash('Categoría actualizada con éxito')
        return redirect(url_for('categories.personal_categories'))

    return render_template('categories/edit_personal.html', category=category)


@categories_bp.route('/personal/<int:category_id>/delete', methods=['POST'])
@login_required
def delete_personal_category(category_id):
    """Ruta para eliminar una categoría personal"""
    category = CategoryService.get_category_by_id(category_id)

    if not category or category.type != 'personal' or category.user_id != current_user.id:
        flash('Categoría no encontrada o no tienes permiso para eliminarla')
        return redirect(url_for('categories.personal_categories'))

    success, message = CategoryService.delete_category(category_id, current_user.id)

    flash(message)
    return redirect(url_for('categories.personal_categories'))


@categories_bp.route('/group/<int:group_id>')
@login_required
def group_categories(group_id):
    """Ruta para mostrar categorías de un grupo"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es miembro del grupo
    if not GroupService.is_member(group_id, current_user.id):
        flash('No tienes acceso a este grupo')
        return redirect(url_for('groups.index'))

    categories = CategoryService.get_group_categories(group_id)
    is_admin = GroupService.is_admin(group_id, current_user.id)

    return render_template('categories/group.html',
                           categories=categories,
                           group=group,
                           is_admin=is_admin)


@categories_bp.route('/group/<int:group_id>/new', methods=['GET', 'POST'])
@login_required
def create_group_category(group_id):
    """Ruta para crear una nueva categoría de grupo"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es administrador del grupo
    if not GroupService.is_admin(group_id, current_user.id):
        flash('Solo los administradores pueden crear categorías de grupo')
        return redirect(url_for('categories.group_categories', group_id=group_id))

    if request.method == 'POST':
        name = request.form.get('name')
        color = request.form.get('color', '#4361ee')

        if not name:
            flash('El nombre de la categoría es obligatorio')
            return redirect(url_for('categories.create_group_category', group_id=group_id))

        category = CategoryService.create_group_category(
            name,
            group_id,
            color=color
        )

        flash('Categoría de grupo creada con éxito')
        return redirect(url_for('categories.group_categories', group_id=group_id))

    return render_template('categories/create_group.html', group=group)


@categories_bp.route('/group/<int:group_id>/<int:category_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_group_category(group_id, category_id):
    """Ruta para editar una categoría de grupo"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es administrador del grupo
    if not GroupService.is_admin(group_id, current_user.id):
        flash('Solo los administradores pueden editar categorías de grupo')
        return redirect(url_for('categories.group_categories', group_id=group_id))

    category = CategoryService.get_category_by_id(category_id)

    if not category or category.type != 'group' or category.group_id != group_id:
        flash('Categoría no encontrada o no pertenece a este grupo')
        return redirect(url_for('categories.group_categories', group_id=group_id))

    if request.method == 'POST':
        name = request.form.get('name')
        color = request.form.get('color')

        if not name:
            flash('El nombre de la categoría es obligatorio')
            return redirect(url_for('categories.edit_group_category',
                                    group_id=group_id,
                                    category_id=category_id))

        updated_category, error = CategoryService.update_category(
            category_id,
            name=name,
            color=color,
            user_id=current_user.id
        )

        if error:
            flash(error)
            return redirect(url_for('categories.edit_group_category',
                                    group_id=group_id,
                                    category_id=category_id))

        flash('Categoría actualizada con éxito')
        return redirect(url_for('categories.group_categories', group_id=group_id))

    return render_template('categories/edit_group.html', group=group, category=category)


@categories_bp.route('/group/<int:group_id>/<int:category_id>/delete', methods=['POST'])
@login_required
def delete_group_category(group_id, category_id):
    """Ruta para eliminar una categoría de grupo"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es administrador del grupo
    if not GroupService.is_admin(group_id, current_user.id):
        flash('Solo los administradores pueden eliminar categorías de grupo')
        return redirect(url_for('categories.group_categories', group_id=group_id))

    category = CategoryService.get_category_by_id(category_id)

    if not category or category.type != 'group' or category.group_id != group_id:
        flash('Categoría no encontrada o no pertenece a este grupo')
        return redirect(url_for('categories.group_categories', group_id=group_id))

    success, message = CategoryService.delete_category(category_id, current_user.id)

    flash(message)
    return redirect(url_for('categories.group_categories', group_id=group_id))


@categories_bp.route('/<int:category_id>/notes')
@login_required
def category_notes(category_id):
    """Ruta para mostrar notas de una categoría específica"""
    category = CategoryService.get_category_by_id(category_id)

    if not category:
        flash('Categoría no encontrada')
        return redirect(url_for('categories.index'))

    # Verificar permisos
    if category.type == 'personal' and category.user_id != current_user.id:
        flash('No tienes acceso a esta categoría')
        return redirect(url_for('categories.index'))

    if category.type == 'group' and not GroupService.is_member(category.group_id, current_user.id):
        flash('No tienes acceso a esta categoría')
        return redirect(url_for('categories.index'))

    notes = NoteService.get_notes_by_category(category_id, current_user.id)

    return render_template('categories/notes.html', category=category, notes=notes)