# Filtros personalizados para plantillas

from flask import Flask
from markupsafe import escape, Markup

def nl2br(value):
    """
    Convierte los saltos de línea en etiquetas <br>
    Útil para mostrar textos con saltos de línea en HTML
    """
    if not value:
        return ""
    value = escape(value)
    return Markup(value.replace('\n', '<br>\n'))


def register_filters(app: Flask):
    """
    Registra todos los filtros personalizados en la aplicación Flask
    """
    app.jinja_env.filters['nl2br'] = nl2br