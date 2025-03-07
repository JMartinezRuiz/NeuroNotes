# Filtros personalizados para plantillas

from flask import Flask
import jinja2
import re


def nl2br(value):
    """
    Convierte los saltos de línea en etiquetas <br>
    Útil para mostrar textos con saltos de línea en HTML
    """
    if not value:
        return ""
    value = jinja2.escape(value)
    return value.replace('\n', '<br>\n')


def register_filters(app: Flask):
    """
    Registra todos los filtros personalizados en la aplicación Flask
    """
    app.jinja_env.filters['nl2br'] = nl2br