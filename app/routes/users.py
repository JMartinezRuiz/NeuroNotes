from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.services.user_service import UserService

users_bp = Blueprint('users', __name__)


@users_bp.route('/profile')
@login_required
def profile():
    """Ruta para ver el perfil del usuario actual"""
    return render_template('users/profile.html', user=current_user)


@users_bp.route('/profile/edit', methods=['GET', 'POST'])
@login_required
def edit_profile():
    """Ruta para editar el perfil del usuario actual"""
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        timezone = request.form.get('timezone')

        user, error = UserService.update_user(
            current_user.id,
            username=username,
            email=email,
            timezone=timezone
        )

        if error:
            flash(error)
            return redirect(url_for('users.edit_profile'))

        flash('Perfil actualizado correctamente')
        return redirect(url_for('users.profile'))

    return render_template('users/edit_profile.html', user=current_user)


@users_bp.route('/profile/change-password', methods=['GET', 'POST'])
@login_required
def change_password():
    """Ruta para cambiar la contraseña del usuario actual"""
    if request.method == 'POST':
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        confirm_password = request.form.get('confirm_password')

        if new_password != confirm_password:
            flash('Las nuevas contraseñas no coinciden')
            return redirect(url_for('users.change_password'))

        success, message = UserService.change_password(
            current_user.id,
            current_password,
            new_password
        )

        flash(message)
        if success:
            return redirect(url_for('users.profile'))
        else:
            return redirect(url_for('users.change_password'))

    return render_template('users/change_password.html')