from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.services.group_service import GroupService
from app.services.user_service import UserService

groups_bp = Blueprint('groups', __name__)


@groups_bp.route('/')
@login_required
def index():
    """Ruta para mostrar todos los grupos del usuario"""
    user_groups = GroupService.get_user_groups(current_user.id)
    owned_groups = GroupService.get_owned_groups(current_user.id)
    return render_template('groups/index.html', user_groups=user_groups, owned_groups=owned_groups)


@groups_bp.route('/new', methods=['GET', 'POST'])
@login_required
def create_group():
    """Ruta para crear un nuevo grupo"""
    if request.method == 'POST':
        groupname = request.form.get('groupname')

        if not groupname:
            flash('El nombre del grupo es obligatorio')
            return redirect(url_for('groups.create_group'))

        group = GroupService.create_group(groupname, current_user.id)

        flash('Grupo creado con éxito')
        return redirect(url_for('groups.view_group', group_id=group.id))

    return render_template('groups/create.html')


@groups_bp.route('/<int:group_id>')
@login_required
def view_group(group_id):
    """Ruta para ver un grupo específico"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es miembro del grupo
    if not GroupService.is_member(group_id, current_user.id):
        flash('No tienes acceso a este grupo')
        return redirect(url_for('groups.index'))

    members = GroupService.get_group_members(group_id)
    is_admin = GroupService.is_admin(group_id, current_user.id)

    return render_template('groups/view.html',
                           group=group,
                           members=members,
                           is_admin=is_admin)


@groups_bp.route('/<int:group_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_group(group_id):
    """Ruta para editar un grupo"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es el propietario
    if group.owner_id != current_user.id:
        flash('Solo el propietario puede editar el grupo')
        return redirect(url_for('groups.view_group', group_id=group_id))

    if request.method == 'POST':
        groupname = request.form.get('groupname')

        if not groupname:
            flash('El nombre del grupo es obligatorio')
            return redirect(url_for('groups.edit_group', group_id=group_id))

        updated_group, error = GroupService.update_group(
            group_id,
            groupname=groupname,
            user_id=current_user.id
        )

        if error:
            flash(error)
            return redirect(url_for('groups.edit_group', group_id=group_id))

        flash('Grupo actualizado con éxito')
        return redirect(url_for('groups.view_group', group_id=group_id))

    return render_template('groups/edit.html', group=group)


@groups_bp.route('/<int:group_id>/delete', methods=['POST'])
@login_required
def delete_group(group_id):
    """Ruta para eliminar un grupo"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es el propietario
    if group.owner_id != current_user.id:
        flash('Solo el propietario puede eliminar el grupo')
        return redirect(url_for('groups.view_group', group_id=group_id))

    success, message = GroupService.delete_group(group_id, current_user.id)

    flash(message)
    return redirect(url_for('groups.index'))


@groups_bp.route('/<int:group_id>/members/add', methods=['GET', 'POST'])
@login_required
def add_member(group_id):
    """Ruta para añadir un miembro al grupo"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es administrador
    if not GroupService.is_admin(group_id, current_user.id):
        flash('Solo los administradores pueden añadir miembros')
        return redirect(url_for('groups.view_group', group_id=group_id))

    if request.method == 'POST':
        username = request.form.get('username')
        role = request.form.get('role', 'member')

        user = UserService.get_user_by_username(username)
        if not user:
            flash('Usuario no encontrado')
            return redirect(url_for('groups.add_member', group_id=group_id))

        member, error = GroupService.add_member_to_group(
            group_id,
            user.id,
            role=role,
            admin_id=current_user.id
        )

        if error:
            flash(error)
            return redirect(url_for('groups.add_member', group_id=group_id))

        flash('Miembro añadido con éxito')
        return redirect(url_for('groups.view_group', group_id=group_id))

    return render_template('groups/add_member.html', group=group)


@groups_bp.route('/<int:group_id>/members/<int:user_id>/update', methods=['POST'])
@login_required
def update_member_role(group_id, user_id):
    """Ruta para actualizar el rol de un miembro"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Verificar que el usuario es administrador
    if not GroupService.is_admin(group_id, current_user.id):
        flash('Solo los administradores pueden cambiar roles')
        return redirect(url_for('groups.view_group', group_id=group_id))

    role = request.form.get('role', 'member')

    member, error = GroupService.update_member_role(
        group_id,
        user_id,
        new_role=role,
        admin_id=current_user.id
    )

    if error:
        flash(error)
    else:
        flash('Rol actualizado con éxito')

    return redirect(url_for('groups.view_group', group_id=group_id))


@groups_bp.route('/<int:group_id>/members/<int:user_id>/remove', methods=['POST'])
@login_required
def remove_member(group_id, user_id):
    """Ruta para eliminar un miembro del grupo"""
    group = GroupService.get_group_by_id(group_id)

    if not group:
        flash('Grupo no encontrado')
        return redirect(url_for('groups.index'))

    # Un usuario puede eliminarse a sí mismo, o un administrador puede eliminar a otros
    if user_id != current_user.id and not GroupService.is_admin(group_id, current_user.id):
        flash('No tienes permiso para realizar esta acción')
        return redirect(url_for('groups.view_group', group_id=group_id))

    success, message = GroupService.remove_member_from_group(
        group_id,
        user_id,
        admin_id=current_user.id
    )

    flash(message)

    # Si el usuario se eliminó a sí mismo, redirigir al índice de grupos
    if user_id == current_user.id:
        return redirect(url_for('groups.index'))

    return redirect(url_for('groups.view_group', group_id=group_id))