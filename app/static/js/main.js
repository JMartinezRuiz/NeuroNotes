// Script principal para NotasApp
document.addEventListener('DOMContentLoaded', function() {
    // Auto-ocultar mensajes flash después de 4 segundos
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

    // Animación para las tarjetas de notas
    const noteCards = document.querySelectorAll('.note-card');
    noteCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';

        // Retraso escalonado para crear un efecto de cascada
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 + index * 50);
    });

    // Efecto de elevación al hacer hover en dispositivos móviles
    if (window.innerWidth <= 768) {
        noteCards.forEach(card => {
            card.addEventListener('touchstart', () => {
                card.style.transform = 'translateY(-2px)';
                card.style.boxShadow = '0 8px 15px rgba(0, 0, 0, 0.1)';
            }, { passive: true });

            card.addEventListener('touchend', () => {
                setTimeout(() => {
                    card.style.transform = '';
                    card.style.boxShadow = '';
                }, 300);
            }, { passive: true });
        });
    }

    // Efecto de ondulación para botones
    const buttons = document.querySelectorAll('.btn, .action-btn, .floating-action-btn');
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            ripple.classList.add('ripple-effect');

            // Posicionar el efecto donde se hizo clic
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';

            this.appendChild(ripple);

            // Eliminar el efecto después de la animación
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
});

// Añadir estilos adicionales para efectos visuales
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .ripple-effect {
            position: absolute;
            background: rgba(255, 255, 255, 0.4);
            border-radius: 50%;
            transform: scale(0);
            animation: ripple 0.6s linear;
            pointer-events: none;
            width: 100px;
            height: 100px;
            margin-left: -50px;
            margin-top: -50px;
        }

        @keyframes ripple {
            to {
                transform: scale(2.5);
                opacity: 0;
            }
        }

        .btn, .action-btn, .floating-action-btn {
            position: relative;
            overflow: hidden;
        }

        .note-card {
            transition: transform 0.3s ease, box-shadow 0.3s ease, opacity 0.5s ease;
        }

        @media (prefers-reduced-motion: reduce) {
            * {
                transition: none !important;
                animation: none !important;
            }
        }
    </style>
`);