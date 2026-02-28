// ===== CONFIGURACIÓN PRINCIPAL =====
class App {
    constructor() {
        this.currentUserData = null;
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        this.theme = localStorage.getItem('theme') || 'light';
        this.colorTheme = localStorage.getItem('colorTheme') || 'red';
        this.selectedDay = null;
        this.notifications = [];
        this.friendRequests = [];
        this.friendsList = [];
        this.sentRequests = [];
        this.currentFriendsTab = 'friends-list';
        this.commentLikes = {};
        this._notifUnsubscribe = null;
        this._chatUnsubscribe = null;
        this._toastCount = 0;
        this._calendarCache = {}; // { 'YYYY-MM': { data, loadedAt } }
        
        this.init();
    }

    // ===== INICIALIZACIÓN =====
    init() {
        this.updateCurrentYear();
        this.setupEventListeners();
        this.applyThemeFromStorage();
        this.applyColorThemeFromStorage();
        this.checkAuthState();
        this.loadAppBranding();
    }

    updateCurrentYear() {
        const yearElement = document.getElementById('currentYear');
        if (yearElement) yearElement.textContent = new Date().getFullYear();
    }

    setupEventListeners() {
        document.getElementById('registerPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.registerUser();
        });
        document.getElementById('loginPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loginUser();
        });
        document.getElementById('resetEmail')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendPasswordReset();
        });

        const searchInput = document.getElementById('searchUserId');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                const lengthDisplay = document.getElementById('inputLength');
                if (lengthDisplay) lengthDisplay.textContent = val.length + '/5';
                searchInput.classList.remove('input-error', 'input-valid');
                if (val.length === 5) searchInput.classList.add('input-valid');
                else if (val.length > 0) searchInput.classList.add('input-error');
            });
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchUserById();
            });
        }

        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) sidebarToggle.addEventListener('click', () => this.toggleSidebar());

        // Logo LC - abre modal con significado de las letras
        const brandBtn = document.getElementById('brandBtn');
        if (brandBtn) brandBtn.addEventListener('click', () => this.openBrandMeaningModal());

        // Overlay para cerrar sidebar al hacer click afuera
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) overlay.addEventListener('click', () => this.toggleSidebar(false));

        document.getElementById('prevMonth')?.addEventListener('click', () => this.prevMonth());
        document.getElementById('nextMonth')?.addEventListener('click', () => this.nextMonth());

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.checked = localStorage.getItem('theme') === 'dark';
            themeToggle.addEventListener('change', () => this.toggleTheme());
        }

        this.setupNotificationSettings();
        this.setupModalEvents();

        const commentTextarea = document.getElementById('dayCommentText');
        if (commentTextarea) commentTextarea.addEventListener('input', () => this.updateCharCount());

        // Show password toggles
        this.setupPasswordToggles();
    }

    setupPasswordToggles() {
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                const input = document.getElementById(targetId);
                if (!input) return;
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
                }
            });
        });
    }

    setupModalEvents() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                // FIX: confirmModal NO debe cerrarse con click afuera
                if (modal.id === 'confirmModal') return;
                if (e.target === modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = 'auto';
                }
            });
        });
        // FIX memory leak: Escape key resuelve confirmModal con false
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const confirmModal = document.getElementById('confirmModal');
                if (confirmModal && confirmModal.classList.contains('active')) {
                    const cancelBtn = document.getElementById('confirmModalCancel');
                    if (cancelBtn) cancelBtn.click();
                    return;
                }
                const activeModal = document.querySelector('.modal.active');
                if (activeModal) {
                    activeModal.classList.remove('active');
                    document.body.style.overflow = 'auto';
                }
            }
        });
    }

    setAuthButtonsLoading(loading) {
        const loginBtn = document.getElementById('btnLogin');
        const registerBtn = document.getElementById('btnRegister');
        [loginBtn, registerBtn].forEach(btn => {
            if (!btn) return;
            btn.disabled = loading;
            if (loading) {
                btn._originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
            } else if (btn._originalText) {
                btn.innerHTML = btn._originalText;
            }
        });
    }

    // ===== SPLASH SCREEN =====
    hideSplashScreen() {
        const splash = document.getElementById('splashScreen');
        if (splash) {
            splash.classList.add('splash-fade-out');
            setTimeout(() => splash.remove(), 500);
        }
    }

    // ===== AUTH STATE =====
    checkAuthState() {
        if (!window.firebase || !window.firebase.auth) {
            this.setAuthButtonsLoading(true);
            setTimeout(() => this.checkAuthState(), 200);
            return;
        }

        this.setAuthButtonsLoading(false);

        window.firebase.auth.onAuthStateChanged((user) => {
            if (user) {
                const isNewLogin = !this._wasLoggedIn;
                this._wasLoggedIn = true;
                this.loadUserProfile(user.uid);
                this.hideAllAuthScreens();
                document.getElementById('mainApp').classList.remove('hidden');
                this.showSection('inicioSection');
                // FIX: solo mostrar bienvenido en login nuevo, no en recarga de página
                if (isNewLogin) {
                    this.showNotification('¡Bienvenido de nuevo!', 'success');
                }
                this.hideSplashScreen();
            } else {
                this._wasLoggedIn = false;
                this.hideSplashScreen();
                document.getElementById('loginScreen').classList.remove('hidden');
                document.getElementById('registerScreen').classList.add('hidden');
                document.getElementById('mainApp').classList.add('hidden');
            }
        });
    }

    async loadUserProfile(userId) {
        try {
            const { doc, getDoc, setDoc } = window.firebase.firebaseModules;
            const userRef = doc(window.firebase.firestore, 'users', userId);
            const userDoc = await getDoc(userRef);

            if (userDoc.exists()) {
                this.currentUserData = { uid: userId, ...userDoc.data() };
                this.updateUserUI();
                this.loadUserData();
                this.updateAvatars();
                this.setupNotificationSettings();
                this.setupNotificationsRealtime(userId);
                await setDoc(userRef, { lastLogin: new Date().toISOString() }, { merge: true });
            } else {
                const newUserId = await this.generateUniqueUserId();
                const userData = {
                    username: 'Usuario',
                    email: window.firebase.auth.currentUser?.email || '',
                    userId: newUserId,
                    createdAt: new Date().toISOString(),
                    lastLogin: new Date().toISOString(),
                    bio: '',
                    theme: this.theme,
                    colorTheme: this.colorTheme,
                    notificationSettings: {
                        friendRequests: true,
                        news: true,
                        comments: true,
                        sound: true
                    },
                    avatar: null
                };
                await setDoc(userRef, userData);
                this.currentUserData = { uid: userId, ...userData };
                this.updateUserUI();
                this.loadUserData();
                this.updateAvatars();
                this.setupNotificationsRealtime(userId);
                this.showNotification('¡Perfil creado exitosamente!', 'success');
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
            this.showNotification('Error al cargar perfil', 'error');
        }
    }

    // ===== LISTENER EN TIEMPO REAL PARA NOTIFICACIONES =====
    setupNotificationsRealtime(userId) {
        if (this._notifUnsubscribe) this._notifUnsubscribe();
        try {
            const { collection, query, where, onSnapshot } = window.firebase.firebaseModules;
            const notifQuery = query(
                collection(window.firebase.firestore, 'notifications'),
                where('userId', '==', userId),
                where('read', '==', false)
            );
            this._notifUnsubscribe = onSnapshot(notifQuery, (snapshot) => {
                const unread = snapshot.size;
                const badge = document.getElementById('notificationBadge');
                if (badge) {
                    badge.textContent = unread > 99 ? '99+' : unread;
                    badge.classList.toggle('hidden', unread === 0);
                }
                const modal = document.getElementById('notificationsModal');
                if (modal && modal.classList.contains('active') && !this._notificationsLoading) {
                    this.loadNotifications();
                }
            }, (error) => {
                console.warn('Error en listener de notificaciones:', error);
            });
        } catch (error) {
            console.warn('onSnapshot no disponible:', error);
        }
    }

    // ===== GENERACIÓN DE USER ID ÚNICO =====
    async generateUniqueUserId() {
        const { collection, query, where, getDocs } = window.firebase.firebaseModules;
        const maxAttempts = 20;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const candidate = Math.floor(10000 + Math.random() * 90000).toString();
            try {
                const usersRef = collection(window.firebase.firestore, 'users');
                const q = query(usersRef, where('userId', '==', candidate));
                const snap = await getDocs(q);
                if (snap.empty) return candidate;
            } catch (e) {
                console.warn('Error verificando ID:', e);
                return candidate;
            }
        }
        return Math.floor(10000 + Math.random() * 90000).toString();
    }

    updateUserUI() {
        if (!this.currentUserData) return;
        const elements = {
            'welcomeName': this.currentUserData.username,
            'dashboardUsername': this.currentUserData.username,
            'miniUsername': this.currentUserData.username,
            'dashboardEmail': this.currentUserData.email,
            'miniUserEmail': this.currentUserData.email,
            'userIdText': `#${this.currentUserData.userId}`,
            'dashboardUserId': `#${this.currentUserData.userId}`,
            'currentUserIdDisplay': this.currentUserData.userId
        };
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
        const sinceElement = document.getElementById('dashboardSince');
        if (sinceElement && this.currentUserData.createdAt) {
            sinceElement.textContent = new Date(this.currentUserData.createdAt).toLocaleDateString('es-ES');
        }
        const bioEl = document.getElementById('profileBio');
        if (bioEl) bioEl.textContent = this.currentUserData.bio || 'Sin bio — toca para editar';
    }

    // ===== SISTEMA DE AVATAR =====
    updateAvatars() {
        if (!this.currentUserData) return;
        const avatar = this.currentUserData.avatar;
        const username = this.currentUserData.username || 'Usuario';
        this.updateAvatarElement('sidebarUserAvatar', avatar, username);
        this.updateAvatarElement('dashboardUserAvatar', avatar, username);
        this.updateAvatarElement('commentUserAvatar', avatar, username);
    }

    updateAvatarElement(elementId, avatar, username) {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.innerHTML = '';
        element.removeAttribute('style');
        if (avatar) {
            if (avatar.startsWith('http') || avatar.startsWith('https')) {
                const img = document.createElement('img');
                img.src = avatar;
                img.alt = username;
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                element.appendChild(img);
            } else if (this.isEmoji(avatar)) {
                element.textContent = avatar;
                element.style.fontSize = elementId.includes('large') ? '2rem' : '1.2rem';
                element.style.display = 'flex';
                element.style.alignItems = 'center';
                element.style.justifyContent = 'center';
            }
        } else {
            const initial = username.charAt(0).toUpperCase();
            element.textContent = initial;
            element.style.display = 'flex';
            element.style.alignItems = 'center';
            element.style.justifyContent = 'center';
            element.style.fontWeight = '600';
            const colors = ['#EF4444','#3B82F6','#10B981','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'];
            element.style.backgroundColor = colors[initial.charCodeAt(0) % colors.length];
            element.style.color = 'white';
        }
    }

    isEmoji(text) {
        const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu;
        return emojiRegex.test(text);
    }

    // ===== AUTENTICACIÓN =====
    async registerUser() {
        const usernameInput = document.getElementById('registerUsername');
        const emailInput = document.getElementById('registerEmail');
        const passwordInput = document.getElementById('registerPassword');
        const confirmPasswordInput = document.getElementById('registerConfirmPassword');
        const registerBtn = document.getElementById('btnRegister');

        if (!usernameInput || !emailInput || !passwordInput || !confirmPasswordInput || !registerBtn) {
            this.showNotification('Error en el formulario de registro', 'error');
            return;
        }

        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!username || !email || !password || !confirmPassword) {
            this.showNotification('Por favor completa todos los campos', 'error');
            return;
        }
        if (password !== confirmPassword) {
            this.showNotification('Las contraseñas no coinciden', 'error');
            return;
        }
        if (password.length < 6) {
            this.showNotification('La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        if (!this.isValidEmail(email)) {
            this.showNotification('Correo electrónico inválido', 'error');
            return;
        }
        if (username.length < 2) {
            this.showNotification('El nombre debe tener al menos 2 caracteres', 'error');
            return;
        }

        const originalText = registerBtn.innerHTML;
        registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando cuenta...';
        registerBtn.disabled = true;

        try {
            const isUsernameTaken = await this.checkUsernameExists(username);
            if (isUsernameTaken) {
                this.showNotification('Ese nombre de usuario ya está en uso', 'error');
                registerBtn.innerHTML = originalText;
                registerBtn.disabled = false;
                return;
            }

            const { createUserWithEmailAndPassword, updateProfile } = window.firebase.firebaseModules;
            const userCredential = await createUserWithEmailAndPassword(window.firebase.auth, email, password);
            await updateProfile(userCredential.user, { displayName: username });

            const { doc, setDoc } = window.firebase.firebaseModules;
            const userRef = doc(window.firebase.firestore, 'users', userCredential.user.uid);
            const uniqueId = await this.generateUniqueUserId();

            await setDoc(userRef, {
                username: username,
                email: email,
                userId: uniqueId,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                bio: '',
                theme: 'light',
                colorTheme: 'red',
                notificationSettings: {
                    friendRequests: true,
                    news: true,
                    comments: true,
                    sound: true
                },
                avatar: null
            });

            this.showNotification('¡Cuenta creada exitosamente!', 'success');

            await this.createNotification(
                userCredential.user.uid,
                '¡Bienvenido a LC App!',
                'Tu cuenta ha sido creada exitosamente. ¡Empieza a explorar todas las funciones!',
                'success'
            );

            usernameInput.value = '';
            emailInput.value = '';
            passwordInput.value = '';
            confirmPasswordInput.value = '';

        } catch (error) {
            console.error('Error en registro:', error);
            let message = 'Error al crear la cuenta';
            switch (error.code) {
                case 'auth/email-already-in-use': message = 'El correo electrónico ya está en uso'; break;
                case 'auth/invalid-email': message = 'Correo electrónico inválido'; break;
                case 'auth/weak-password': message = 'La contraseña es demasiado débil'; break;
                case 'auth/operation-not-allowed': message = 'Operación no permitida'; break;
                default: message = `Error: ${error.message}`;
            }
            this.showNotification(message, 'error');
        } finally {
            registerBtn.innerHTML = originalText;
            registerBtn.disabled = false;
        }
    }

    async checkUsernameExists(username) {
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const usersRef = collection(window.firebase.firestore, 'users');
            const q = query(usersRef, where('username', '==', username));
            const snap = await getDocs(q);
            return !snap.empty;
        } catch (e) {
            console.warn('No se pudo verificar username:', e);
            return false;
        }
    }

    async loginUser() {
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        const loginBtn = document.getElementById('btnLogin');

        if (!emailInput || !passwordInput || !loginBtn) {
            this.showNotification('Error en el formulario de login', 'error');
            return;
        }

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            this.showNotification('Por favor completa todos los campos', 'error');
            return;
        }

        const originalText = loginBtn.innerHTML;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando sesión...';
        loginBtn.disabled = true;

        try {
            const { signInWithEmailAndPassword } = window.firebase.firebaseModules;
            await signInWithEmailAndPassword(window.firebase.auth, email, password);
            this._wasLoggedIn = false; // FIX: marcar como login nuevo para que onAuthStateChanged muestre bienvenido
            this.showNotification('¡Inicio de sesión exitoso!', 'success');
            emailInput.value = '';
            passwordInput.value = '';
        } catch (error) {
            console.error('Error en login:', error);
            let message = 'Error al iniciar sesión';
            switch (error.code) {
                case 'auth/invalid-credential':
                case 'auth/wrong-password': message = 'Correo o contraseña incorrectos'; break;
                case 'auth/user-not-found': message = 'Usuario no encontrado'; break;
                case 'auth/user-disabled': message = 'Usuario deshabilitado'; break;
                case 'auth/too-many-requests': message = 'Demasiados intentos. Intenta más tarde'; break;
                default: message = `Error: ${error.message}`;
            }
            this.showNotification(message, 'error');
        } finally {
            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;
        }
    }

    // ===== RECUPERAR CONTRASEÑA =====
    openForgotPasswordModal() {
        const modal = document.getElementById('forgotPasswordModal');
        if (modal) {
            const resetEmailInput = document.getElementById('resetEmail');
            const loginEmail = document.getElementById('loginEmail')?.value;
            if (resetEmailInput && loginEmail) resetEmailInput.value = loginEmail;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeForgotPasswordModal() {
        const modal = document.getElementById('forgotPasswordModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
        const resetEmail = document.getElementById('resetEmail');
        if (resetEmail) resetEmail.value = '';
    }

    async sendPasswordReset() {
        const emailInput = document.getElementById('resetEmail');
        const btn = document.querySelector('#forgotPasswordModal .btn-primary');
        const email = emailInput?.value.trim();

        if (!email) {
            this.showNotification('Ingresa tu correo electrónico', 'error');
            return;
        }
        if (!this.isValidEmail(email)) {
            this.showNotification('Correo electrónico inválido', 'error');
            return;
        }

        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; btn.disabled = true; }

        try {
            const { sendPasswordResetEmail } = window.firebase.firebaseModules;
            await sendPasswordResetEmail(window.firebase.auth, email);
            this.showNotification('¡Correo de recuperación enviado! Revisa tu bandeja de entrada.', 'success');
            this.closeForgotPasswordModal();
        } catch (error) {
            console.error('Error al enviar correo de recuperación:', error);
            let message = 'Error al enviar el correo';
            switch (error.code) {
                case 'auth/user-not-found': message = 'No existe una cuenta con ese correo'; break;
                case 'auth/invalid-email': message = 'Correo electrónico inválido'; break;
                case 'auth/too-many-requests': message = 'Demasiados intentos. Espera un momento'; break;
                default: message = `Error: ${error.message}`;
            }
            this.showNotification(message, 'error');
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    async logoutUser() {
        try {
            if (this._notifUnsubscribe) {
                this._notifUnsubscribe();
                this._notifUnsubscribe = null;
            }
            if (this._chatUnsubscribe) {
                this._chatUnsubscribe();
                this._chatUnsubscribe = null;
            }
            this._calendarCache = {}; // Borrar cache al cerrar sesion
            const { signOut } = window.firebase.firebaseModules;
            await signOut(window.firebase.auth);
            this.showNotification('Sesión cerrada exitosamente', 'success');
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            this.showNotification('Error al cerrar sesión', 'error');
        }
    }

    // ===== UI FUNCTIONS =====
    hideAllAuthScreens() {
        document.getElementById('loginScreen')?.classList.add('hidden');
        document.getElementById('registerScreen')?.classList.add('hidden');
    }

    showSection(sectionId) {
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        const section = document.getElementById(sectionId);
        if (section) {
            section.classList.add('active');
            // Scroll to top of main content instead of scrollIntoView (avoids header overlap)
            const mainContent = document.getElementById('mainContent');
            if (mainContent) mainContent.scrollTop = 0;
            window.scrollTo({ top: 0, behavior: 'smooth' });
            const navItem = document.querySelector(`.nav-item[onclick*="${sectionId}"]`);
            if (navItem) navItem.classList.add('active');
        }
        if (window.innerWidth < 769) this.toggleSidebar(false);
        switch (sectionId) {
            case 'calendarioSection': this.loadCalendar(); break;
            case 'amigosSection':
                this.loadFriendRequests();
                this.loadFriendsList();
                this.loadSentRequests();
                break;
        }
    }

    toggleSidebar(forceClose) {
        const sidebar = document.getElementById('appSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (!sidebar) return;
        if (forceClose === false) {
            sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
        } else {
            const isActive = sidebar.classList.toggle('active');
            if (overlay) overlay.classList.toggle('active', isActive);
        }
    }

    // ===== THEME FUNCTIONS =====
    applyThemeFromStorage() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.theme = savedTheme;
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(`${savedTheme}-theme`);
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.checked = savedTheme === 'dark';
        const themeBtn = document.querySelector('.theme-toggle-btn i');
        if (themeBtn) themeBtn.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    toggleTheme() {
        const newTheme = this.theme === 'light' ? 'dark' : 'light';
        this.theme = newTheme;
        localStorage.setItem('theme', newTheme);
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(`${newTheme}-theme`);
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.checked = newTheme === 'dark';
        const themeBtn = document.querySelector('.theme-toggle-btn i');
        if (themeBtn) themeBtn.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        this.showNotification(`Tema ${newTheme === 'dark' ? 'oscuro' : 'claro'} activado`, 'success');
        if (this.currentUserData) this.saveUserTheme(newTheme);
    }

    async saveUserTheme(theme) {
        try {
            const { doc, updateDoc } = window.firebase.firebaseModules;
            const userRef = doc(window.firebase.firestore, 'users', this.currentUserData.uid);
            await updateDoc(userRef, { theme });
        } catch (error) {
            console.error('Error saving theme:', error);
        }
    }

    applyColorThemeFromStorage() {
        const savedColor = localStorage.getItem('colorTheme') || 'red';
        this.colorTheme = savedColor;
        document.body.classList.remove('red', 'blue', 'green');
        document.body.classList.add(savedColor);
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === savedColor);
        });
    }

    async applyColorTheme(color) {
        this.colorTheme = color;
        localStorage.setItem('colorTheme', color);
        document.body.classList.remove('red', 'blue', 'green');
        document.body.classList.add(color);
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === color);
        });
        this.showNotification(`Color cambiado a ${color}`, 'success');
        if (this.currentUserData) {
            try {
                const { doc, updateDoc } = window.firebase.firebaseModules;
                const userRef = doc(window.firebase.firestore, 'users', this.currentUserData.uid);
                await updateDoc(userRef, { colorTheme: color });
            } catch (error) {
                console.error('Error saving color theme:', error);
            }
        }
    }

    // ===== CALENDAR FUNCTIONS =====
    async loadCalendar() {
        try {
            const calendarGrid = document.getElementById('calendarGrid');
            if (calendarGrid) calendarGrid.innerHTML = '<div class="calendar-loading"><i class="fas fa-spinner fa-spin"></i></div>';
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            const currentMonthElement = document.getElementById('currentMonth');
            if (currentMonthElement) currentMonthElement.textContent = `${monthNames[this.currentMonth]} ${this.currentYear}`;
            const currentWeekElement = document.getElementById('currentWeek');
            if (currentWeekElement) currentWeekElement.textContent = `Semana ${this.getWeekNumber(today)} del año`;
            const calendarContent = await this.loadCalendarContent();
            this.generateCalendarGrid(today, calendarContent);
        } catch (error) {
            console.error('Error loading calendar:', error);
            this.generateCalendarGrid(new Date(), {});
        }
    }

    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    async loadCalendarContent() {
        const key = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2,'0')}`;
        const cached = this._calendarCache[key];
        if (cached) return cached; // Usar cache - se borra al cerrar sesion o manualmente
        try {
            const { collection, getDocs, query, where } = window.firebase.firebaseModules;
            const calendarRef = collection(window.firebase.firestore, 'calendar_content');
            const q = query(calendarRef, where('status', '==', 'active'));
            const querySnapshot = await getDocs(q);
            const content = {};
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.date && data.visibility !== 'private') content[data.date] = data;
            });
            this._calendarCache[key] = content;
            return content;
        } catch (error) {
            console.error('Error loading calendar content:', error);
            return {};
        }
    }

    clearCalendarCache() {
        this._calendarCache = {};
        this.showNotification('Cache del calendario borrado', 'success');
        this.loadCalendar();
    }

    generateCalendarGrid(today, calendarContent) {
        const calendarGrid = document.getElementById('calendarGrid');
        if (!calendarGrid) return;
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        let firstDayOfWeek = firstDay.getDay();
        firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
        const totalDays = lastDay.getDate();
        let html = '';
        for (let i = 0; i < firstDayOfWeek; i++) html += '<div class="calendar-day empty"></div>';
        for (let day = 1; day <= totalDays; day++) {
            const date = new Date(this.currentYear, this.currentMonth, day);
            const dateStr = this.formatDate(date);
            const isToday = this.isSameDay(date, today);
            const isFuture = date > today;
            let dayClass = 'calendar-day';
            if (isToday) dayClass += ' today';
            const hasContent = calendarContent[dateStr] && !isFuture;
            if (hasContent) dayClass += ' has-content';
            if (isFuture) dayClass += ' future';
            const dayContent = hasContent ? '<div class="day-content-indicator"></div>' : '';
            html += `<div class="${dayClass}" onclick="app.openDayModal('${dateStr}')"><div class="day-number">${day}</div>${dayContent}</div>`;
        }
        calendarGrid.innerHTML = html;
    }

    // BUGFIX: Usar mediodía para evitar desfase de zona horaria
    parseLocalDate(dateStr) {
        const parts = dateStr.split('-');
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    prevMonth() {
        this.currentMonth--;
        if (this.currentMonth < 0) { this.currentMonth = 11; this.currentYear--; }
        this.loadCalendar();
    }

    nextMonth() {
        this.currentMonth++;
        if (this.currentMonth > 11) { this.currentMonth = 0; this.currentYear++; }
        this.loadCalendar();
    }

    goToToday() {
        const today = new Date();
        this.currentMonth = today.getMonth();
        this.currentYear = today.getFullYear();
        this.loadCalendar();
        this.showNotification('Volviste a hoy', 'success');
    }

    // ===== DAY MODAL FUNCTIONS =====
    async openDayModal(dateStr) {
        try {
            this.selectedDay = dateStr;
            const modal = document.getElementById('dayModal');
            if (!modal) return;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            const loading = document.getElementById('dayModalLoading');
            const content = document.getElementById('dayModalContent');
            const blocked = document.getElementById('dayModalBlocked');
            const comments = document.getElementById('dayCommentsSection');
            const title = document.getElementById('dayModalTitle');
            if (loading) loading.classList.remove('hidden');
            if (content) content.classList.add('hidden');
            if (blocked) blocked.classList.add('hidden');
            if (comments) comments.classList.add('hidden');

            // FIX: Comparar solo año/mes/día para evitar que "hoy" aparezca como bloqueado
            // parseLocalDate pone la hora en 12:00, pero today se normaliza a 00:00,
            // lo que causaba que date (12:00) > today (00:00) → isFuture = true incorrectamente.
            const date = this.parseLocalDate(dateStr);
            const todayRaw = new Date();
            const today = new Date(todayRaw.getFullYear(), todayRaw.getMonth(), todayRaw.getDate());
            const dateNormalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const isFuture = dateNormalized > today;
            const formattedDate = date.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            if (isFuture) {
                if (title) title.innerHTML = `<i class="fas fa-lock"></i> Día Bloqueado`;
                const countdownElement = document.getElementById('unlockCountdown');
                if (countdownElement) {
                    const diffDays = Math.ceil(Math.abs(date - today) / (1000 * 60 * 60 * 24));
                    countdownElement.textContent = `Disponible en ${diffDays} día${diffDays > 1 ? 's' : ''}`;
                }
                setTimeout(() => {
                    if (loading) loading.classList.add('hidden');
                    if (blocked) blocked.classList.remove('hidden');
                }, 500);
            } else {
                if (title) title.innerHTML = `<i class="fas fa-calendar-day"></i> ${formattedDate}`;
                try {
                    const [dayContent, dayComments] = await Promise.all([
                        this.loadDayContent(dateStr),
                        this.loadDayComments(dateStr)
                    ]);
                    this.renderDayContent(dayContent);
                    this.renderDayComments(dayComments);
                    setTimeout(() => {
                        if (loading) loading.classList.add('hidden');
                        if (content) content.classList.remove('hidden');
                        if (comments) comments.classList.remove('hidden');
                    }, 400);
                } catch (error) {
                    console.error('Error cargando contenido:', error);
                    if (content) content.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Error al cargar contenido</h4></div>`;
                    if (loading) loading.classList.add('hidden');
                    if (content) content.classList.remove('hidden');
                }
            }
        } catch (error) {
            console.error('Error en openDayModal:', error);
            this.showNotification('Error al abrir el día', 'error');
            this.closeDayModal();
        }
    }

    closeDayModal() {
        const modal = document.getElementById('dayModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        const commentTextarea = document.getElementById('dayCommentText');
        if (commentTextarea) { commentTextarea.value = ''; this.updateCharCount(); }
        this.selectedDay = null;
    }

    async loadDayContent(dateStr) {
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const calendarRef = collection(window.firebase.firestore, 'calendar_content');
            const q = query(calendarRef, where('date', '==', dateStr));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) return null;
            // FIX: tomar solo el primer doc. El forEach sobreescribía content cada iteración,
            // quedándose solo con el último resultado de forma no determinista.
            const doc = querySnapshot.docs[0];
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title || 'Sin título',
                content: data.content || 'Sin contenido disponible',
                date: data.date,
                createdBy: data.createdBy || 'admin',
                visibility: data.visibility || 'all',
                allowComments: data.allowComments !== false,
                tags: data.tags || [],
                status: data.status || 'active',
                createdAt: data.createdAt?.toDate() || new Date(),
                updatedAt: data.updatedAt?.toDate() || new Date()
            };
        } catch (error) {
            console.error('Error en loadDayContent:', error);
            throw error;
        }
    }

    renderDayContent(content) {
        const container = document.getElementById('dayModalContent');
        if (!container) return;
        if (!content) {
            container.innerHTML = `<div class="day-content-main"><div class="day-content-header"><h4>Sin contenido</h4></div><div class="day-content-body"><p>No hay contenido disponible para este día.</p></div></div>`;
            return;
        }
        const tagsHtml = content.tags?.length > 0 ? `<div class="tags-container">${content.tags.map(t => `<span class="tag">${this.sanitizeText(t)}</span>`).join('')}</div>` : '';
        container.innerHTML = `<div class="day-content-main"><div class="day-content-header"><h4>${this.sanitizeText(content.title)}</h4><p class="day-content-date"><i class="fas fa-calendar-alt"></i> ${content.date}</p>${tagsHtml}</div><div class="day-content-body">${this.formatContent(content.content)}</div></div>`;
    }

    // BUGFIX: sanitizar texto para evitar XSS
    sanitizeText(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatContent(content) {
        if (!content) return '<p>Sin contenido disponible</p>';
        // Sanitizar primero, luego aplicar formato seguro
        const sanitized = this.sanitizeText(content);
        let formatted = sanitized.replace(/\n/g, '<br>');
        // URLs seguras
        formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="day-content-link">$1</a>');
        return formatted;
    }

    async loadDayComments(dayId) {
        try {
            const { collection, query, where, getDocs, orderBy } = window.firebase.firebaseModules;
            const commentsRef = collection(window.firebase.firestore, 'comments');
            const q = query(commentsRef, where('dayId', '==', dayId), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const comments = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                comments.push({ id: doc.id, ...data, createdAt: data.createdAt?.toDate() || new Date() });
            });
            // BUGFIX: cargar likes de forma eficiente (2 queries en lugar de N)
            await this.loadCommentLikes(comments);
            const commentsCount = document.getElementById('commentsCount');
            if (commentsCount) commentsCount.textContent = comments.length;
            return comments;
        } catch (error) {
            console.error('Error loading comments:', error);
            return [];
        }
    }

    // FIX: Firestore 'in' tiene límite de 30 elementos.
    // Dividir en chunks para evitar error silencioso con muchos comentarios.
    async loadCommentLikes(comments) {
        if (!this.currentUserData || !comments?.length) return;
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const commentIds = comments.map(c => c.id);
            const likesRef = collection(window.firebase.firestore, 'commentLikes');
            this.commentLikes = {};
            const likeCounts = {};

            // Dividir en chunks de 30 (límite de Firestore para 'in')
            const chunkSize = 30;
            for (let i = 0; i < commentIds.length; i += chunkSize) {
                const chunk = commentIds.slice(i, i + chunkSize);
                
                // Query 1: likes del usuario actual en este chunk
                const userLikesQuery = query(likesRef, where('commentId', 'in', chunk), where('userId', '==', this.currentUserData.uid));
                const userLikesSnap = await getDocs(userLikesQuery);
                userLikesSnap.forEach((doc) => { this.commentLikes[doc.data().commentId] = true; });

                // Query 2: todos los likes de este chunk
                const allLikesQuery = query(likesRef, where('commentId', 'in', chunk));
                const allLikesSnap = await getDocs(allLikesQuery);
                allLikesSnap.forEach((doc) => {
                    const cid = doc.data().commentId;
                    likeCounts[cid] = (likeCounts[cid] || 0) + 1;
                });
            }

            for (const comment of comments) {
                comment.likesCount = likeCounts[comment.id] || 0;
                comment.userLiked = !!this.commentLikes[comment.id];
            }
        } catch (error) {
            console.error('Error loading comment likes:', error);
        }
    }

    renderDayComments(comments) {
        const container = document.getElementById('dayCommentsList');
        if (!container) return;
        if (!comments?.length) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><p>No hay comentarios aún. Sé el primero en comentar.</p></div>`;
            return;
        }
        let html = '';
        comments.forEach(comment => {
            const date = comment.createdAt ? comment.createdAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Fecha desconocida';
            const isMyComment = comment.userId === this.currentUserData?.uid;
            const commentClass = isMyComment ? 'comment-item my-comment' : 'comment-item other-comment';
            const authorAvatar = this.getAvatarForUser(comment.userId, comment.authorName);
            const safeText = this.sanitizeText(comment.text || '');
            const safeName = this.sanitizeText(comment.authorName || 'Usuario');
            html += `
                <div class="${commentClass}" data-comment-id="${comment.id}">
                    <div class="comment-header">
                        <div class="comment-author">
                            <div class="comment-author-avatar">${authorAvatar}</div>
                            <div class="comment-author-info">
                                <div class="comment-author-name">${safeName}</div>
                                <div class="comment-author-id">ID: #${comment.userId?.slice(-5) || '00000'}</div>
                            </div>
                        </div>
                        <div class="comment-date">${date}</div>
                    </div>
                    <div class="comment-text">${safeText}</div>
                    <div class="comment-likes">
                        <button class="like-btn ${comment.userLiked ? 'liked' : ''}" onclick="app.toggleCommentLike('${comment.id}')">
                            <i class="fas fa-heart"></i> Me gusta
                        </button>
                        <span class="like-count">${comment.likesCount || 0}</span>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    getAvatarForUser(userId, username) {
        const initial = username ? username.charAt(0).toUpperCase() : 'U';
        const colors = ['#EF4444','#3B82F6','#10B981','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'];
        const bg = colors[initial.charCodeAt(0) % colors.length];
        return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${bg};color:white;font-weight:700;font-size:1.1rem;border-radius:50%;">${initial}</div>`;
    }

    async toggleCommentLike(commentId) {
        if (!this.currentUserData) { this.showNotification('Debes iniciar sesión para dar like', 'error'); return; }
        try {
            const { collection, query, where, getDocs, addDoc, deleteDoc, doc } = window.firebase.firebaseModules;
            const likesRef = collection(window.firebase.firestore, 'commentLikes');
            const q = query(likesRef, where('commentId', '==', commentId), where('userId', '==', this.currentUserData.uid));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                await addDoc(likesRef, { commentId, userId: this.currentUserData.uid, createdAt: new Date().toISOString() });
                this.commentLikes[commentId] = true;
            } else {
                const deletePromises = [];
                querySnapshot.forEach((docSnap) => deletePromises.push(deleteDoc(doc(window.firebase.firestore, 'commentLikes', docSnap.id))));
                await Promise.all(deletePromises);
                delete this.commentLikes[commentId];
            }
            if (this.selectedDay) {
                const dayComments = await this.loadDayComments(this.selectedDay);
                this.renderDayComments(dayComments);
            }
        } catch (error) {
            console.error('Error toggling comment like:', error);
            this.showNotification('Error al dar like', 'error');
        }
    }

    updateCharCount() {
        const textarea = document.getElementById('dayCommentText');
        const charCount = document.getElementById('charCount');
        const postBtn = document.getElementById('postCommentBtn');
        if (!textarea || !charCount || !postBtn) return;
        const count = textarea.value.length;
        charCount.textContent = count;
        postBtn.disabled = count === 0 || count > 500;
        if (count > 450) charCount.style.color = 'var(--color-danger)';
        else if (count > 400) charCount.style.color = 'var(--color-warning)';
        else charCount.style.color = 'var(--text-secondary)';
    }

    async postDayComment() {
        const textarea = document.getElementById('dayCommentText');
        const postBtn = document.getElementById('postCommentBtn');
        if (!textarea || !postBtn) return;
        const text = textarea.value.trim();
        if (!text) { this.showNotification('El comentario no puede estar vacío', 'error'); return; }
        if (text.length > 500) { this.showNotification('El comentario no puede exceder 500 caracteres', 'error'); return; }
        if (!this.selectedDay) { this.showNotification('No hay día seleccionado', 'error'); return; }
        if (!this.currentUserData) { this.showNotification('Debes iniciar sesión para comentar', 'error'); return; }
        const originalText = postBtn.innerHTML;
        postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';
        postBtn.disabled = true;
        try {
            const { collection, addDoc, serverTimestamp } = window.firebase.firebaseModules;
            await addDoc(collection(window.firebase.firestore, 'comments'), {
                dayId: this.selectedDay,
                userId: this.currentUserData.uid,
                authorName: this.currentUserData.username,
                text,
                createdAt: serverTimestamp()
            });
            textarea.value = '';
            this.updateCharCount();
            const dayComments = await this.loadDayComments(this.selectedDay);
            this.renderDayComments(dayComments);
            this.showNotification('Comentario publicado', 'success');
        } catch (error) {
            console.error('Error posting comment:', error);
            this.showNotification('Error al publicar comentario', 'error');
        } finally {
            postBtn.innerHTML = originalText;
            postBtn.disabled = false;
        }
    }

    // ===== SISTEMA DE NOTIFICACIONES =====
    async createNotification(userId, title, message, type = 'info') {
        try {
            const { collection, addDoc, serverTimestamp, doc, getDoc } = window.firebase.firebaseModules;
            const userRef = doc(window.firebase.firestore, 'users', userId);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
                const settings = userDoc.data().notificationSettings || {};
                let shouldNotify = true;
                if (title.includes('amistad') || title.includes('solicitud')) shouldNotify = settings.friendRequests !== false;
                else if (title.includes('novedad') || title.includes('actualización')) shouldNotify = settings.news !== false;
                else if (title.includes('comentario') || title.includes('respuesta')) shouldNotify = settings.comments !== false;
                if (!shouldNotify) return;
            }
            await addDoc(collection(window.firebase.firestore, 'notifications'), {
                userId, title, message, type, read: false, createdAt: serverTimestamp()
            });
            if (this.shouldPlayNotificationSound()) this.playNotificationSound();
        } catch (error) {
            console.error('Error creando notificación:', error);
        }
    }

    shouldPlayNotificationSound() {
        return this.currentUserData?.notificationSettings?.sound !== false;
    }

    playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.log('No se pudo reproducir sonido:', error);
        }
    }

    async loadNotifications() {
        if (!this.currentUserData) return;
        this._notificationsLoading = true;
        try {
            const { collection, query, where, getDocs, orderBy } = window.firebase.firebaseModules;
            const q = query(
                collection(window.firebase.firestore, 'notifications'),
                where('userId', '==', this.currentUserData.uid),
                orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);
            this.notifications = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                this.notifications.push({ id: doc.id, ...data, createdAt: data.createdAt?.toDate() || new Date() });
            });
            this.renderNotifications();
            this.updateNotificationBadge();
        } catch (error) {
            console.error('Error loading notifications:', error);
            this.renderNotifications();
            this.updateNotificationBadge();
        } finally {
            this._notificationsLoading = false;
        }
    }

    renderNotifications() {
        const container = document.getElementById('notificationsList');
        const loading = document.getElementById('notificationsLoading');
        if (loading) loading.classList.add('hidden');
        if (!container) return;
        if (!this.notifications?.length) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-bell"></i><h4>Sin notificaciones</h4><p>Aquí aparecerán tus alertas</p></div>`;
            return;
        }
        let html = '';
        this.notifications.forEach(notification => {
            let icon = 'fas fa-info-circle', typeClass = 'info';
            if (notification.type === 'success') { icon = 'fas fa-check-circle'; typeClass = 'success'; }
            else if (notification.type === 'error') { icon = 'fas fa-exclamation-circle'; typeClass = 'error'; }
            else if (notification.type === 'warning') { icon = 'fas fa-exclamation-triangle'; typeClass = 'warning'; }
            const date = notification.createdAt ? notification.createdAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Reciente';
            const readClass = notification.read ? 'read' : 'unread';
            const safeTitle = this.sanitizeText(notification.title);
            const safeMsg = this.sanitizeText(notification.message);
            html += `
                <div class="notification-item ${typeClass} ${readClass}" onclick="app.markNotificationAsRead('${notification.id}')">
                    <div class="notification-icon"><i class="${icon}"></i></div>
                    <div class="notification-content">
                        <div class="notification-title">${safeTitle}</div>
                        <div class="notification-message">${safeMsg}</div>
                        <div class="notification-date">${date}</div>
                    </div>
                    ${!notification.read ? '<div class="notification-unread-dot"></div>' : ''}
                </div>
            `;
        });
        container.innerHTML = html;
    }

    async markNotificationAsRead(notificationId) {
        try {
            const { doc, updateDoc } = window.firebase.firebaseModules;
            await updateDoc(doc(window.firebase.firestore, 'notifications', notificationId), { read: true });
            const notification = this.notifications.find(n => n.id === notificationId);
            if (notification) notification.read = true;
            this.renderNotifications();
            this.updateNotificationBadge();
        } catch (error) {
            console.error('Error marcando notificación:', error);
        }
    }

    async markAllNotificationsAsRead() {
        if (!this.currentUserData) return;
        try {
            const { collection, query, where, getDocs, doc, writeBatch } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'notifications'), where('userId', '==', this.currentUserData.uid), where('read', '==', false));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) { this.showNotification('No hay notificaciones por marcar', 'info'); return; }
            const batch = writeBatch(window.firebase.firestore);
            querySnapshot.forEach((docSnap) => batch.update(doc(window.firebase.firestore, 'notifications', docSnap.id), { read: true }));
            await batch.commit();
            this.notifications.forEach(n => n.read = true);
            this.renderNotifications();
            this.updateNotificationBadge();
            this.showNotification('Todas marcadas como leídas', 'success');
        } catch (error) {
            console.error('Error marking all as read:', error);
            this.showNotification('Error al marcar notificaciones', 'error');
        }
    }

    async clearAllNotifications() {
        const confirmed = await this.showConfirm('<i class="fas fa-trash"></i> Eliminar notificaciones', '¿Estás seguro de que quieres eliminar todas las notificaciones?', 'Eliminar todas');
        if (!confirmed) return;
        try {
            if (!this.currentUserData) return;
            const { collection, query, where, getDocs, doc, writeBatch } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'notifications'), where('userId', '==', this.currentUserData.uid));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) { this.showNotification('No hay notificaciones para eliminar', 'info'); return; }
            const batch = writeBatch(window.firebase.firestore);
            querySnapshot.forEach((docSnap) => batch.delete(doc(window.firebase.firestore, 'notifications', docSnap.id)));
            await batch.commit();
            this.notifications = [];
            this.renderNotifications();
            this.updateNotificationBadge();
            this.showNotification('Notificaciones eliminadas', 'success');
        } catch (error) {
            console.error('Error clearing notifications:', error);
            this.showNotification('Error al eliminar notificaciones', 'error');
        }
    }

    updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        const unreadCount = this.notifications.filter(n => !n.read).length;
        if (badge) {
            if (unreadCount > 0) { badge.textContent = unreadCount > 99 ? '99+' : unreadCount; badge.classList.remove('hidden'); }
            else badge.classList.add('hidden');
        }
    }

    openNotificationsModal() {
        const modal = document.getElementById('notificationsModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.loadNotifications();
        }
    }

    closeNotificationsModal() {
        const modal = document.getElementById('notificationsModal');
        if (modal) { modal.classList.remove('active'); document.body.style.overflow = 'auto'; }
    }

    // ===== FRIENDS SYSTEM =====
    async searchUserById() {
        const searchInput = document.getElementById('searchUserId');
        const searchBtn = document.querySelector('.search-submit-btn');
        if (!searchInput || !searchBtn) return;
        const searchId = searchInput.value.trim();
        if (!searchId || searchId.length !== 5) { this.showNotification('Ingresa un ID válido de 5 dígitos', 'error'); return; }
        if (searchId === this.currentUserData?.userId) { this.showNotification('Este es tu propio ID', 'info'); return; }
        const originalText = searchBtn.innerHTML;
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
        searchBtn.disabled = true;
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'users'), where('userId', '==', searchId));
            const querySnapshot = await getDocs(q);
            const resultsContainer = document.getElementById('searchResults');
            if (querySnapshot.empty) {
                resultsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><h4>Usuario no encontrado</h4><p>No existe un usuario con el ID #${this.sanitizeText(searchId)}</p></div>`;
                return;
            }
            let userData = null;
            querySnapshot.forEach((doc) => { userData = { id: doc.id, ...doc.data() }; });
            const [isFriend, hasSentRequest, hasReceivedRequest] = await Promise.all([
                this.checkIfFriend(userData.id),
                this.checkIfRequestSent(userData.id),
                this.checkIfRequestReceived(userData.id)
            ]);
            let actionButton = '';
            if (isFriend) {
                actionButton = `<button class="action-btn action-btn-accept" disabled><i class="fas fa-check"></i> Ya son amigos</button>`;
            } else if (hasSentRequest) {
                actionButton = `<button class="action-btn action-btn-accept" disabled><i class="fas fa-clock"></i> Solicitud enviada</button>`;
            } else if (hasReceivedRequest) {
                const requestId = await this.getRequestId(userData.id);
                actionButton = `
                    <button class="action-btn action-btn-accept" onclick="app.acceptFriendRequest('${requestId}', '${userData.id}', '${this.sanitizeText(userData.username)}', event)"><i class="fas fa-check"></i> Aceptar</button>
                    <button class="action-btn action-btn-reject" onclick="app.rejectFriendRequest('${requestId}', '${userData.id}', '${this.sanitizeText(userData.username)}', event)"><i class="fas fa-times"></i> Rechazar</button>
                `;
            } else {
                actionButton = `<button class="action-btn action-btn-accept" onclick="app.sendFriendRequest('${userData.id}', '${this.sanitizeText(userData.username)}')"><i class="fas fa-user-plus"></i> Enviar solicitud</button>`;
            }
            const safeName = this.sanitizeText(userData.username);
            resultsContainer.innerHTML = `
                <div class="search-results-content">
                    <div class="search-result-item">
                        <div class="result-avatar">${this.getAvatarForUser(userData.id, userData.username)}</div>
                        <div class="result-info">
                            <div class="result-name">${safeName}</div>
                            <div class="result-id">ID: #${userData.userId}</div>
                        </div>
                        <div class="result-actions">${actionButton}</div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error searching user:', error);
            this.showNotification('Error al buscar usuario', 'error');
        } finally {
            searchBtn.innerHTML = originalText;
            searchBtn.disabled = false;
        }
    }

    async checkIfFriend(targetUserId) {
        if (!this.currentUserData) return false;
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'friends'), where('userId', '==', this.currentUserData.uid), where('friendId', '==', targetUserId), where('status', '==', 'accepted'));
            const snap = await getDocs(q);
            return !snap.empty;
        } catch (error) { return false; }
    }

    async checkIfRequestSent(targetUserId) {
        if (!this.currentUserData) return false;
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'friendRequests'), where('fromUserId', '==', this.currentUserData.uid), where('toUserId', '==', targetUserId), where('status', '==', 'pending'));
            const snap = await getDocs(q);
            return !snap.empty;
        } catch (error) { return false; }
    }

    async checkIfRequestReceived(targetUserId) {
        if (!this.currentUserData) return false;
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'friendRequests'), where('fromUserId', '==', targetUserId), where('toUserId', '==', this.currentUserData.uid), where('status', '==', 'pending'));
            const snap = await getDocs(q);
            return !snap.empty;
        } catch (error) { return false; }
    }

    async getRequestId(fromUserId) {
        if (!this.currentUserData) return null;
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'friendRequests'), where('fromUserId', '==', fromUserId), where('toUserId', '==', this.currentUserData.uid), where('status', '==', 'pending'));
            const snap = await getDocs(q);
            let requestId = null;
            snap.forEach((doc) => { requestId = doc.id; });
            return requestId;
        } catch (error) { return null; }
    }

    async sendFriendRequest(targetUserId, targetUserName) {
        if (!this.currentUserData) { this.showNotification('Debes iniciar sesión', 'error'); return; }
        try {
            const { collection, addDoc, serverTimestamp } = window.firebase.firebaseModules;
            await addDoc(collection(window.firebase.firestore, 'friendRequests'), {
                fromUserId: this.currentUserData.uid,
                fromUserName: this.currentUserData.username,
                fromUserEmail: this.currentUserData.email,
                toUserId: targetUserId,
                toUserName: targetUserName,
                status: 'pending',
                createdAt: serverTimestamp()
            });
            this.showNotification(`Solicitud enviada a ${targetUserName}`, 'success');
            await this.createNotification(targetUserId, 'Nueva solicitud de amistad', `${this.currentUserData.username} te ha enviado una solicitud de amistad`, 'info');
            this.searchUserById();
        } catch (error) {
            console.error('Error sending friend request:', error);
            this.showNotification('Error al enviar solicitud', 'error');
        }
    }

    async loadFriendRequests() {
        if (!this.currentUserData) return;
        try {
            const { collection, query, where, getDocs, orderBy } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'friendRequests'), where('toUserId', '==', this.currentUserData.uid), where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            this.friendRequests = [];
            querySnapshot.forEach((doc) => this.friendRequests.push({ id: doc.id, ...doc.data() }));
            this.renderFriendRequests();
            this.updateFriendRequestBadge();
        } catch (error) {
            console.error('Error loading friend requests:', error);
        }
    }

    renderFriendRequests() {
        const container = document.getElementById('friendRequestsContainer');
        if (!container) return;
        if (!this.friendRequests?.length) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><h4>Sin solicitudes pendientes</h4></div>`;
            return;
        }
        let html = '';
        this.friendRequests.forEach(request => {
            const safeName = this.sanitizeText(request.fromUserName);
            html += `
                <div class="request-item">
                    <div class="request-avatar">${this.getAvatarForUser(request.fromUserId, request.fromUserName)}</div>
                    <div class="request-info">
                        <div class="request-name">${safeName}</div>
                        <div class="request-id">ID: enviada por este usuario</div>
                    </div>
                    <div class="request-actions">
                        <button class="action-btn action-btn-accept" onclick="app.acceptFriendRequest('${request.id}', '${request.fromUserId}', '${safeName}', event)"><i class="fas fa-check"></i> Aceptar</button>
                        <button class="action-btn action-btn-reject" onclick="app.rejectFriendRequest('${request.id}', '${request.fromUserId}', '${safeName}', event)"><i class="fas fa-times"></i> Rechazar</button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    // BUGFIX: usar event del parámetro en lugar del global `event`
    async acceptFriendRequest(requestId, fromUserId, fromUserName, evt) {
        const acceptBtn = evt?.target?.closest('.action-btn-accept');
        if (acceptBtn) { acceptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; acceptBtn.disabled = true; }
        try {
            const { doc, updateDoc, setDoc, serverTimestamp, collection } = window.firebase.firebaseModules;
            await updateDoc(doc(window.firebase.firestore, 'friendRequests', requestId), { status: 'accepted', acceptedAt: serverTimestamp() });
            const friendsRef1 = doc(collection(window.firebase.firestore, 'friends'));
            await setDoc(friendsRef1, { userId: this.currentUserData.uid, friendId: fromUserId, friendName: fromUserName, status: 'accepted', createdAt: serverTimestamp() });
            const friendsRef2 = doc(collection(window.firebase.firestore, 'friends'));
            await setDoc(friendsRef2, { userId: fromUserId, friendId: this.currentUserData.uid, friendName: this.currentUserData.username, status: 'accepted', createdAt: serverTimestamp() });
            this.showNotification('Solicitud aceptada', 'success');
            await this.createNotification(fromUserId, 'Solicitud de amistad aceptada', `${this.currentUserData.username} ha aceptado tu solicitud de amistad`, 'success');
            await Promise.all([this.loadFriendRequests(), this.loadFriendsList(), this.loadSentRequests()]);
        } catch (error) {
            console.error('Error accepting friend request:', error);
            this.showNotification('Error al aceptar solicitud', 'error');
            if (acceptBtn) { acceptBtn.innerHTML = '<i class="fas fa-check"></i> Aceptar'; acceptBtn.disabled = false; }
        }
    }

    // BUGFIX: usar event del parámetro
    async rejectFriendRequest(requestId, fromUserId, fromUserName, evt) {
        const rejectBtn = evt?.target?.closest('.action-btn-reject');
        if (rejectBtn) { rejectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; rejectBtn.disabled = true; }
        try {
            const { doc, updateDoc } = window.firebase.firebaseModules;
            await updateDoc(doc(window.firebase.firestore, 'friendRequests', requestId), { status: 'rejected', rejectedAt: new Date().toISOString() });
            this.showNotification('Solicitud rechazada', 'success');
            if (fromUserId) await this.createNotification(fromUserId, 'Solicitud de amistad rechazada', `${this.currentUserData.username} ha rechazado tu solicitud`, 'error');
            await this.loadFriendRequests();
        } catch (error) {
            console.error('Error rejecting friend request:', error);
            this.showNotification('Error al rechazar solicitud', 'error');
            if (rejectBtn) { rejectBtn.innerHTML = '<i class="fas fa-times"></i> Rechazar'; rejectBtn.disabled = false; }
        }
    }

    async loadFriendsList() {
        if (!this.currentUserData) return;
        try {
            const { collection, query, where, getDocs, orderBy, getDoc, doc } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'friends'), where('userId', '==', this.currentUserData.uid), where('status', '==', 'accepted'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const friends = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            // Fix: cargar todos los perfiles en paralelo en lugar de uno por uno
            const results = await Promise.allSettled(
                friends.map(friend => getDoc(doc(window.firebase.firestore, 'users', friend.friendId)))
            );
            this.friendsList = [];
            friends.forEach((friend, i) => {
                const result = results[i];
                if (result.status === 'fulfilled' && result.value.exists()) {
                    friend.friendData = result.value.data();
                    this.friendsList.push(friend);
                }
            });
            this.renderFriendsList();
        } catch (error) {
            console.error('Error loading friends list:', error);
        }
    }

    renderFriendsList() {
        const container = document.getElementById('friendsListContainer');
        const badge = document.getElementById('friendsCountBadge');
        if (badge) badge.textContent = this.friendsList.length;
        if (!container) return;
        if (!this.friendsList?.length) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h4>No tienes amigos aún</h4><p>Busca usuarios por su ID para agregar amigos</p></div>`;
            return;
        }
        let html = '';
        this.friendsList.forEach(friend => {
            const friendData = friend.friendData;
            const safeName = this.sanitizeText(friendData?.username || 'Usuario');
            html += `
                <div class="friend-item">
                    <div class="friend-avatar">${this.getAvatarForUser(friend.friendId, friendData?.username)}</div>
                    <div class="friend-info">
                        <div class="friend-name">${safeName}</div>
                        <div class="friend-id">ID: #${friendData?.userId || '00000'}</div>
                    </div>
                    <div class="friend-actions">
                        <button class="action-btn action-btn-accept" onclick="app.openChatModal('${friend.friendId}', '${safeName}')" title="Chat"><i class="fas fa-comment-dots"></i></button>
                        <button class="action-btn action-btn-reject" onclick="app.removeFriend('${friend.id}', '${friend.friendId}', '${safeName}')" title="Eliminar"><i class="fas fa-user-minus"></i></button>
                        <button class="action-btn" style="background:var(--color-warning)22;color:var(--color-warning);border:1px solid var(--color-warning)44;border-radius:8px;padding:6px 10px;cursor:pointer;" onclick="app.openReportModal('${friend.friendId}', '${safeName}')" title="Reportar"><i class="fas fa-flag"></i></button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    async loadSentRequests() {
        if (!this.currentUserData) return;
        try {
            const { collection, query, where, getDocs, orderBy } = window.firebase.firebaseModules;
            // Solo mostrar pendientes — las aceptadas/rechazadas no son utiles en esta lista
            const q = query(collection(window.firebase.firestore, 'friendRequests'),
                where('fromUserId', '==', this.currentUserData.uid),
                where('status', '==', 'pending'),
                orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            this.sentRequests = [];
            querySnapshot.forEach((doc) => this.sentRequests.push({ id: doc.id, ...doc.data() }));
            this.renderSentRequests();
        } catch (error) {
            console.error('Error loading sent requests:', error);
        }
    }

    renderSentRequests() {
        const container = document.getElementById('sentRequestsContainer');
        if (!container) return;
        if (!this.sentRequests?.length) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-paper-plane"></i><h4>No has enviado solicitudes</h4></div>`;
            return;
        }
        let html = '';
        this.sentRequests.forEach(request => {
            const statusText = request.status === 'pending' ? 'Pendiente' : request.status === 'accepted' ? 'Aceptada' : 'Rechazada';
            const statusClass = request.status === 'pending' ? 'pending' : request.status === 'accepted' ? 'accepted' : 'rejected';
            const safeName = this.sanitizeText(request.toUserName);
            html += `
                <div class="request-item ${statusClass}">
                    <div class="request-avatar">${this.getAvatarForUser(request.toUserId, request.toUserName)}</div>
                    <div class="request-info">
                        <div class="request-name">${safeName}</div>
                        <div class="request-status">${statusText}</div>
                    </div>
                    ${request.status === 'pending' ? `<div class="request-actions"><button class="action-btn action-btn-reject" onclick="app.cancelFriendRequest('${request.id}')"><i class="fas fa-times"></i> Cancelar</button></div>` : ''}
                </div>
            `;
        });
        container.innerHTML = html;
    }

    async cancelFriendRequest(requestId) {
        try {
            const { doc, deleteDoc } = window.firebase.firebaseModules;
            await deleteDoc(doc(window.firebase.firestore, 'friendRequests', requestId));
            this.showNotification('Solicitud cancelada', 'success');
            await this.loadSentRequests();
        } catch (error) {
            console.error('Error canceling friend request:', error);
            this.showNotification('Error al cancelar solicitud', 'error');
        }
    }

    switchFriendsTab(tabId) {
        this.currentFriendsTab = tabId;
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === tabId));
    }

    updateFriendRequestBadge() {
        const sidebarBadge = document.getElementById('friendRequestsBadge');
        const tabBadge = document.getElementById('requestsCountBadge');
        const count = this.friendRequests.length;
        [sidebarBadge, tabBadge].forEach(badge => {
            if (!badge) return;
            if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
            else badge.classList.add('hidden');
        });
    }

    async removeFriend(friendshipId, friendId, friendName) {
        const confirmed = await this.showConfirm('<i class="fas fa-user-minus"></i> Eliminar amigo', `¿Eliminar a ${friendName} de tus amigos?`, 'Eliminar');
        if (!confirmed) return;
        try {
            const { doc, deleteDoc, collection, query, where, getDocs } = window.firebase.firebaseModules;
            // Buscar ambas direcciones antes de borrar para garantizar simetria
            const [q1, q2] = [
                query(collection(window.firebase.firestore, 'friends'), where('userId', '==', this.currentUserData.uid), where('friendId', '==', friendId)),
                query(collection(window.firebase.firestore, 'friends'), where('userId', '==', friendId), where('friendId', '==', this.currentUserData.uid))
            ];
            const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
            const deletes = [
                ...snap1.docs.map(d => deleteDoc(doc(window.firebase.firestore, 'friends', d.id))),
                ...snap2.docs.map(d => deleteDoc(doc(window.firebase.firestore, 'friends', d.id)))
            ];
            await Promise.all(deletes);
            this.showNotification(`${friendName} eliminado de tus amigos`, 'success');
            await this.loadFriendsList();
        } catch (error) {
            console.error('Error removing friend:', error);
            this.showNotification('Error al eliminar amigo', 'error');
        }
    }

    // ===== NEWS FUNCTIONS =====
    // ===== NEWS FUNCTIONS =====
    async loadNews() {
        try {
            const { collection, getDocs, query, orderBy } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'news'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) { this.renderNews([]); return; }
            const allNews = [];
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                allNews.push({ id: docSnap.id, ...data, createdAt: data.createdAt?.toDate() || new Date() });
            });
            this.renderNews(allNews);
        } catch (error) {
            console.error('Error loading news:', error);
            this.renderNews([]);
        }
    }

    _getCategoryStyle(label) {
        const l = label.toLowerCase();
        if (l.includes('implement') || l.includes('lanzado') || l.includes('disponible'))
            return { color:'#10b981', bg:'rgba(16,185,129,.08)', icon:'fa-check-circle' };
        if (l.includes('novedad') || l.includes('nuevo') || l.includes('nueva') || l.includes('agregado'))
            return { color:'#a78bfa', bg:'rgba(167,139,250,.08)', icon:'fa-plus-circle' };
        if (l.includes('bug') || l.includes('corregido') || l.includes('correc') || l.includes('fix') || l.includes('arreglado'))
            return { color:'#ef4444', bg:'rgba(239,68,68,.08)', icon:'fa-bug' };
        if (l.includes('actualiz') || l.includes('mejora') || l.includes('cambiado') || l.includes('modificado'))
            return { color:'#3b82f6', bg:'rgba(59,130,246,.08)', icon:'fa-sync-alt' };
        if (l.includes('eliminado') || l.includes('removido') || l.includes('quitado') || l.includes('borrado'))
            return { color:'#f59e0b', bg:'rgba(245,158,11,.08)', icon:'fa-trash-alt' };
        if (l.includes('proxi') || l.includes('pronto') || l.includes('version') || l.includes('futuro') || l.includes('planeado'))
            return { color:'#8888a8', bg:'rgba(136,136,168,.08)', icon:'fa-road' };
        return { color:'var(--color-primary)', bg:'var(--color-primary-light)', icon:'fa-tag' };
    }

    _htmlToCards(html) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const children = Array.from(wrap.childNodes);
        const sections = [];
        let current = null;
        children.forEach(node => {
            const tag = node.nodeName?.toLowerCase();
            if (['h4','h3','h2'].includes(tag)) {
                if (current) sections.push(current);
                current = { title: node.textContent.trim(), nodes: [] };
            } else if (current) {
                current.nodes.push(node);
            } else if (node.textContent?.trim()) {
                if (!current) current = { title: '', nodes: [] };
                current.nodes.push(node);
            }
        });
        if (current) sections.push(current);
        if (sections.length === 0) return `<div style="color:var(--text-secondary);font-size:.88rem;line-height:1.7">${wrap.innerHTML}</div>`;
        return sections.map(sec => {
            const style = this._getCategoryStyle(sec.title);
            const contentWrap = document.createElement('div');
            sec.nodes.forEach(n => contentWrap.appendChild(n.cloneNode(true)));
            contentWrap.querySelectorAll('ul, ol').forEach(list => {
                const ul = document.createElement('ul');
                ul.className = 'news-list';
                list.querySelectorAll('li').forEach(li => {
                    const newLi = document.createElement('li');
                    newLi.style.setProperty('--nc', style.color);
                    newLi.textContent = li.textContent.trim();
                    ul.appendChild(newLi);
                });
                list.replaceWith(ul);
            });
            const titleHtml = sec.title
                ? `<div class="news-section-title" style="color:${style.color}"><i class="fas ${style.icon}"></i> ${sec.title}</div>`
                : '';
            return `<div class="news-section" style="border-left:3px solid ${style.color};background:${style.bg};">${titleHtml}${contentWrap.innerHTML}</div>`;
        }).join('');
    }

    renderNews(newsList) {
        const container = document.getElementById('newsContainer');
        const loading = document.getElementById('loadingNews');
        const countElement = document.getElementById('newsCount');
        if (loading) loading.classList.add('hidden');
        if (!container) return;
        if (!newsList || newsList.length === 0) {
            if (countElement) countElement.textContent = '0';
            container.innerHTML = `<div class="empty-state"><i class="fas fa-newspaper"></i><h4>Sin novedades publicadas</h4></div>`;
            return;
        }
        if (countElement) countElement.textContent = newsList.length + (newsList.length === 1 ? ' version' : ' versiones');
        const CATEGORIES = [
            { key:'implemented', icon:'fa-check-circle', label:'Implementado',   color:'#10b981', bg:'rgba(16,185,129,.08)'  },
            { key:'new',         icon:'fa-plus-circle',  label:'Novedades',       color:'#a78bfa', bg:'rgba(167,139,250,.08)' },
            { key:'bugfixes',    icon:'fa-bug',          label:'Bugs Corregidos', color:'#ef4444', bg:'rgba(239,68,68,.08)'   },
            { key:'corrections', icon:'fa-bug',          label:'Corregido',       color:'#ef4444', bg:'rgba(239,68,68,.08)'   },
            { key:'updated',     icon:'fa-sync-alt',     label:'Actualizado',     color:'#3b82f6', bg:'rgba(59,130,246,.08)'  },
            { key:'removed',     icon:'fa-trash-alt',    label:'Eliminado',       color:'#f59e0b', bg:'rgba(245,158,11,.08)'  },
            { key:'upcoming',    icon:'fa-road',         label:'Proxima Version', color:'#8888a8', bg:'rgba(136,136,168,.08)' },
        ];
        const renderEntry = (newsData) => {
            const date = newsData.createdAt ? newsData.createdAt.toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' }) : '';
            const safeTitle   = this.sanitizeText(newsData.title   || 'Actualizacion');
            const safeVersion = this.sanitizeText(newsData.version || 'v1.0.0');
            let bodyHtml = '';
            if (newsData.htmlContent) {
                bodyHtml = `<div class="news-card-body">${this._htmlToCards(newsData.htmlContent)}</div>`;
            } else {
                const sections = CATEGORIES
                    .filter(s => Array.isArray(newsData[s.key]) && newsData[s.key].length > 0)
                    .map(s => `<div class="news-section" style="border-left:3px solid ${s.color};background:${s.bg};">
                        <div class="news-section-title" style="color:${s.color}"><i class="fas ${s.icon}"></i> ${s.label}</div>
                        <ul class="news-list">${newsData[s.key].map(item => `<li style="--nc:${s.color}">${this.sanitizeText(item)}</li>`).join('')}</ul>
                    </div>`).join('');
                if (!sections) return '';
                bodyHtml = `<div class="news-card-body">${sections}</div>`;
            }
            return `<div class="news-single-card">
                <div class="news-card-header">
                    <div><div class="news-card-title">${safeTitle}</div>${date ? `<div class="news-card-date">${date}</div>` : ''}</div>
                    <div class="news-card-version">${safeVersion}</div>
                </div>
                ${bodyHtml}
                <div class="news-card-footer"><i class="fas fa-code-branch"></i> Version ${safeVersion}</div>
            </div>`;
        };
        const [latest, ...older] = newsList;
        let html = `<div class="news-latest-label"><i class="fas fa-star"></i> Ultima version</div>` + renderEntry(latest);
        if (older.length > 0) {
            html += `<button class="news-history-toggle" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('hidden')">
                <i class="fas fa-history"></i> Versiones anteriores (${older.length})
                <i class="fas fa-chevron-down news-chevron"></i>
            </button>
            <div class="news-history-list hidden">
                ${older.map(n => `<div class="news-history-item">${renderEntry(n)}</div>`).join('')}
            </div>`;
        }
        container.innerHTML = html;
    }

    refreshNews() { this.loadNews(); this.showNotification('Novedades actualizadas', 'success'); }
    openNewsModal() {
        const modal = document.getElementById('newsModal');
        if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; this.loadNews(); }
    }
    closeNewsModal() {
        const modal = document.getElementById('newsModal');
        if (modal) { modal.classList.remove('active'); document.body.style.overflow = 'auto'; }
    }

    // ===== NOTIFICATION SETTINGS =====
    setupNotificationSettings() {
        const settings = ['notifFriendRequests', 'notifNews', 'notifComments', 'notifSound'];
        settings.forEach(setting => {
            const element = document.getElementById(setting);
            if (!element) return;
            if (this.currentUserData?.notificationSettings) {
                const keyMap = { notifFriendRequests: 'friendRequests', notifNews: 'news', notifComments: 'comments', notifSound: 'sound' };
                element.checked = this.currentUserData.notificationSettings[keyMap[setting]] !== false;
            } else {
                const saved = localStorage.getItem(setting);
                if (saved !== null) element.checked = saved === 'true';
            }
            if (!element._notifListenerAdded) {
                element.addEventListener('change', (e) => {
                    localStorage.setItem(setting, e.target.checked);
                    if (this.currentUserData) this.saveNotificationSettings();
                    this.showNotification('Configuración guardada', 'success');
                });
                element._notifListenerAdded = true;
            }
        });
    }

    async saveNotificationSettings() {
        if (!this.currentUserData) return;
        try {
            const { doc, updateDoc } = window.firebase.firebaseModules;
            const settings = {
                friendRequests: document.getElementById('notifFriendRequests')?.checked ?? true,
                news: document.getElementById('notifNews')?.checked ?? true,
                comments: document.getElementById('notifComments')?.checked ?? true,
                sound: document.getElementById('notifSound')?.checked ?? true
            };
            await updateDoc(doc(window.firebase.firestore, 'users', this.currentUserData.uid), { notificationSettings: settings, updatedAt: new Date().toISOString() });
            this.currentUserData.notificationSettings = settings;
        } catch (error) { console.error('Error saving notification settings:', error); }
    }

    // ===== UPCOMING CONTENT =====
    async loadUpcomingContent() {
        try {
            const now = new Date();
            // BUGFIX: usar día siguiente para que "hoy" no aparezca como "próximo"
            const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const futureDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8);
            const { collection, query, where, getDocs, orderBy } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'calendar_content'),
                where('date', '>=', this.formatDate(tomorrow)),
                where('date', '<=', this.formatDate(futureDate)),
                where('status', '==', 'active'),
                orderBy('date', 'asc')
            );
            const querySnapshot = await getDocs(q);
            const upcomingContent = [];
            let count = 0;
            querySnapshot.forEach((doc) => {
                if (count < 5) { upcomingContent.push({ id: doc.id, ...doc.data() }); count++; }
            });
            this.renderUpcomingContent(upcomingContent);
        } catch (error) {
            console.error('Error loading upcoming content:', error);
            this.renderUpcomingContent([]);
        }
    }

    renderUpcomingContent(content) {
        const container = document.getElementById('upcomingContentList');
        if (!container) return;
        if (!content?.length) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-day"></i><p>No hay contenido próximo</p></div>`;
            return;
        }
        container.innerHTML = content.map(item => {
            // BUGFIX: usar parseLocalDate para evitar desfase de zona horaria
            const date = this.parseLocalDate(item.date);
            const formattedDate = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
            const safeTitle = this.sanitizeText(item.title || 'Sin título');
            return `<div class="content-preview-item" onclick="app.openDayModal('${item.date}')"><div class="preview-date">${formattedDate}</div><div class="preview-title">${safeTitle}</div><div class="preview-arrow"><i class="fas fa-chevron-right"></i></div></div>`;
        }).join('');
    }

    // ===== UTILITY FUNCTIONS =====
    copyUserId() {
        if (!this.currentUserData?.userId) {
            this.showNotification('ID no disponible', 'error');
            return;
        }
        navigator.clipboard.writeText(this.currentUserData.userId)
            .then(() => {
                this.showNotification('ID copiado al portapapeles', 'success');
                const copyBtn = document.getElementById('copyUserIdBtn');
                const copyBtnText = document.getElementById('copyBtnText');
                if (copyBtn && copyBtnText) {
                    const originalText = copyBtnText.textContent;
                    copyBtnText.textContent = 'Copiado';
                    copyBtn.style.background = 'var(--color-green)';
                    setTimeout(() => {
                        copyBtnText.textContent = originalText;
                        copyBtn.style.background = '';
                    }, 2000);
                }
                const userIdDisplay = document.getElementById('userIdDisplay');
                if (userIdDisplay) {
                    userIdDisplay.classList.add('copied');
                    setTimeout(() => userIdDisplay.classList.remove('copied'), 1500);
                }
            })
            .catch(err => {
                console.error('Error copying ID:', err);
                this.showNotification('Error al copiar ID', 'error');
            });
    }

    // MEJORA: máximo 3 toasts, con barra de progreso
    showNotification(message, type = 'info') {
        // Limitar a 3 toasts
        const existingToasts = document.querySelectorAll('.notification-toast');
        if (existingToasts.length >= 3) {
            existingToasts[0].remove();
        }

        const toast = document.createElement('div');
        toast.className = `notification-toast notification-${type}`;
        let icon = 'fas fa-info-circle';
        if (type === 'success') icon = 'fas fa-check-circle';
        if (type === 'error') icon = 'fas fa-exclamation-circle';
        if (type === 'warning') icon = 'fas fa-exclamation-triangle';
        toast.innerHTML = `
            <div class="notification-content">
                <i class="${icon}"></i>
                <span>${this.sanitizeText(message)}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
            <div class="toast-progress"></div>
        `;
        document.body.appendChild(toast);

        // Animar barra de progreso
        const progress = toast.querySelector('.toast-progress');
        if (progress) {
            progress.style.width = '100%';
            requestAnimationFrame(() => {
                progress.style.transition = 'width 5s linear';
                progress.style.width = '0%';
            });
        }

        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('toast-fade-out');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    async refreshActivity() {
        const activityList = document.getElementById('recentActivityList');
        if (!activityList) return;
        activityList.innerHTML = '<div style="padding:16px;color:var(--text-secondary);font-size:.85rem;text-align:center"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
        try {
            if (!this.currentUserData) return;
            const { collection, query, where, getDocs, orderBy, limit } = window.firebase.firebaseModules;
            const uid = this.currentUserData.uid;
            const [commentsSnap, notifsSnap, friendsSnap] = await Promise.all([
                getDocs(query(collection(window.firebase.firestore, 'comments'), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(3))),
                getDocs(query(collection(window.firebase.firestore, 'notifications'), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(3))),
                getDocs(query(collection(window.firebase.firestore, 'friends'), where('userId', '==', uid), where('status', '==', 'accepted'), orderBy('createdAt', 'desc'), limit(2)))
            ]);
            const activities = [];
            commentsSnap.forEach(doc => {
                const d = doc.data();
                activities.push({ icon: 'fas fa-comment', color: 'var(--color-primary)', title: `Comentaste en el día ${d.dayId || '—'}`, time: d.createdAt?.toDate() || new Date() });
            });
            notifsSnap.forEach(doc => {
                const d = doc.data();
                activities.push({ icon: 'fas fa-bell', color: 'var(--color-warning)', title: d.title || 'Notificación', time: d.createdAt?.toDate() || new Date() });
            });
            friendsSnap.forEach(doc => {
                const d = doc.data();
                activities.push({ icon: 'fas fa-user-friends', color: 'var(--color-success)', title: `Te hiciste amigo de ${d.friendName || 'alguien'}`, time: d.createdAt?.toDate() || new Date() });
            });
            activities.sort((a, b) => b.time - a.time);
            if (!activities.length) {
                activityList.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No hay actividad reciente</p></div>';
                return;
            }
            activityList.innerHTML = activities.slice(0, 6).map(a => {
                const timeStr = a.time.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                return `<div class="activity-item"><div class="activity-icon" style="background:${a.color}22;color:${a.color}"><i class="${a.icon}"></i></div><div class="activity-content"><div class="activity-title">${this.sanitizeText(a.title)}</div><div class="activity-time">${timeStr}</div></div></div>`;
            }).join('');
        } catch (error) {
            console.error('Error loading activity:', error);
            activityList.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No hay actividad reciente</p></div>';
        }
    }

    async refreshApp() {
        const confirmed = await this.showConfirm('<i class="fas fa-sync"></i> Recargar aplicación', '¿Recargar la aplicación?', 'Recargar', false);
        if (confirmed) location.reload();
    }

    showHelp() {
        const modal = document.getElementById('helpModal');
        if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
    }
    closeHelpModal() {
        const modal = document.getElementById('helpModal');
        if (modal) { modal.classList.remove('active'); document.body.style.overflow = 'auto'; }
    }

    async loadUserData() {
        try {
            await Promise.all([
                this.loadCalendar(),
                this.loadNotifications(),
                this.loadFriendRequests(),
                this.loadFriendsList(),
                this.loadSentRequests(),
                this.loadUpcomingContent(),
                this.refreshActivity()
            ]);
        } catch (error) { console.error('Error loading user data:', error); }
    }

    // ===== MODALES: CAMBIAR DATOS =====
    openChangeUsernameModal() {
        const modal = document.getElementById('changeUsernameModal');
        if (!modal) return;
        const input = document.getElementById('newUsername');
        if (input) input.value = this.currentUserData?.username || '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeChangeUsernameModal() {
        const modal = document.getElementById('changeUsernameModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        const input = document.getElementById('newUsername');
        if (input) input.value = '';
    }

    async saveNewUsername() {
        const input = document.getElementById('newUsername');
        const btn = document.querySelector('#changeUsernameModal .btn-primary');
        if (!input) return;
        const newUsername = input.value.trim();
        if (!newUsername) { this.showNotification('El nombre no puede estar vacío', 'error'); return; }
        if (newUsername.length < 2) { this.showNotification('El nombre debe tener al menos 2 caracteres', 'error'); return; }
        if (newUsername.length > 30) { this.showNotification('El nombre no puede tener más de 30 caracteres', 'error'); return; }
        if (newUsername === this.currentUserData?.username) { this.showNotification('Es el mismo nombre que ya tienes', 'info'); return; }

        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...'; btn.disabled = true; }

        const isTaken = await this.checkUsernameExists(newUsername);
        if (isTaken) {
            this.showNotification('Ese nombre de usuario ya está en uso', 'error');
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
            return;
        }

        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

        try {
            const { doc, updateDoc } = window.firebase.firebaseModules;
            const { updateProfile } = window.firebase.firebaseModules;
            const userRef = doc(window.firebase.firestore, 'users', this.currentUserData.uid);
            await updateDoc(userRef, { username: newUsername, updatedAt: new Date().toISOString() });
            await updateProfile(window.firebase.auth.currentUser, { displayName: newUsername });
            this.currentUserData.username = newUsername;
            this.updateUserUI();
            this.updateAvatars();
            this.showNotification('Nombre de usuario actualizado', 'success');
            this.closeChangeUsernameModal();
        } catch (error) {
            console.error('Error al cambiar username:', error);
            this.showNotification('Error al actualizar el nombre de usuario', 'error');
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    openChangeBioModal() {
        const modal = document.getElementById('changeBioModal');
        if (!modal) return;
        const input = document.getElementById('newBio');
        if (input) input.value = this.currentUserData?.bio || '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeChangeBioModal() {
        const modal = document.getElementById('changeBioModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    async saveNewBio() {
        const input = document.getElementById('newBio');
        const btn = document.querySelector('#changeBioModal .btn-primary');
        if (!input) return;
        const newBio = input.value.trim();
        if (newBio.length > 120) { this.showNotification('La bio no puede tener mas de 120 caracteres', 'error'); return; }
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; btn.disabled = true; }
        try {
            const { doc, updateDoc } = window.firebase.firebaseModules;
            await updateDoc(doc(window.firebase.firestore, 'users', this.currentUserData.uid), { bio: newBio, updatedAt: new Date().toISOString() });
            this.currentUserData.bio = newBio;
            const bioEl = document.getElementById('profileBio');
            if (bioEl) bioEl.textContent = newBio || 'Sin bio';
            this.showNotification('Bio actualizada', 'success');
            this.closeChangeBioModal();
        } catch (error) {
            console.error('Error al cambiar bio:', error);
            this.showNotification('Error al actualizar la bio', 'error');
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    openChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (!modal) return;
        // BUGFIX: optional chaining para evitar crash
        const cp = document.getElementById('currentPassword');
        const np = document.getElementById('newPassword');
        const cnp = document.getElementById('confirmNewPassword');
        if (cp) cp.value = '';
        if (np) np.value = '';
        if (cnp) cnp.value = '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        const cp = document.getElementById('currentPassword');
        const np = document.getElementById('newPassword');
        const cnp = document.getElementById('confirmNewPassword');
        if (cp) cp.value = '';
        if (np) np.value = '';
        if (cnp) cnp.value = '';
    }

    async saveNewPassword() {
        const currentPwd = document.getElementById('currentPassword')?.value;
        const newPwd = document.getElementById('newPassword')?.value;
        const confirmPwd = document.getElementById('confirmNewPassword')?.value;
        const btn = document.querySelector('#changePasswordModal .btn-primary');
        if (!currentPwd || !newPwd || !confirmPwd) { this.showNotification('Por favor completa todos los campos', 'error'); return; }
        if (newPwd.length < 6) { this.showNotification('La nueva contraseña debe tener al menos 6 caracteres', 'error'); return; }
        if (newPwd !== confirmPwd) { this.showNotification('Las contraseñas nuevas no coinciden', 'error'); return; }
        if (newPwd === currentPwd) { this.showNotification('La nueva contraseña debe ser diferente', 'error'); return; }
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cambiando...'; btn.disabled = true; }
        try {
            const { reauthenticateWithCredential, EmailAuthProvider, updatePassword } = window.firebase.firebaseModules;
            const user = window.firebase.auth.currentUser;
            const credential = EmailAuthProvider.credential(user.email, currentPwd);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPwd);
            this.showNotification('Contraseña cambiada correctamente', 'success');
            this.closeChangePasswordModal();
        } catch (error) {
            console.error('Error al cambiar contraseña:', error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') this.showNotification('La contraseña actual es incorrecta', 'error');
            else if (error.code === 'auth/weak-password') this.showNotification('La nueva contraseña es demasiado débil', 'error');
            else this.showNotification('Error al cambiar la contraseña', 'error');
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    openChangeEmailModal() {
        const modal = document.getElementById('changeEmailModal');
        if (!modal) return;
        const ne = document.getElementById('newEmail');
        const ep = document.getElementById('emailPassword');
        if (ne) ne.value = '';
        if (ep) ep.value = '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeChangeEmailModal() {
        const modal = document.getElementById('changeEmailModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        const ne = document.getElementById('newEmail');
        const ep = document.getElementById('emailPassword');
        if (ne) ne.value = '';
        if (ep) ep.value = '';
    }

    async saveNewEmail() {
        const newEmail = document.getElementById('newEmail')?.value.trim();
        const password = document.getElementById('emailPassword')?.value;
        const btn = document.querySelector('#changeEmailModal .btn-primary');
        if (!newEmail || !password) { this.showNotification('Por favor completa todos los campos', 'error'); return; }
        if (!this.isValidEmail(newEmail)) { this.showNotification('El correo electrónico no es válido', 'error'); return; }
        if (newEmail === this.currentUserData?.email) { this.showNotification('Es el mismo correo que ya tienes', 'info'); return; }
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cambiando...'; btn.disabled = true; }
        try {
            const { reauthenticateWithCredential, EmailAuthProvider, updateEmail } = window.firebase.firebaseModules;
            const { doc, updateDoc } = window.firebase.firebaseModules;
            const user = window.firebase.auth.currentUser;
            const credential = EmailAuthProvider.credential(user.email, password);
            await reauthenticateWithCredential(user, credential);
            await updateEmail(user, newEmail);
            await updateDoc(doc(window.firebase.firestore, 'users', this.currentUserData.uid), { email: newEmail, updatedAt: new Date().toISOString() });
            this.currentUserData.email = newEmail;
            this.updateUserUI();
            this.showNotification('Correo electrónico actualizado', 'success');
            this.closeChangeEmailModal();
        } catch (error) {
            console.error('Error al cambiar email:', error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') this.showNotification('La contraseña es incorrecta', 'error');
            else if (error.code === 'auth/email-already-in-use') this.showNotification('Ese correo ya está en uso', 'error');
            else if (error.code === 'auth/invalid-email') this.showNotification('El correo electrónico no es válido', 'error');
            else this.showNotification('Error al cambiar el correo electrónico', 'error');
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    openDeleteAccountModal() {
        const modal = document.getElementById('deleteAccountModal');
        if (!modal) return;
        const dap = document.getElementById('deleteAccountPassword');
        const dct = document.getElementById('deleteConfirmText');
        if (dap) dap.value = '';
        if (dct) dct.value = '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeDeleteAccountModal() {
        const modal = document.getElementById('deleteAccountModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        const dap = document.getElementById('deleteAccountPassword');
        const dct = document.getElementById('deleteConfirmText');
        if (dap) dap.value = '';
        if (dct) dct.value = '';
    }

    async deleteAccount() {
        const password = document.getElementById('deleteAccountPassword')?.value;
        const confirmText = document.getElementById('deleteConfirmText')?.value.trim();
        const btn = document.querySelector('#deleteAccountModal .btn-danger');
        if (!password) { this.showNotification('Ingresa tu contraseña para confirmar', 'error'); return; }
        if (confirmText !== 'ELIMINAR') { this.showNotification('Debes escribir "ELIMINAR" para confirmar', 'error'); return; }
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...'; btn.disabled = true; }
        try {
            const { reauthenticateWithCredential, EmailAuthProvider, deleteUser } = window.firebase.firebaseModules;
            const { doc, deleteDoc, collection, query, where, getDocs, writeBatch } = window.firebase.firebaseModules;
            const user = window.firebase.auth.currentUser;
            const credential = EmailAuthProvider.credential(user.email, password);
            await reauthenticateWithCredential(user, credential);
            const uid = this.currentUserData.uid;
            const batch = writeBatch(window.firebase.firestore);
            const collectionsToClean = [
                { name: 'comments', field: 'userId' },
                { name: 'notifications', field: 'userId' },
                { name: 'friends', field: 'userId' },
                { name: 'friendRequests', field: 'fromUserId' },
                { name: 'friendRequests', field: 'toUserId' },
                { name: 'commentLikes', field: 'userId' }
            ];
            for (const col of collectionsToClean) {
                try {
                    const snap = await getDocs(query(collection(window.firebase.firestore, col.name), where(col.field, '==', uid)));
                    snap.forEach(d => batch.delete(d.ref));
                } catch (e) { console.warn(`No se pudo limpiar ${col.name}:`, e); }
            }
            batch.delete(doc(window.firebase.firestore, 'users', uid));
            await batch.commit();
            await deleteUser(user);
            this.showNotification('Cuenta eliminada permanentemente', 'success');
        } catch (error) {
            console.error('Error al eliminar cuenta:', error);
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') this.showNotification('Contraseña incorrecta', 'error');
            else this.showNotification('Error al eliminar la cuenta', 'error');
        }
    }

    // ===== MODAL: AVATAR =====
    openAvatarModal() {
        const modal = document.getElementById('avatarModal');
        if (!modal) return;
        this.updateAvatarPreview();
        const fileInput = document.getElementById('avatarFileInput');
        if (fileInput) fileInput.value = '';
        const fileNameDisplay = document.getElementById('selectedFileName');
        if (fileNameDisplay) fileNameDisplay.textContent = '';
        if (fileInput && !fileInput._listenerAdded) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    if (file.size > 2 * 1024 * 1024) { this.showNotification('La imagen no puede pesar más de 2MB', 'error'); fileInput.value = ''; return; }
                    const display = document.getElementById('selectedFileName');
                    if (display) display.textContent = file.name;
                }
            });
            fileInput._listenerAdded = true;
        }
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeAvatarModal() {
        const modal = document.getElementById('avatarModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    updateAvatarPreview() {
        const preview = document.getElementById('avatarPreview');
        const typeLabel = document.getElementById('currentAvatarType');
        if (!preview) return;
        const avatar = this.currentUserData?.avatar;
        const username = this.currentUserData?.username || 'U';
        preview.innerHTML = '';
        preview.style.cssText = '';
        if (!avatar) {
            const initial = username.charAt(0).toUpperCase();
            preview.textContent = initial;
            preview.style.cssText = 'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:2.5rem;';
            const colors = ['#EF4444','#3B82F6','#10B981','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316'];
            preview.style.backgroundColor = colors[initial.charCodeAt(0) % colors.length];
            preview.style.color = 'white';
            if (typeLabel) typeLabel.textContent = 'Inicial del nombre';
        } else if (avatar.startsWith('http')) {
            const img = document.createElement('img');
            img.src = avatar;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
            preview.appendChild(img);
            if (typeLabel) typeLabel.textContent = 'Imagen personalizada';
        } else if (this.isEmoji(avatar)) {
            preview.textContent = avatar;
            preview.style.cssText = 'font-size:3rem;display:flex;align-items:center;justify-content:center;';
            if (typeLabel) typeLabel.textContent = 'Emoji: ' + avatar;
        }
    }

    setEmoji(emoji) {
        const input = document.getElementById('emojiInput');
        if (input) input.value = emoji;
        const preview = document.getElementById('avatarPreview');
        const typeLabel = document.getElementById('currentAvatarType');
        if (preview) {
            preview.innerHTML = '';
            preview.textContent = emoji;
            preview.style.cssText = 'font-size:3rem;display:flex;align-items:center;justify-content:center;background:none;';
        }
        if (typeLabel) typeLabel.textContent = 'Emoji: ' + emoji;
    }

    async setAvatarType(type) {
        if (!this.currentUserData) return;
        try {
            const { doc, updateDoc } = window.firebase.firebaseModules;
            const userRef = doc(window.firebase.firestore, 'users', this.currentUserData.uid);
            if (type === 'initial') {
                await updateDoc(userRef, { avatar: null });
                this.currentUserData.avatar = null;
                this.showNotification('Avatar cambiado a inicial del nombre', 'success');
            } else if (type === 'emoji') {
                const input = document.getElementById('emojiInput');
                const emoji = input?.value.trim();
                if (!emoji || !this.isEmoji(emoji)) { this.showNotification('Selecciona o pega un emoji válido', 'error'); return; }
                await updateDoc(userRef, { avatar: emoji });
                this.currentUserData.avatar = emoji;
                this.showNotification('Avatar de emoji guardado', 'success');
            }
            this.updateAvatars();
            this.updateAvatarPreview();
            // BUGFIX: cerrar modal automáticamente al guardar
            this.closeAvatarModal();
        } catch (error) {
            console.error('Error al cambiar avatar:', error);
            this.showNotification('Error al guardar el avatar', 'error');
        }
    }

    async uploadAvatarImage() {
        const fileInput = document.getElementById('avatarFileInput');
        const btn = document.getElementById('uploadAvatarBtn');
        if (!fileInput?.files?.length) { this.showNotification('Primero selecciona una imagen', 'error'); return; }
        const file = fileInput.files[0];
        if (file.size > 2 * 1024 * 1024) { this.showNotification('La imagen no puede pesar más de 2MB', 'error'); return; }
        if (!['image/jpeg','image/png','image/jpg'].includes(file.type)) { this.showNotification('Solo se permiten imágenes JPG o PNG', 'error'); return; }
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...'; btn.disabled = true; }
        try {
            const { ref, uploadBytes, getDownloadURL } = window.firebase.firebaseModules;
            const { doc, updateDoc } = window.firebase.firebaseModules;
            const storageRef = ref(window.firebase.storage, `avatars/${this.currentUserData.uid}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            await updateDoc(doc(window.firebase.firestore, 'users', this.currentUserData.uid), { avatar: downloadURL });
            this.currentUserData.avatar = downloadURL;
            this.updateAvatars();
            this.updateAvatarPreview();
            this.showNotification('Imagen de perfil actualizada', 'success');
            const display = document.getElementById('selectedFileName');
            if (display) display.textContent = '';
            fileInput.value = '';
            this.closeAvatarModal();
        } catch (error) {
            console.error('Error al subir imagen:', error);
            this.showNotification('Error al subir la imagen', 'error');
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    async removeAvatar() {
        const confirmed = await this.showConfirm('<i class="fas fa-trash"></i> Eliminar avatar', '¿Eliminar tu avatar? Volverá a mostrar tu inicial.', 'Eliminar');
        if (!confirmed) return;
        try {
            const { doc, updateDoc } = window.firebase.firebaseModules;
            await updateDoc(doc(window.firebase.firestore, 'users', this.currentUserData.uid), { avatar: null });
            this.currentUserData.avatar = null;
            this.updateAvatars();
            this.updateAvatarPreview();
            this.showNotification('Avatar eliminado', 'success');
        } catch (error) {
            console.error('Error al eliminar avatar:', error);
            this.showNotification('Error al eliminar el avatar', 'error');
        }
    }

    // ===== EXPORTAR DATOS =====
    async exportUserData() {
        if (!this.currentUserData) { this.showNotification('Debes iniciar sesión', 'error'); return; }
        this.showNotification('Preparando exportación...', 'info');
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const uid = this.currentUserData.uid;
            const userData = { ...this.currentUserData };
            delete userData.uid;
            let comments = [], notifications = [];
            try {
                const snap = await getDocs(query(collection(window.firebase.firestore, 'comments'), where('userId', '==', uid)));
                snap.forEach(d => comments.push({ id: d.id, ...d.data() }));
            } catch (e) {}
            try {
                const snap = await getDocs(query(collection(window.firebase.firestore, 'notifications'), where('userId', '==', uid)));
                snap.forEach(d => notifications.push({ id: d.id, ...d.data() }));
            } catch (e) {}
            const exportData = { exportDate: new Date().toISOString(), appVersion: 'v1.4.0', profile: userData, comments, notifications, totalComments: comments.length, totalNotifications: notifications.length };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lc-app-datos-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showNotification('Datos exportados correctamente', 'success');
        } catch (error) {
            console.error('Error al exportar datos:', error);
            this.showNotification('Error al exportar los datos', 'error');
        }
    }

    async checkForUpdates() {
        this.showNotification('Verificando actualizaciones...', 'info');
        try {
            const { doc, getDoc } = window.firebase.firebaseModules;
            const verSnap = await getDoc(doc(window.firebase.firestore, 'config', 'appVersion'));
            const firebaseVersion = verSnap.exists() ? (verSnap.data().version || null) : null;
            const localVersionEl = document.getElementById('infoAppVersion');
            const localVersion = localVersionEl ? localVersionEl.textContent.trim() : (this.appBranding?.version || 'v1.4.0');
            if (firebaseVersion && firebaseVersion !== localVersion) {
                this.showNotification(`¡Nueva versión disponible: ${firebaseVersion}! Recarga para actualizar.`, 'info');
            } else {
                this.showNotification(`Tienes la versión más reciente (${localVersion})`, 'success');
            }
        } catch (e) {
            const localVersionEl = document.getElementById('infoAppVersion');
            const localVersion = localVersionEl ? localVersionEl.textContent.trim() : 'v1.4.0';
            this.showNotification(`Ya tienes la versión más reciente (${localVersion})`, 'success');
        }
    }

    // ===== MODAL DE CONFIRMACIÓN (reemplaza confirm() nativo) =====
    showConfirm(title, message, acceptLabel = 'Confirmar', dangerMode = true) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleEl = document.getElementById('confirmModalTitle');
            const msgEl = document.getElementById('confirmModalMessage');
            const cancelBtn = document.getElementById('confirmModalCancel');
            const acceptBtn = document.getElementById('confirmModalAccept');
            if (!modal || !titleEl || !msgEl || !cancelBtn || !acceptBtn) { resolve(window.confirm(message)); return; }
            titleEl.innerHTML = title;
            msgEl.textContent = message;
            acceptBtn.textContent = acceptLabel;
            acceptBtn.className = dangerMode ? 'btn-danger' : 'btn-primary';
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            const cleanup = (result) => {
                modal.classList.remove('active');
                document.body.style.overflow = 'auto';
                cancelBtn.removeEventListener('click', onCancel);
                acceptBtn.removeEventListener('click', onAccept);
                resolve(result);
            };
            const onCancel = () => cleanup(false);
            const onAccept = () => cleanup(true);
            cancelBtn.addEventListener('click', onCancel);
            acceptBtn.addEventListener('click', onAccept);
        });
    }

    // ===== PRIVACIDAD Y TÉRMINOS =====
    async _loadLegalModal(type, modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        const bodyEl = modal.querySelector('.modal-body');
        if (bodyEl) bodyEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;gap:12px;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--color-primary)"></i><span>Cargando…</span></div>`;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const snap = await getDocs(query(collection(window.firebase.firestore, 'legal_docs'), where('type', '==', type)));
            if (!snap.empty) {
                const data = snap.docs[0].data();
                const titleEl = modal.querySelector('.modal-header h3');
                if (titleEl) {
                    const icon = type === 'privacy' ? 'fa-shield-alt' : 'fa-file-contract';
                    titleEl.innerHTML = `<i class="fas ${icon}"></i> ${this.sanitizeText(data.title || '')}`;
                }
                if (bodyEl) {
                    const content = data.content || '';
                    const hasHtml = /<[a-z][\s\S]*>/i.test(content);
                    const rendered = hasHtml ? this._legalToCards(content) : `<p style="color:var(--text-secondary);line-height:1.7">${this.sanitizeText(content).replace(/\n/g,'<br>')}</p>`;
                    bodyEl.innerHTML = `<div class="policy-content">${rendered}</div>`;
                }
            } else {
                if (bodyEl) bodyEl.innerHTML = `<div class="empty-state" style="padding:40px"><i class="fas fa-file-alt"></i><h4>Contenido no disponible</h4></div>`;
            }
        } catch (error) {
            if (bodyEl) bodyEl.innerHTML = `<div class="empty-state" style="padding:40px"><i class="fas fa-exclamation-triangle"></i><h4>Error al cargar</h4></div>`;
        }
    }

    _legalToCards(html) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const children = Array.from(wrap.childNodes);
        const sections = [];
        let current = null;
        children.forEach(node => {
            const tag = node.nodeName?.toLowerCase();
            if (['h4','h3','h2'].includes(tag)) {
                if (current) sections.push(current);
                current = { title: node.textContent.trim(), nodes: [] };
            } else if (current) {
                if (node.nodeType === 1 || node.textContent?.trim()) current.nodes.push(node);
            } else {
                if (node.textContent?.trim()) sections.push({ title: '', nodes: [node] });
            }
        });
        if (current) sections.push(current);
        if (sections.length === 0) return `<p style="color:var(--text-secondary);line-height:1.7">${wrap.textContent}</p>`;
        return sections.map(sec => {
            const contentWrap = document.createElement('div');
            sec.nodes.forEach(n => contentWrap.appendChild(n.cloneNode(true)));
            contentWrap.querySelectorAll('ul, ol').forEach(list => {
                const ul = document.createElement('ul');
                ul.className = 'help-list';
                list.querySelectorAll('li').forEach(li => {
                    const newLi = document.createElement('li');
                    newLi.textContent = li.textContent.trim();
                    ul.appendChild(newLi);
                });
                list.replaceWith(ul);
            });
            if (!sec.title) {
                return `<div style="background:var(--color-primary-light);border:1.5px solid var(--border-color);border-radius:12px;padding:14px 16px;font-size:.83rem;color:var(--text-secondary);display:flex;align-items:center;gap:10px;">
                    <i class="fas fa-info-circle" style="color:var(--color-primary);flex-shrink:0"></i>
                    <span>${contentWrap.textContent.trim()}</span>
                </div>`;
            }
            return `<div class="policy-section"><h4>${sec.title}</h4>${contentWrap.innerHTML}</div>`;
        }).join('');
    }

    showPrivacyPolicy() { this._loadLegalModal('privacy', 'privacyModal'); }
    showTerms() { this._loadLegalModal('terms', 'termsModal'); }

    // ===== APP BRANDING =====
    async loadAppBranding() {
        // Intentar caché primero — así el splash muestra el nombre correcto de inmediato
        const cached = localStorage.getItem('appBranding');
        if (cached) {
            try {
                this.appBranding = JSON.parse(cached);
                this.applyAppBranding(this.appBranding);
                // Nombre ya visible en splash desde caché
            } catch(e) {}
        } else {
            // Primera vez sin caché: mostrar "..." en el splash
            const splashEl = document.getElementById('splashBrandName');
            if (splashEl) splashEl.textContent = '···';
        }

        const wait = () => new Promise(res => {
            if (window.firebase && window.firebase.firebaseModules) { res(); return; }
            const iv = setInterval(() => {
                if (window.firebase && window.firebase.firebaseModules) { clearInterval(iv); res(); }
            }, 200);
        });
        await wait();
        try {
            const { doc, getDoc } = window.firebase.firebaseModules;
            const snap = await getDoc(doc(window.firebase.firestore, 'config', 'appInfo'));
            if (snap.exists()) {
                this.appBranding = snap.data();
                localStorage.setItem('appBranding', JSON.stringify(this.appBranding));
                this.applyAppBranding(this.appBranding);
            }
        } catch(e) { console.warn('Branding no disponible:', e); }
    }

    applyAppBranding(data) {
        if (!data) return;
        const name     = data.name       || 'LC';
        const version  = data.version    || 'v1.4.0';
        const subtitle = data.subtitle   || 'Aplicación Personal';
        const lastUpd  = data.lastUpdate || '';

        ['appBrandDisplay','splashBrandName','registerBrandName','loginBrandName',
         'sidebarBrandName','footerBrandName','infoAppName'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = name;
        });

        const pt = document.getElementById('pageTitle');
        if (pt) pt.textContent = `${name} - App Personal`;

        const sidebarSub = document.getElementById('sidebarBrandSubtitle');
        if (sidebarSub) sidebarSub.textContent = subtitle;
        const footerSub = document.getElementById('footerBrandSub');
        if (footerSub) footerSub.textContent = `${name} - ${subtitle}`;

        const verEl = document.getElementById('infoAppVersion');
        if (verEl) verEl.textContent = version;

        const updEl = document.getElementById('infoLastUpdate');
        if (updEl && lastUpd) updEl.textContent = lastUpd;

        const me = document.getElementById('infoAppMeaning');
        if (me && data.letters && data.letters.length)
            me.textContent = data.letters.map(l => `${l.letter}: ${l.meaning}`).join(' · ');
    }

    openBrandMeaningModal() {
        const modal = document.getElementById('brandMeaningModal');
        const content = document.getElementById('brandMeaningContent');
        if (!modal || !content) return;
        const data = this.appBranding || {};
        const name = data.name || 'LC';
        const letters = data.letters || [];
        content.innerHTML =
            `<div style="text-align:center;padding:8px 0 16px">
                <div style="width:72px;height:72px;border-radius:50%;background:var(--color-primary);
                    color:#fff;font-size:1.8rem;font-weight:800;display:inline-flex;
                    align-items:center;justify-content:center;
                    box-shadow:0 8px 24px rgba(0,0,0,.15);margin-bottom:10px">${name}</div>
                <p style="color:var(--text-secondary);font-size:.85rem">Cada letra tiene un significado especial ✨</p>
            </div>` +
            (letters.length
                ? letters.map(l =>
                    `<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;
                        background:var(--color-primary-light);border-radius:12px;
                        border-left:4px solid var(--color-primary)">
                        <div style="width:40px;height:40px;border-radius:50%;
                            background:var(--color-primary);color:#fff;font-size:1.1rem;
                            font-weight:800;display:flex;align-items:center;
                            justify-content:center;flex-shrink:0">${l.letter}</div>
                        <div>
                            <p style="font-weight:700;color:var(--text-color);font-size:.95rem">
                                ${l.letter} de ${l.meaning || '…'}
                            </p>
                            ${l.description
                                ? `<p style="color:var(--text-secondary);font-size:.8rem;margin-top:3px">${l.description}</p>`
                                : ''}
                        </div>
                    </div>`).join('')
                : `<div style="text-align:center;padding:20px;color:var(--text-secondary)">
                        <i class="fas fa-heart" style="color:var(--color-primary);font-size:1.5rem;display:block;margin-bottom:8px"></i>
                        <p>Aún no hay significado configurado.<br>Puedes agregarlo desde el panel Admin → Ajustes.</p>
                   </div>`);
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // ===== SISTEMA DE CHAT =====
    async openChatModal(friendId, friendName) {
        if (!this.currentUserData) return;
        const modal = document.getElementById('chatModal');
        const titleEl = document.getElementById('chatModalTitle');
        const hiddenInput = document.getElementById('chatFriendId');
        if (!modal) return;
        if (titleEl) titleEl.innerHTML = `<i class="fas fa-comment-dots"></i> Chat con ${this.sanitizeText(friendName)}`;
        if (hiddenInput) hiddenInput.value = friendId;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        const chatInput = document.getElementById('chatInput');
        if (chatInput) { chatInput.value = ''; chatInput.style.height = 'auto'; }
        await this.loadChatMessages(friendId);
    }

    closeChatModal() {
        const modal = document.getElementById('chatModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        if (this._chatUnsubscribe) { this._chatUnsubscribe(); this._chatUnsubscribe = null; }
    }

    async loadChatMessages(friendId) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            const { collection, query, orderBy, onSnapshot } = window.firebase.firebaseModules;
            const uid = this.currentUserData.uid;
            const chatId = [uid, friendId].sort().join('_');
            const msgsRef = collection(window.firebase.firestore, 'chats', chatId, 'messages');
            const q = query(msgsRef, orderBy('createdAt', 'asc'));
            if (this._chatUnsubscribe) this._chatUnsubscribe();
            this._chatUnsubscribe = onSnapshot(q, (snapshot) => {
                const messages = [];
                snapshot.forEach(d => messages.push({ id: d.id, ...d.data() }));
                this.renderChatMessages(messages);
            }, (error) => {
                console.warn('Error en chat listener:', error);
                container.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><p>No hay mensajes aún. ¡Di hola!</p></div>';
            });
        } catch (error) {
            console.error('Error loading chat:', error);
            container.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><p>No hay mensajes aún. ¡Di hola!</p></div>';
        }
    }

    renderChatMessages(messages) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        if (!messages.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><p>No hay mensajes aún. ¡Di hola!</p></div>';
            return;
        }
        const uid = this.currentUserData?.uid;
        container.innerHTML = messages.map(msg => {
            const isMe = msg.senderId === uid;
            const time = msg.createdAt?.toDate?.()?.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) || '';
            const safeText = this.sanitizeText(msg.text || '');
            return `<div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};gap:2px;"><div style="max-width:75%;padding:10px 14px;border-radius:${isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};background:${isMe ? 'var(--color-primary)' : 'var(--card-bg)'};color:${isMe ? '#fff' : 'var(--text-color)'};border:${isMe ? 'none' : '1px solid var(--border-color)'};font-size:.9rem;line-height:1.5;word-break:break-word;">${safeText}</div><div style="font-size:.72rem;color:var(--text-secondary);padding:0 4px;">${time}</div></div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
    }

    async sendChatMessage() {
        const input = document.getElementById('chatInput');
        const friendId = document.getElementById('chatFriendId')?.value;
        if (!input || !friendId || !this.currentUserData) return;
        const text = input.value.trim();
        if (!text) return;
        const btn = document.getElementById('sendChatBtn');
        if (btn) btn.disabled = true;
        try {
            const { collection, addDoc, serverTimestamp, doc, setDoc } = window.firebase.firebaseModules;
            const uid = this.currentUserData.uid;
            const chatId = [uid, friendId].sort().join('_');
            await addDoc(collection(window.firebase.firestore, 'chats', chatId, 'messages'), {
                text,
                senderId: uid,
                senderName: this.currentUserData.username,
                createdAt: serverTimestamp()
            });
            await setDoc(doc(window.firebase.firestore, 'chats', chatId), {
                participants: [uid, friendId],
                lastMessage: text.length > 50 ? text.slice(0, 50) + '…' : text,
                lastMessageAt: serverTimestamp(),
                lastSenderId: uid
            }, { merge: true });
            input.value = '';
            input.style.height = 'auto';
        } catch (error) {
            console.error('Error sending message:', error);
            this.showNotification('Error al enviar mensaje', 'error');
        } finally {
            if (btn) btn.disabled = false;
            input?.focus();
        }
    }

    // ===== REPORTES Y BLOQUEO =====
    openReportModal(targetId, targetName) {
        const modal = document.getElementById('reportUserModal');
        if (!modal) return;
        const nameEl = document.getElementById('reportUserName');
        const hiddenEl = document.getElementById('reportTargetId');
        const reasonEl = document.getElementById('reportReason');
        const detailsEl = document.getElementById('reportDetails');
        if (nameEl) nameEl.textContent = `Usuario: ${targetName}`;
        if (hiddenEl) hiddenEl.value = targetId;
        if (reasonEl) reasonEl.value = '';
        if (detailsEl) detailsEl.value = '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeReportModal() {
        const modal = document.getElementById('reportUserModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    async submitReport() {
        const targetId = document.getElementById('reportTargetId')?.value;
        const reason = document.getElementById('reportReason')?.value;
        const details = document.getElementById('reportDetails')?.value.trim();
        const btn = document.querySelector('#reportUserModal .btn-primary');
        if (!targetId || !reason) { this.showNotification('Selecciona un motivo para el reporte', 'error'); return; }
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; btn.disabled = true; }
        try {
            const { collection, addDoc, serverTimestamp } = window.firebase.firebaseModules;
            await addDoc(collection(window.firebase.firestore, 'reports'), {
                reporterId: this.currentUserData.uid,
                reporterName: this.currentUserData.username,
                targetId, reason,
                details: details || '',
                status: 'pending',
                createdAt: serverTimestamp()
            });
            this.showNotification('Reporte enviado. El equipo lo revisará pronto.', 'success');
            this.closeReportModal();
        } catch (error) {
            console.error('Error submitting report:', error);
            this.showNotification('Error al enviar el reporte', 'error');
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    async blockUser() {
        const targetId = document.getElementById('reportTargetId')?.value;
        const nameEl = document.getElementById('reportUserName');
        const targetName = nameEl ? nameEl.textContent.replace('Usuario: ', '') : 'este usuario';
        const confirmed = await this.showConfirm(
            '<i class="fas fa-ban"></i> Bloquear usuario',
            `¿Bloquear a ${targetName}? No podrá enviarte solicitudes. Puedes desbloquearlo desde Ajustes.`,
            'Bloquear'
        );
        if (!confirmed) return;
        try {
            const { collection, addDoc, serverTimestamp } = window.firebase.firebaseModules;
            await addDoc(collection(window.firebase.firestore, 'blockedUsers'), {
                blockerId: this.currentUserData.uid,
                blockedId: targetId,
                createdAt: serverTimestamp()
            });
            const friendEntry = this.friendsList.find(f => f.friendId === targetId);
            if (friendEntry) await this.removeFriend(friendEntry.id, targetId, targetName);
            this.showNotification(`${targetName} ha sido bloqueado`, 'success');
            this.closeReportModal();
        } catch (error) {
            console.error('Error blocking user:', error);
            this.showNotification('Error al bloquear usuario', 'error');
        }
    }

}

// ===== INICIALIZAR APLICACIÓN =====
function initApp() {
    if (!window.app) window.app = new App();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
