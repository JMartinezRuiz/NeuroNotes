# Blueprint para rutas PWA
from flask import Blueprint, send_from_directory
import os

pwa_bp = Blueprint('pwa', __name__)

@pwa_bp.route('/service-worker.js')
def service_worker():
    """Ruta para servir el service worker desde la raíz"""
    return send_from_directory(
        os.path.join('app', 'static', 'js'),
        'service-worker.js'
    )

@pwa_bp.route('/manifest.json')
def manifest():
    """Ruta para servir el manifest.json desde la raíz"""
    return send_from_directory(
        os.path.join('app', 'static'),
        'manifest.json'
    )