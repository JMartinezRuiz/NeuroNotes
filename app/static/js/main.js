// Script para PWA optimizado para Android
document.addEventListener('DOMContentLoaded', function() {
  // Comprobar si es Android
  const isAndroid = /Android/.test(navigator.userAgent);

  // Verificar si la PWA está instalada
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone;

  // Crear botón de instalación
  const installButton = document.createElement('button');
  installButton.style.display = 'none';
  installButton.classList.add('btn', 'btn-primary', 'install-button');
  installButton.innerHTML = `
    <span class="btn-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 9l-5 5-5-5M12 12.8V2.5"></path>
      </svg>
    </span>
    Instalar App
  `;

  // Añadir el botón al DOM
  const navLinks = document.querySelector('.nav-links');
  if (navLinks && !document.querySelector('.install-button')) {
    navLinks.appendChild(installButton);
  }

  // Solo mostrar botón de instalación si es Android y no está en modo standalone
  if (isAndroid && !isStandalone) {
    // Variable para guardar el evento de instalación
    let deferredPrompt;

    // Capturar evento de instalación
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevenir la visualización automática del banner
      e.preventDefault();

      // Guardar el evento
      deferredPrompt = e;

      // Mostrar el botón de instalación
      installButton.style.display = 'inline-flex';

      // Logging
      console.log('[PWA] Evento beforeinstallprompt capturado');
    });

    // Manejar clic en el botón de instalación
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) {
        console.log('[PWA] No hay evento de instalación disponible');
        return;
      }

      // Mostrar diálogo de instalación
      deferredPrompt.prompt();

      // Esperar a que el usuario responda
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA] Resultado de instalación: ${outcome}`);

      // Limpiar el evento
      deferredPrompt = null;

      // Ocultar el botón
      installButton.style.display = 'none';
    });

    // Detectar cuando la app ha sido instalada
    window.addEventListener('appinstalled', (e) => {
      console.log('[PWA] Aplicación instalada correctamente');
      installButton.style.display = 'none';
    });
  }

  // Registrar Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('[PWA] Service Worker registrado:', registration.scope);
      })
      .catch(error => {
        console.error('[PWA] Error al registrar Service Worker:', error);
      });
  }

// Script principal para NotasApp - Optimizado para móviles
document.addEventListener('DOMContentLoaded', function() {
    // Detectar si es dispositivo móvil
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    // Detectar si es iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // Fix para altura de la ventana en móviles
    if (isIOS) {
        // Fix para vh en iOS
        const appHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };

        window.addEventListener('resize', appHeight);
        appHeight();
    }

    // Auto-ocultar mensajes flash mejorado
    const flashMessages = document.querySelectorAll('.flash-message');
    if (flashMessages.length > 0) {
        setTimeout(() => {
            flashMessages.forEach(message => {
                message.style.opacity = '0';
                message.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    message.remove();
                }, 300);
            });
        }, 4000);
    }

    // Ripple effect para botones y elementos interactivos
    const addRippleEffect = (elements) => {
        elements.forEach(element => {
            element.addEventListener('click', function(e) {
                // Crear el efecto solo en dispositivos no táctiles
                const isTouch = 'ontouchstart' in window || navigator.msMaxTouchPoints;
                if (isTouch) return;

                const ripple = document.createElement('span');
                ripple.classList.add('ripple');
                this.appendChild(ripple);

                // Posicionar el efecto donde se hizo clic
                const rect = this.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height) * 2;

                ripple.style.width = ripple.style.height = `${size}px`;
                ripple.style.left = `${e.clientX - rect.left - size/2}px`;
                ripple.style.top = `${e.clientY - rect.top - size/2}px`;

                // Eliminar el elemento después de la animación
                ripple.addEventListener('animationend', () => {
                    ripple.remove();
                });
            });
        });
    };

    // Aplicar efecto de ripple a botones
    addRippleEffect(document.querySelectorAll('.btn, .action-btn, .floating-action-btn'));

    // Lazy loading para las notas (animación escalonada)
    const noteCards = document.querySelectorAll('.note-card');
    if (noteCards.length > 0) {
        // Crear instancia de IntersectionObserver solo si hay notas
        const notesObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry, index) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.classList.add('visible');
                    }, index * 50);
                    notesObserver.unobserve(entry.target);
                }
            });
        }, {
            root: null,
            threshold: 0.1,
            rootMargin: '0px 0px 50px 0px'
        });

        // Observar cada tarjeta de nota
        noteCards.forEach(card => {
            card.classList.add('note-card-hidden');
            notesObserver.observe(card);
        });
    }

    // Mejora para elementos táctiles en móviles
    if (isMobile) {
        document.querySelectorAll('.note-card, .btn, .action-btn').forEach(element => {
            // Añadir feedback táctil en dispositivos móviles
            element.addEventListener('touchstart', function() {
                this.classList.add('touch-active');
            }, { passive: true });

            element.addEventListener('touchend', function() {
                this.classList.remove('touch-active');
            }, { passive: true });

            element.addEventListener('touchcancel', function() {
                this.classList.remove('touch-active');
            }, { passive: true });
        });
    }

    // Manejar confirmaciones en móviles de forma más amigable
    const deleteButtons = document.querySelectorAll('.delete-btn');
    deleteButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            if (isMobile) {
                e.preventDefault();

                // Crear modal de confirmación inline
                const noteCard = this.closest('.note-card');
                if (noteCard) {
                    // Verificar si ya existe un confirm-panel
                    if (noteCard.querySelector('.confirm-panel')) return;

                    const confirmPanel = document.createElement('div');
                    confirmPanel.className = 'confirm-panel';
                    confirmPanel.innerHTML = `
                        <p>¿Estás seguro?</p>
                        <div class="confirm-actions">
                            <button type="button" class="btn btn-text confirm-cancel">Cancelar</button>
                            <button type="button" class="btn btn-danger confirm-delete">Eliminar</button>
                        </div>
                    `;

                    // Insertar panel de confirmación
                    const actionsPanel = this.closest('.note-card-actions');
                    actionsPanel.style.display = 'none';
                    noteCard.appendChild(confirmPanel);

                    // Manejar acción de cancelar
                    confirmPanel.querySelector('.confirm-cancel').addEventListener('click', () => {
                        actionsPanel.style.display = 'flex';
                        confirmPanel.remove();
                    });

                    // Manejar acción de eliminar
                    confirmPanel.querySelector('.confirm-delete').addEventListener('click', () => {
                        this.closest('form').submit();
                    });

                    // Añadir animación
                    setTimeout(() => confirmPanel.classList.add('active'), 10);
                }
            }
        });
    });

    // Agregar estilos CSS para las nuevas características
    const addCustomStyles = () => {
        const style = document.createElement('style');
        style.textContent = `
            .note-card-hidden {
                opacity: 0;
                transform: translateY(20px);
            }

            .note-card.visible {
                opacity: 1;
                transform: translateY(0);
                transition: opacity 0.3s ease, transform 0.3s ease;
            }

            .touch-active {
                transform: scale(0.98) !important;
                transition: transform 0.2s ease !important;
            }

            .confirm-panel {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                background-color: #fff;
                padding: 16px;
                border-top: 1px solid var(--border-color);
                border-radius: 0 0 var(--border-radius-md) var(--border-radius-md);
                transform: translateY(100%);
                opacity: 0;
                transition: transform 0.3s ease, opacity 0.3s ease;
                z-index: 5;
            }

            .confirm-panel.active {
                transform: translateY(0);
                opacity: 1;
            }

            .confirm-panel p {
                margin-bottom: 12px;
                font-weight: 500;
                text-align: center;
            }

            .confirm-actions {
                display: flex;
                justify-content: space-between;
                gap: 8px;
            }

            .confirm-actions button {
                flex: 1;
            }

            @media (min-width: 768px) {
                .confirm-panel {
                    display: none;
                }
            }

            html {
                height: -webkit-fill-available;
            }

            body {
                min-height: 100vh;
                min-height: calc(var(--vh, 1vh) * 100);
            }
        `;
        document.head.appendChild(style);
    };

    addCustomStyles();

    // Ajustar la altura de la ventana cuando cambia la orientación
    window.addEventListener('orientationchange', function() {
        setTimeout(() => {
            if (isIOS) {
                const vh = window.innerHeight * 0.01;
                document.documentElement.style.setProperty('--vh', `${vh}px`);
            }
        }, 100);
    });

    // Manejador de efectos para elementos dinámicos
    const setupDynamicElements = () => {
        // Para cualquier elemento que podría añadirse dinámicamente al DOM
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Elemento Node
                            const buttons = node.querySelectorAll('.btn, .action-btn');
                            if (buttons.length) {
                                addRippleEffect(buttons);

                                if (isMobile) {
                                    buttons.forEach(button => {
                                        button.addEventListener('touchstart', function() {
                                            this.classList.add('touch-active');
                                        }, { passive: true });

                                        button.addEventListener('touchend', function() {
                                            this.classList.remove('touch-active');
                                        }, { passive: true });
                                    });
                                }
                            }
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    };

    setupDynamicElements();
});