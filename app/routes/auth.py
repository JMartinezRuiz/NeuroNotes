from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, current_user
from app.services.user_service import UserService
from app import db

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """Ruta para iniciar sesión"""
    if current_user.is_authenticated:
        return redirect(url_for('notes.index'))

    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember = 'remember' in request.form

        if not username or not password:
            flash('Por favor, introduce un nombre de usuario y contraseña.')
            return redirect(url_for('auth.login'))

        user = UserService.get_user_by_username(username)

        # Verificar que el usuario existe y la contraseña es correcta
        if user is None or not user.check_password(password):
            flash('Nombre de usuario o contraseña incorrectos')
            return redirect(url_for('auth.login'))

        # Verificar explícitamente que el usuario está activo antes de loguearlo
        if not hasattr(user, 'is_active') or not user.is_active:
            flash('La cuenta está desactivada. Contacte al administrador.')
            return redirect(url_for('auth.login'))

        # Intentar loguear al usuario
        try:
            login_user(user, remember=remember)
            next_page = request.args.get('next')
            if not next_page or not next_page.startswith('/'):
                next_page = url_for('notes.index')

            return redirect(next_page)
        except Exception as e:
            # En caso de error, registrar el error y mostrar un mensaje genérico
            print(f"Error en login_user: {str(e)}")
            flash('Error al iniciar sesión. Por favor, inténtelo de nuevo.')
            return redirect(url_for('auth.login'))

    return render_template('auth/login.html')


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    """Ruta para registrar un nuevo usuario"""
    if current_user.is_authenticated:
        return redirect(url_for('notes.index'))

    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')

        if not username or not email or not password:
            flash('Por favor, completa todos los campos requeridos.')
            return redirect(url_for('auth.register'))

        if password != confirm_password:
            flash('Las contraseñas no coinciden.')
            return redirect(url_for('auth.register'))

        user, error = UserService.create_user(username, email, password)
        if error:
            flash(error)
            return redirect(url_for('auth.register'))

        # Intenta loguear al usuario directamente
        try:
            login_user(user)
            flash('¡Registro exitoso! Bienvenido a NotasApp.')
            return redirect(url_for('notes.index'))
        except Exception as e:
            # Si falla el login automático, redirigir a la página de login
            print(f"Error en login_user después del registro: {str(e)}")
            flash('Registro exitoso. Por favor, inicia sesión.')
            return redirect(url_for('auth.login'))

    return render_template('auth/register.html')


@auth_bp.route('/logout')
def logout():
    """Ruta para cerrar sesión"""
    logout_user()
    flash('Has cerrado sesión correctamente.')
    return redirect(url_for('auth.login'))