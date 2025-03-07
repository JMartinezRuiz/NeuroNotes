from app import db
from app.models.user import User
from app.models.group import GroupMember
from sqlalchemy.exc import IntegrityError


class UserService:
    """Clase de servicio para operaciones con usuarios"""

    @staticmethod
    def get_user_by_id(user_id):
        """Obtiene un usuario por su ID"""
        return User.query.get(user_id)

    @staticmethod
    def get_user_by_username(username):
        """Obtiene un usuario por su nombre de usuario"""
        return User.query.filter_by(username=username).first()

    @staticmethod
    def get_user_by_email(email):
        """Obtiene un usuario por su email"""
        return User.query.filter_by(email=email).first()

    @staticmethod
    def create_user(username, email, password, timezone="UTC"):
        """Crea un nuevo usuario"""
        # Verificar que el nombre de usuario o email no existan ya
        if UserService.get_user_by_username(username):
            return None, "El nombre de usuario ya está en uso"

        if UserService.get_user_by_email(email):
            return None, "El correo electrónico ya está en uso"

        user = User(username=username, email=email, timezone=timezone)
        user.set_password(password)

        try:
            db.session.add(user)
            db.session.commit()
            return user, None
        except IntegrityError:
            db.session.rollback()
            return None, "Error al crear el usuario. Inténtalo de nuevo."

    @staticmethod
    def update_user(user_id, username=None, email=None, timezone=None):
        """Actualiza un usuario existente"""
        user = UserService.get_user_by_id(user_id)
        if not user:
            return None, "Usuario no encontrado"

        if username and username != user.username:
            # Verificar que el nuevo nombre de usuario no existe
            if UserService.get_user_by_username(username):
                return None, "El nombre de usuario ya está en uso"
            user.username = username

        if email and email != user.email:
            # Verificar que el nuevo email no existe
            if UserService.get_user_by_email(email):
                return None, "El correo electrónico ya está en uso"
            user.email = email

        if timezone:
            user.timezone = timezone

        try:
            db.session.commit()
            return user, None
        except IntegrityError:
            db.session.rollback()
            return None, "Error al actualizar el usuario"

    @staticmethod
    def change_password(user_id, current_password, new_password):
        """Cambia la contraseña de un usuario"""
        user = UserService.get_user_by_id(user_id)
        if not user:
            return False, "Usuario no encontrado"

        if not user.check_password(current_password):
            return False, "Contraseña actual incorrecta"

        user.set_password(new_password)
        db.session.commit()
        return True, "Contraseña actualizada correctamente"

    @staticmethod
    def delete_user(user_id, password=None):
        """Elimina un usuario"""
        user = UserService.get_user_by_id(user_id)
        if not user:
            return False, "Usuario no encontrado"

        if password and not user.check_password(password):
            return False, "Contraseña incorrecta"

        try:
            db.session.delete(user)
            db.session.commit()
            return True, "Usuario eliminado correctamente"
        except:
            db.session.rollback()
            return False, "Error al eliminar el usuario"

    @staticmethod
    def get_user_groups(user_id):
        """Obtiene todos los grupos a los que pertenece un usuario"""
        user = UserService.get_user_by_id(user_id)
        if not user:
            return []

        return user.groups.all()