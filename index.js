// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    // Función para manejar el registro
    document.getElementById("btnRegister")?.addEventListener("click", () => {
        const email = document.getElementById("registerEmail").value;
        const password = document.getElementById("registerPassword").value;
        
        if (email && password) {
            if (typeof registerUser === 'function') {
                registerUser(email, password);
            } else {
                alert("Función de registro no disponible");
            }
        } else {
            alert("Por favor ingrese correo y contraseña");
        }
    });

    // Función para manejar el login
    document.getElementById("btnLogin")?.addEventListener("click", () => {
        const email = document.getElementById("loginEmail").value;
        const password = document.getElementById("loginPassword").value;
        
        if (email && password) {
            if (typeof loginUser === 'function') {
                loginUser(email, password);
            } else {
                alert("Función de login no disponible");
            }
        } else {
            alert("Por favor ingrese correo y contraseña");
        }
    });

    // Manejo del switch de tema
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        // Establecer estado inicial basado en localStorage
        const savedTheme = localStorage.getItem('theme') || 'light';
        themeToggle.checked = savedTheme === 'dark';
        
        themeToggle.addEventListener('change', function() {
            if (typeof applyTheme === 'function') {
                applyTheme(this.checked ? 'dark' : 'light');
            }
        });
    }

    // Cerrar sidebar al hacer clic fuera
    document.addEventListener('click', function(event) {
        const sidebar = document.getElementById('appSidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        
        if (sidebar && sidebar.classList.contains('active') && 
            !sidebar.contains(event.target) && 
            !sidebarToggle.contains(event.target)) {
            sidebar.classList.remove('active');
        }
    });

    // Navegación por secciones
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const target = this.getAttribute('href')?.replace('#', '');
            if (target && typeof showSection === 'function') {
                showSection(target);
            }
        });
    });

    // Accesos directos
    document.querySelectorAll('.quick-card').forEach(card => {
        card.addEventListener('click', function() {
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });

    // Manejo de formularios con Enter
    document.querySelectorAll('.rounded-input').forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                if (this.closest('#registerForm')) {
                    document.getElementById('btnRegister').click();
                } else if (this.closest('#loginForm')) {
                    document.getElementById('btnLogin').click();
                }
            }
        });
    });

    // Manejo del modal de novedades
    const newsModal = document.getElementById('newsModal');
    const closeModalBtn = document.querySelector('.close-modal-btn');
    
    if (newsModal) {
        // Cerrar modal haciendo clic fuera
        newsModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeNewsModal();
            }
        });
        
        // Cerrar modal con Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && newsModal.classList.contains('active')) {
                closeNewsModal();
            }
        });
    }
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeNewsModal);
    }

    // Agregar efectos visuales a botones
    function addButtonEffects() {
        const buttons = document.querySelectorAll('button, .quick-card');
        buttons.forEach(button => {
            button.addEventListener('mousedown', function() {
                this.style.transform = 'scale(0.98)';
            });
            
            button.addEventListener('mouseup', function() {
                this.style.transform = '';
            });
            
            button.addEventListener('mouseleave', function() {
                this.style.transform = '';
            });
        });
    }
    
    addButtonEffects();
});

// Función para mostrar/ocultar secciones
function toggleSection(sectionId) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
        activeSection.classList.add('active');
    }
}

// Funciones del modal
function openNewsModal() {
    const modal = document.getElementById('newsModal');
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        
        // Recargar novedades si existe la función
        if (typeof loadNews === 'function') {
            loadNews();
        }
    }
}

function closeNewsModal() {
    const modal = document.getElementById('newsModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
}

// Función para filtrar novedades por categoría
function filterNews(category) {
    const newsItems = document.querySelectorAll('.news-item');
    newsItems.forEach(item => {
        if (category === 'all') {
            item.style.display = 'block';
        } else if (item.getAttribute('data-category') === category) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Función para refrescar novedades
function refreshNews() {
    if (typeof loadNews === 'function') {
        const newsContainer = document.getElementById('newsContainer');
        if (newsContainer) {
            newsContainer.innerHTML = '<div class="loading-news"><p>Cargando novedades...</p></div>';
        }
        loadNews();
    }
}