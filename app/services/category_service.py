from app import db
from app.models.category import Category
from app.models.group import GroupMember
from sqlalchemy import and_


class CategoryService:
    """Clase de servicio para operaciones con categorías"""

    @staticmethod
    def get_category_by_id(category_id):
        """Obtiene una categoría por su ID"""
        return Category.query.get(category_id)

    @staticmethod
    def get_user_categories(user_id):
        """Obtiene todas las categorías personales de un usuario"""
        return Category.query.filter(
            and_(Category.user_id == user_id, Category.type == 'personal')
        ).order_by(Category.name).all()

    @staticmethod
    def get_group_categories(group_id):
        """Obtiene todas las categorías de un grupo"""
        return Category.query.filter(
            and_(Category.group_id == group_id, Category.type == 'group')
        ).order_by(Category.name).all()

    @staticmethod
    def get_accessible_categories(user_id):
        """
        Obtiene todas las categorías a las que tiene acceso un usuario
        (personales + de sus grupos)
        """
        # Obtener IDs de los grupos a los que pertenece el usuario
        group_ids = db.session.query(GroupMember.group_id).filter(
            GroupMember.user_id == user_id
        ).all()
        group_ids = [g[0] for g in group_ids]  # Convertir a lista simple

        # Consulta para obtener categorías personales y de grupo
        categories = Category.query.filter(
            ((Category.user_id == user_id) & (Category.type == 'personal')) |
            ((Category.group_id.in_(group_ids)) & (Category.type == 'group'))
        ).order_by(Category.type, Category.name).all()

        return categories

    @staticmethod
    def create_personal_category(name, user_id, color="#4361ee"):
        """Crea una nueva categoría personal para un usuario"""
        category = Category(
            type='personal',
            name=name,
            color=color,
            user_id=user_id
        )

        db.session.add(category)
        db.session.commit()
        return category

    @staticmethod
    def create_group_category(name, group_id, color="#4361ee"):
        """Crea una nueva categoría para un grupo"""
        category = Category(
            type='group',
            name=name,
            color=color,
            group_id=group_id
        )

        db.session.add(category)
        db.session.commit()
        return category

    @staticmethod
    def update_category(category_id, name=None, color=None, user_id=None):
        """
        Actualiza una categoría existente.
        Si se proporciona user_id, se verifica que el usuario tenga permiso.
        """
        category = CategoryService.get_category_by_id(category_id)
        if not category:
            return None, "Categoría no encontrada"

        # Verificar permisos
        if user_id:
            if category.type == 'personal' and category.user_id != user_id:
                return None, "No tienes permiso para editar esta categoría"

            if category.type == 'group':
                # Verificar si el usuario es administrador del grupo
                is_admin = db.session.query(GroupMember).filter(
                    and_(
                        GroupMember.group_id == category.group_id,
                        GroupMember.user_id == user_id,
                        GroupMember.role == 'admin'
                    )
                ).first() is not None

                if not is_admin:
                    return None, "No tienes permiso para editar esta categoría de grupo"

        if name:
            category.name = name

        if color:
            category.color = color

        db.session.commit()
        return category, None

    @staticmethod
    def delete_category(category_id, user_id=None):
        """
        Elimina una categoría.
        Si se proporciona user_id, se verifica que el usuario tenga permiso.
        """
        category = CategoryService.get_category_by_id(category_id)
        if not category:
            return False, "Categoría no encontrada"

        # Verificar permisos
        if user_id:
            if category.type == 'personal' and category.user_id != user_id:
                return False, "No tienes permiso para eliminar esta categoría"

            if category.type == 'group':
                # Verificar si el usuario es administrador del grupo
                is_admin = db.session.query(GroupMember).filter(
                    and_(
                        GroupMember.group_id == category.group_id,
                        GroupMember.user_id == user_id,
                        GroupMember.role == 'admin'
                    )
                ).first() is not None

                if not is_admin:
                    return False, "No tienes permiso para eliminar esta categoría de grupo"

        # Eliminar la categoría (las relaciones se eliminarán en cascada)
        db.session.delete(category)
        db.session.commit()
        return True, "Categoría eliminada correctamente"