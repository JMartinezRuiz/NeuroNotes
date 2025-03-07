from app import db
from app.models.note import Note, NoteCategory
from app.models.category import Category
from app.models.group import GroupMember  # Añadida importación de GroupMember
from flask import g
from sqlalchemy import and_


class NoteService:
    """Clase de servicio para operaciones con notas"""

    @staticmethod
    def get_all_notes(user_id=None, group_id=None, include_hidden=False):
        """
        Obtiene todas las notas según los filtros proporcionados.
        Si no se proporciona user_id, se asume que se quiere usar el usuario actual.
        """
        query = Note.query

        if user_id:
            query = query.filter(Note.user_id == user_id)

        if group_id:
            query = query.filter(Note.group_id == group_id)
        elif group_id is None and user_id:
            # Si se especifica user_id pero no group_id, mostrar solo notas personales
            query = query.filter(Note.group_id.is_(None))

        if not include_hidden:
            query = query.filter(Note.is_hidden == False)

        return query.order_by(Note.created_at.desc()).all()

    @staticmethod
    def get_note_by_id(note_id, user_id=None):
        """
        Obtiene una nota por su ID.
        Si se proporciona user_id, verifica que la nota pertenezca a ese usuario
        o a un grupo al que pertenece.
        """
        query = Note.query.filter(Note.id == note_id)

        if user_id:
            # Comprobar que la nota es del usuario o de un grupo al que pertenece
            query = query.filter(
                (Note.user_id == user_id) |
                (Note.group_id.in_(
                    db.session.query(GroupMember.group_id).filter(GroupMember.user_id == user_id)
                ))
            )

        return query.first_or_404()

    @staticmethod
    def create_note(title, content, user_id, group_id=None, color="#ffffff",
                    is_hidden=False, is_disposable=False, categories=None):
        """
        Crea una nueva nota.
        Si se proporciona group_id, la nota se asocia a ese grupo.
        """
        # Procesamiento de contenido para detectar categorías en formato .categoria.
        if content:
            import re
            category_names = []

            # Buscar todas las ocurrencias de .categoria. en el contenido
            pattern = r'\.([a-zA-Z0-9_-]+)\.'
            matches = re.finditer(pattern, content)

            # Recolectar nombres de categorías y posiciones para luego eliminarlas del texto
            positions = []
            for match in matches:
                category_name = match.group(1)
                category_names.append(category_name)
                positions.append((match.start(), match.end()))

            # Eliminar las etiquetas .categoria. del contenido, empezando por el final para no afectar índices
            if positions:
                new_content = content
                for start, end in sorted(positions, reverse=True):
                    new_content = new_content[:start] + new_content[end:]
                content = new_content

            # Crear categorías personales si no existen y añadirlas a la lista
            if category_names:
                from app.services.category_service import CategoryService
                for name in category_names:
                    existing_category = db.session.query(Category).filter(
                        Category.name == name,
                        Category.type == 'personal',
                        Category.user_id == user_id
                    ).first()

                    if not existing_category:
                        # Crear nueva categoría
                        new_category = CategoryService.create_personal_category(
                            name=name,
                            user_id=user_id,
                            color="#4361ee"  # Color predeterminado
                        )

                        # Añadir ID de la nueva categoría
                        if categories is None:
                            categories = []
                        categories.append(str(new_category.id))
                    else:
                        # Añadir ID de categoría existente
                        if categories is None:
                            categories = []
                        if str(existing_category.id) not in categories:
                            categories.append(str(existing_category.id))

        note = Note(
            title=title,
            content=content,
            user_id=user_id,
            group_id=group_id,
            color=color,
            is_hidden=is_hidden,
            is_disposable=is_disposable
        )

        db.session.add(note)

        # Añadir categorías si se proporcionan
        if categories and isinstance(categories, list):
            NoteService.add_categories_to_note(note, categories)

        db.session.commit()
        return note

    @staticmethod
    def update_note(note_id, title=None, content=None, color=None,
                    is_hidden=None, is_disposable=None, user_id=None, categories=None):
        """
        Actualiza una nota existente.
        Si se proporciona user_id, verifica que el usuario pueda editar la nota.
        """
        note = Note.query.get_or_404(note_id)

        if user_id and note.user_id != user_id and note.group_id:
            # Verificar si el usuario es miembro del grupo al que pertenece la nota
            is_member = db.session.query(GroupMember).filter(
                and_(GroupMember.group_id == note.group_id, GroupMember.user_id == user_id)
            ).first() is not None

            if not is_member:
                return None  # El usuario no tiene permiso para editar esta nota

        # Procesamiento de contenido para detectar categorías en formato .categoria.
        if content:
            import re
            category_names = []

            # Buscar todas las ocurrencias de .categoria. en el contenido
            pattern = r'\.([a-zA-Z0-9_-]+)\.'
            matches = re.finditer(pattern, content)

            # Recolectar nombres de categorías y posiciones para luego eliminarlas del texto
            positions = []
            for match in matches:
                category_name = match.group(1)
                category_names.append(category_name)
                positions.append((match.start(), match.end()))

            # Eliminar las etiquetas .categoria. del contenido, empezando por el final para no afectar índices
            if positions:
                new_content = content
                for start, end in sorted(positions, reverse=True):
                    new_content = new_content[:start] + new_content[end:]
                content = new_content

            # Crear categorías personales si no existen y añadirlas a la lista
            if category_names:
                from app.services.category_service import CategoryService
                for name in category_names:
                    existing_category = db.session.query(Category).filter(
                        Category.name == name,
                        Category.type == 'personal',
                        Category.user_id == user_id
                    ).first()

                    if not existing_category:
                        # Crear nueva categoría
                        new_category = CategoryService.create_personal_category(
                            name=name,
                            user_id=user_id,
                            color="#4361ee"  # Color predeterminado
                        )

                        # Añadir ID de la nueva categoría
                        if categories is None:
                            categories = []
                        categories.append(str(new_category.id))
                    else:
                        # Añadir ID de categoría existente
                        if categories is None:
                            categories = []
                        if str(existing_category.id) not in categories:
                            categories.append(str(existing_category.id))

        if title is not None:
            note.title = title
        if content is not None:
            note.content = content
        if color is not None:
            note.color = color
        if is_hidden is not None:
            note.is_hidden = is_hidden
        if is_disposable is not None:
            note.is_disposable = is_disposable

        # Actualizar categorías si se proporcionan
        if categories is not None:
            NoteService.update_note_categories(note, categories)

        db.session.commit()
        return note

    @staticmethod
    def delete_note(note_id, user_id=None):
        """
        Elimina una nota.
        Si se proporciona user_id, verifica que el usuario pueda eliminar la nota.
        """
        note = Note.query.get_or_404(note_id)

        if user_id and note.user_id != user_id:
            # Solo el creador de la nota puede eliminarla
            return False

        db.session.delete(note)
        db.session.commit()
        return True

    @staticmethod
    def add_categories_to_note(note, category_ids):
        """Añade categorías a una nota"""
        for category_id in category_ids:
            category = Category.query.get(category_id)
            if category:
                # Verificar que el usuario puede usar esta categoría
                if (category.type == 'personal' and category.user_id == note.user_id) or \
                        (category.type == 'group' and category.group_id == note.group_id):
                    # Evitar duplicados
                    exists = db.session.query(NoteCategory).filter_by(
                        note_id=note.id,
                        category_id=category.id
                    ).first() is not None

                    if not exists:
                        note_category = NoteCategory(note_id=note.id, category_id=category.id)
                        db.session.add(note_category)

    @staticmethod
    def update_note_categories(note, category_ids):
        """Actualiza las categorías de una nota (reemplaza las existentes)"""
        # Eliminar todas las asociaciones actuales
        db.session.query(NoteCategory).filter_by(note_id=note.id).delete()

        # Añadir nuevas asociaciones
        if category_ids:
            NoteService.add_categories_to_note(note, category_ids)

    @staticmethod
    def get_notes_by_category(category_id, user_id=None):
        """Obtiene todas las notas que tienen una categoría específica"""
        category = Category.query.get_or_404(category_id)

        # Verificar que el usuario puede ver esta categoría
        if user_id and category.type == 'personal' and category.user_id != user_id:
            return []

        if user_id and category.type == 'group':
            # Verificar que el usuario es miembro del grupo
            is_member = db.session.query(GroupMember).filter(
                and_(GroupMember.group_id == category.group_id, GroupMember.user_id == user_id)
            ).first() is not None

            if not is_member:
                return []

        return category.notes.order_by(Note.created_at.desc()).all()