// Script principal para NotasApp
document.addEventListener('DOMContentLoaded', function() {
    // Auto-ocultar mensajes flash después de 5 segundos
    const flashMessages = document.querySelectorAll('.flash-message');
    if (flashMessages.length > 0) {
        setTimeout(() => {
            flashMessages.forEach(message => {
                message.style.opacity = '0';
                setTimeout(() => {
                    message.remove();
                }, 300);
            });
        }, 5000);
    }

    // Animación para las tarjetas de notas
    const noteCards = document.querySelectorAll('.note-card');
    noteCards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.05}s`;
        card.classList.add('fade-in');
    });
});

// Añadir clase para animación
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .fade-in {
            animation: fadeInUp 0.5s ease forwards;
            opacity: 0;
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    </style>
`);