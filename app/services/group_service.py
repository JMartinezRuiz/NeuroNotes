from app import db
from app.models.group import Group, GroupMember
from sqlalchemy import and_


class GroupService:
    """Clase de servicio para operaciones con grupos"""

    @staticmethod
    def get_group_by_id(group_id):
        """Obtiene un grupo por su ID"""
        return Group.query.get(group_id)

    @staticmethod
    def get_user_groups(user_id):
        """Obtiene todos los grupos a los que pertenece un usuario"""
        return Group.query.join(GroupMember).filter(
            GroupMember.user_id == user_id
        ).order_by(Group.groupname).all()

    @staticmethod
    def get_owned_groups(user_id):
        """Obtiene todos los grupos que son propiedad de un usuario"""
        return Group.query.filter(Group.owner_id == user_id).order_by(Group.groupname).all()

    @staticmethod
    def create_group(groupname, owner_id):
        """Crea un nuevo grupo y añade al creador como administrador"""
        group = Group(groupname=groupname, owner_id=owner_id)
        db.session.add(group)

        # Añadir al creador como miembro administrador
        member = GroupMember(group_id=group.id, user_id=owner_id, role='admin')
        db.session.add(member)

        db.session.commit()
        return group

    @staticmethod
    def update_group(group_id, groupname=None, user_id=None):
        """
        Actualiza un grupo existente.
        Si se proporciona user_id, se verifica que el usuario sea el propietario.
        """
        group = GroupService.get_group_by_id(group_id)
        if not group:
            return None, "Grupo no encontrado"

        # Verificar permisos
        if user_id and group.owner_id != user_id:
            return None, "No tienes permiso para editar este grupo"

        if groupname:
            group.groupname = groupname

        db.session.commit()
        return group, None

    @staticmethod
    def delete_group(group_id, user_id=None):
        """
        Elimina un grupo.
        Si se proporciona user_id, se verifica que el usuario sea el propietario.
        """
        group = GroupService.get_group_by_id(group_id)
        if not group:
            return False, "Grupo no encontrado"

        # Verificar permisos
        if user_id and group.owner_id != user_id:
            return False, "No tienes permiso para eliminar este grupo"

        # Eliminar el grupo (las membresías y otros elementos se eliminarán en cascada)
        db.session.delete(group)
        db.session.commit()
        return True, "Grupo eliminado correctamente"

    @staticmethod
    def get_group_members(group_id):
        """Obtiene todos los miembros de un grupo"""
        return GroupMember.query.filter(GroupMember.group_id == group_id).all()

    @staticmethod
    def add_member_to_group(group_id, user_id, role='member', admin_id=None):
        """
        Añade un usuario a un grupo.
        Si se proporciona admin_id, se verifica que el administrador tenga permisos.
        """
        group = GroupService.get_group_by_id(group_id)
        if not group:
            return None, "Grupo no encontrado"

        # Verificar permisos del administrador
        if admin_id:
            admin = GroupMember.query.filter(
                and_(
                    GroupMember.group_id == group_id,
                    GroupMember.user_id == admin_id,
                    GroupMember.role == 'admin'
                )
            ).first()

            if not admin and group.owner_id != admin_id:
                return None, "No tienes permiso para añadir miembros a este grupo"

        # Verificar que el usuario no sea ya miembro
        existing_member = GroupMember.query.filter(
            and_(
                GroupMember.group_id == group_id,
                GroupMember.user_id == user_id
            )
        ).first()

        if existing_member:
            return None, "El usuario ya es miembro de este grupo"

        # Añadir el nuevo miembro
        member = GroupMember(group_id=group_id, user_id=user_id, role=role)
        db.session.add(member)
        db.session.commit()

        return member, None

    @staticmethod
    def update_member_role(group_id, user_id, new_role, admin_id=None):
        """
        Actualiza el rol de un miembro en un grupo.
        Si se proporciona admin_id, se verifica que el administrador tenga permisos.
        """
        # Verificar permisos del administrador
        if admin_id:
            if not GroupService.is_admin(group_id, admin_id):
                return None, "No tienes permiso para cambiar roles en este grupo"

        # Buscar al miembro
        member = GroupMember.query.filter(
            and_(
                GroupMember.group_id == group_id,
                GroupMember.user_id == user_id
            )
        ).first()

        if not member:
            return None, "El usuario no es miembro de este grupo"

        # No permitir cambiar el rol del propietario
        group = GroupService.get_group_by_id(group_id)
        if group.owner_id == user_id:
            return None, "No se puede cambiar el rol del propietario del grupo"

        # Actualizar el rol
        member.role = new_role
        db.session.commit()

        return member, None

    @staticmethod
    def remove_member_from_group(group_id, user_id, admin_id=None):
        """
        Elimina un miembro de un grupo.
        Si se proporciona admin_id, se verifica que el administrador tenga permisos.
        """
        group = GroupService.get_group_by_id(group_id)
        if not group:
            return False, "Grupo no encontrado"

        # No permitir eliminar al propietario
        if group.owner_id == user_id:
            return False, "No se puede eliminar al propietario del grupo"

        # Verificar permisos del administrador
        if admin_id and admin_id != user_id:  # El usuario siempre puede eliminarse a sí mismo
            if not GroupService.is_admin(group_id, admin_id):
                return False, "No tienes permiso para eliminar miembros de este grupo"

        # Buscar al miembro
        member = GroupMember.query.filter(
            and_(
                GroupMember.group_id == group_id,
                GroupMember.user_id == user_id
            )
        ).first()

        if not member:
            return False, "El usuario no es miembro de este grupo"

        # Eliminar al miembro
        db.session.delete(member)
        db.session.commit()

        return True, "Miembro eliminado correctamente"

    @staticmethod
    def is_member(group_id, user_id):
        """Verifica si un usuario es miembro de un grupo"""
        return GroupMember.query.filter(
            and_(
                GroupMember.group_id == group_id,
                GroupMember.user_id == user_id
            )
        ).first() is not None

    @staticmethod
    def is_admin(group_id, user_id):
        """Verifica si un usuario es administrador de un grupo"""
        group = GroupService.get_group_by_id(group_id)
        if not group:
            return False

        # El propietario siempre es administrador
        if group.owner_id == user_id:
            return True

        # Verificar rol de administrador
        return GroupMember.query.filter(
            and_(
                GroupMember.group_id == group_id,
                GroupMember.user_id == user_id,
                GroupMember.role == 'admin'
            )
        ).first() is not None