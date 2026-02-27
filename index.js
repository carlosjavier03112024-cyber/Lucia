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
        
        this.init();
    }

    // ===== INICIALIZACIÓN =====
    init() {
        this.updateCurrentYear();
        this.setupEventListeners();
        this.applyThemeFromStorage();
        this.applyColorThemeFromStorage();
        this.checkAuthState();
        this.setupFriendsTabs();
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
    }

    setupModalEvents() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = 'auto';
                }
            });
        });
    }

    setupFriendsTabs() {}

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
                this.loadUserProfile(user.uid);
                this.hideAllAuthScreens();
                document.getElementById('mainApp').classList.remove('hidden');
                this.showSection('inicioSection');
                this.showNotification('¡Bienvenido de nuevo!', 'success');
                this.hideSplashScreen();
            } else {
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
                // MEJORADO: generateUserId ahora garantiza unicidad
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
                // MEJORADO: solo actualiza si el modal está abierto y no está en proceso de carga
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

    // ===== GENERACIÓN DE USER ID ÚNICO SIN COLISIONES =====
    // CORREGIDO: verifica contra Firestore antes de asignar
    async generateUniqueUserId() {
        const { collection, query, where, getDocs } = window.firebase.firebaseModules;
        const maxAttempts = 20;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const candidate = Math.floor(10000 + Math.random() * 90000).toString();
            try {
                const usersRef = collection(window.firebase.firestore, 'users');
                const q = query(usersRef, where('userId', '==', candidate));
                const snap = await getDocs(q);
                if (snap.empty) return candidate; // Único, listo
            } catch (e) {
                console.warn('Error verificando ID:', e);
                return candidate; // Si falla la verificación, usar de todas formas
            }
        }
        // Fallback: si después de 20 intentos no encontró uno libre (muy improbable)
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
            // NUEVO: Verificar si el username ya existe
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

            // MEJORADO: generateUniqueUserId garantiza no colisiones
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
                '🎉 ¡Bienvenido a LC App!',
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

    // NUEVO: Verificar si username ya existe
    async checkUsernameExists(username) {
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const usersRef = collection(window.firebase.firestore, 'users');
            const q = query(usersRef, where('username', '==', username));
            const snap = await getDocs(q);
            return !snap.empty;
        } catch (e) {
            console.warn('No se pudo verificar username:', e);
            return false; // En caso de error, no bloquear el registro
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

    // ===== NUEVO: RECUPERAR CONTRASEÑA =====
    openForgotPasswordModal() {
        const modal = document.getElementById('forgotPasswordModal');
        if (modal) {
            const resetEmailInput = document.getElementById('resetEmail');
            // Pre-rellenar con el email del campo de login si existe
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
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        if (!sidebar) return;
        if (forceClose === false) sidebar.classList.remove('active');
        else sidebar.classList.toggle('active');
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
        this.showNotification(`Tema cambiado a ${newTheme === 'dark' ? 'oscuro' : 'claro'}`, 'success');
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
        this.showNotification(`Color de tema cambiado a ${color}`, 'success');
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
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            const currentMonthElement = document.getElementById('currentMonth');
            if (currentMonthElement) currentMonthElement.textContent = `${monthNames[this.currentMonth]} ${this.currentYear}`;
            const calendarContent = await this.loadCalendarContent();
            this.generateCalendarGrid(today, calendarContent);
        } catch (error) {
            console.error('Error loading calendar:', error);
            this.generateCalendarGrid(new Date(), {});
        }
    }

    async loadCalendarContent() {
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
            return content;
        } catch (error) {
            console.error('Error loading calendar content:', error);
            return {};
        }
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
        this.showNotification('Calendario actualizado a hoy', 'success');
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
            const dateParts = dateStr.split('-');
            const date = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isFuture = date > today;
            const formattedDate = date.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            if (isFuture) {
                if (title) title.innerHTML = `<i class="fas fa-lock"></i> Día Bloqueado - ${formattedDate}`;
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
                        if (dayContent && comments) comments.classList.remove('hidden');
                    }, 500);
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
            let content = null;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                content = {
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
            });
            return content;
        } catch (error) {
            console.error('Error en loadDayContent:', error);
            throw error;
        }
    }

    renderDayContent(content) {
        const container = document.getElementById('dayModalContent');
        if (!container) return;
        if (!content) {
            container.innerHTML = `<div class="day-content-main"><div class="day-content-header"><h4>No hay contenido para este día</h4></div><div class="day-content-body"><p>El contenido para este día no está disponible.</p></div></div>`;
            return;
        }
        const tagsHtml = content.tags?.length > 0 ? `<div class="tags-container">${content.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : '';
        container.innerHTML = `<div class="day-content-main"><div class="day-content-header"><h4>${content.title}</h4><p class="day-content-date"><i class="fas fa-calendar-alt"></i> ${content.date}</p>${tagsHtml}</div><div class="day-content-body">${this.formatContent(content.content)}</div></div>`;
    }

    formatContent(content) {
        if (!content) return '<p>Sin contenido disponible</p>';
        let formatted = content.replace(/\n/g, '<br>');
        formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="day-content-link">$1</a>');
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
            await this.loadCommentLikes(comments);
            const commentsCount = document.getElementById('commentsCount');
            if (commentsCount) commentsCount.textContent = comments.length;
            return comments;
        } catch (error) {
            console.error('Error loading comments:', error);
            return [];
        }
    }

    async loadCommentLikes(comments) {
        if (!this.currentUserData || !comments?.length) return;
        try {
            const { collection, query, where, getDocs } = window.firebase.firebaseModules;
            const commentIds = comments.map(c => c.id);
            const likesRef = collection(window.firebase.firestore, 'commentLikes');
            const q = query(likesRef, where('commentId', 'in', commentIds), where('userId', '==', this.currentUserData.uid));
            const querySnapshot = await getDocs(q);
            this.commentLikes = {};
            querySnapshot.forEach((doc) => { this.commentLikes[doc.data().commentId] = true; });
            for (const comment of comments) {
                const likesCountQuery = query(likesRef, where('commentId', '==', comment.id));
                const likesSnapshot = await getDocs(likesCountQuery);
                comment.likesCount = likesSnapshot.size;
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
            html += `
                <div class="${commentClass}" data-comment-id="${comment.id}">
                    <div class="comment-header">
                        <div class="comment-author">
                            <div class="comment-author-avatar">${authorAvatar}</div>
                            <div class="comment-author-info">
                                <div class="comment-author-name">${comment.authorName || 'Usuario'}</div>
                                <div class="comment-author-id">ID: #${comment.userId?.slice(-5) || '00000'}</div>
                            </div>
                        </div>
                        <div class="comment-date">${date}</div>
                    </div>
                    <div class="comment-text">${comment.text || ''}</div>
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
                this.showNotification('Like agregado', 'success');
            } else {
                const deletePromises = [];
                querySnapshot.forEach((docSnap) => deletePromises.push(deleteDoc(doc(window.firebase.firestore, 'commentLikes', docSnap.id))));
                await Promise.all(deletePromises);
                delete this.commentLikes[commentId];
                this.showNotification('Like eliminado', 'info');
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
            this.showNotification('Comentario publicado exitosamente', 'success');
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

    async createNotificationForAllUsers(title, message, type = 'info') {
        try {
            const { collection, getDocs } = window.firebase.firebaseModules;
            const querySnapshot = await getDocs(collection(window.firebase.firestore, 'users'));
            const promises = [];
            querySnapshot.forEach((userDoc) => {
                const settings = userDoc.data().notificationSettings || {};
                if (settings.news !== false) promises.push(this.createNotification(userDoc.id, title, message, type));
            });
            await Promise.all(promises);
        } catch (error) {
            console.error('Error creando notificación global:', error);
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
            container.innerHTML = `<div class="empty-state"><i class="fas fa-bell"></i><h4>No hay notificaciones</h4><p>Aquí aparecerán tus notificaciones</p></div>`;
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
            html += `
                <div class="notification-item ${typeClass} ${readClass}" onclick="app.markNotificationAsRead('${notification.id}')">
                    <div class="notification-icon"><i class="${icon}"></i></div>
                    <div class="notification-content">
                        <div class="notification-title">${notification.title}</div>
                        <div class="notification-message">${notification.message}</div>
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
                resultsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><h4>Usuario no encontrado</h4><p>No existe un usuario con el ID #${searchId}</p></div>`;
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
                    <button class="action-btn action-btn-accept" onclick="app.acceptFriendRequest('${requestId}', '${userData.id}', '${userData.username}')"><i class="fas fa-check"></i> Aceptar solicitud</button>
                    <button class="action-btn action-btn-reject" onclick="app.rejectFriendRequest('${requestId}')"><i class="fas fa-times"></i> Rechazar</button>
                `;
            } else {
                actionButton = `<button class="action-btn action-btn-accept" onclick="app.sendFriendRequest('${userData.id}', '${userData.username}')"><i class="fas fa-user-plus"></i> Enviar solicitud</button>`;
            }
            resultsContainer.innerHTML = `
                <div class="search-results-content">
                    <div class="search-result-item">
                        <div class="result-avatar">${this.getAvatarForUser(userData.id, userData.username)}</div>
                        <div class="result-info">
                            <div class="result-name">${userData.username}</div>
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
            await this.createNotification(targetUserId, '👥 Nueva solicitud de amistad', `${this.currentUserData.username} te ha enviado una solicitud de amistad`, 'info');
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
            container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><h4>No hay solicitudes pendientes</h4></div>`;
            return;
        }
        let html = '';
        this.friendRequests.forEach(request => {
            html += `
                <div class="request-item">
                    <div class="request-avatar">${this.getAvatarForUser(request.fromUserId, request.fromUserName)}</div>
                    <div class="request-info">
                        <div class="request-name">${request.fromUserName}</div>
                        <div class="request-email">${request.fromUserEmail || ''}</div>
                    </div>
                    <div class="request-actions">
                        <button class="action-btn action-btn-accept" onclick="app.acceptFriendRequest('${request.id}', '${request.fromUserId}', '${request.fromUserName}')"><i class="fas fa-check"></i> Aceptar</button>
                        <button class="action-btn action-btn-reject" onclick="app.rejectFriendRequest('${request.id}', '${request.fromUserId}', '${request.fromUserName}')"><i class="fas fa-times"></i> Rechazar</button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    async acceptFriendRequest(requestId, fromUserId, fromUserName, evt) {
        const acceptBtn = (evt || event)?.target?.closest('.action-btn-accept');
        if (acceptBtn) { acceptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; acceptBtn.disabled = true; }
        try {
            const { doc, updateDoc, setDoc, serverTimestamp, collection } = window.firebase.firebaseModules;
            await updateDoc(doc(window.firebase.firestore, 'friendRequests', requestId), { status: 'accepted', acceptedAt: serverTimestamp() });
            const friendsRef1 = doc(collection(window.firebase.firestore, 'friends'));
            await setDoc(friendsRef1, { userId: this.currentUserData.uid, friendId: fromUserId, friendName: fromUserName, status: 'accepted', createdAt: serverTimestamp() });
            const friendsRef2 = doc(collection(window.firebase.firestore, 'friends'));
            await setDoc(friendsRef2, { userId: fromUserId, friendId: this.currentUserData.uid, friendName: this.currentUserData.username, status: 'accepted', createdAt: serverTimestamp() });
            this.showNotification('Solicitud aceptada', 'success');
            await this.createNotification(fromUserId, '✅ Solicitud de amistad aceptada', `${this.currentUserData.username} ha aceptado tu solicitud de amistad`, 'success');
            await Promise.all([this.loadFriendRequests(), this.loadFriendsList(), this.loadSentRequests()]);
        } catch (error) {
            console.error('Error accepting friend request:', error);
            this.showNotification('Error al aceptar solicitud', 'error');
        }
    }

    async rejectFriendRequest(requestId, fromUserId, fromUserName, evt) {
        const rejectBtn = (evt || event)?.target?.closest('.action-btn-reject');
        if (rejectBtn) { rejectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; rejectBtn.disabled = true; }
        try {
            const { doc, updateDoc } = window.firebase.firebaseModules;
            await updateDoc(doc(window.firebase.firestore, 'friendRequests', requestId), { status: 'rejected', rejectedAt: new Date().toISOString() });
            this.showNotification('Solicitud rechazada', 'success');
            if (fromUserId) await this.createNotification(fromUserId, '❌ Solicitud de amistad rechazada', `${this.currentUserData.username} ha rechazado tu solicitud de amistad`, 'error');
            await this.loadFriendRequests();
        } catch (error) {
            console.error('Error rejecting friend request:', error);
            this.showNotification('Error al rechazar solicitud', 'error');
        }
    }

    async loadFriendsList() {
        if (!this.currentUserData) return;
        try {
            const { collection, query, where, getDocs, orderBy, getDoc, doc } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'friends'), where('userId', '==', this.currentUserData.uid), where('status', '==', 'accepted'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            this.friendsList = [];
            for (const docSnap of querySnapshot.docs) {
                const friend = { id: docSnap.id, ...docSnap.data() };
                try {
                    const userDoc = await getDoc(doc(window.firebase.firestore, 'users', friend.friendId));
                    if (userDoc.exists()) { friend.friendData = userDoc.data(); this.friendsList.push(friend); }
                } catch (error) { console.error('Error loading friend data:', error); }
            }
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
            html += `
                <div class="friend-item">
                    <div class="friend-avatar">${this.getAvatarForUser(friend.friendId, friendData?.username)}</div>
                    <div class="friend-info">
                        <div class="friend-name">${friendData?.username || 'Usuario'}</div>
                        <div class="friend-id">ID: #${friendData?.userId || '00000'}</div>
                        <div class="friend-email">${friendData?.email || ''}</div>
                    </div>
                    <div class="friend-actions">
                        <button class="action-btn action-btn-reject" onclick="app.removeFriend('${friend.id}', '${friend.friendId}', '${friendData?.username || 'Usuario'}')"><i class="fas fa-user-minus"></i> Eliminar</button>
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
            const q = query(collection(window.firebase.firestore, 'friendRequests'), where('fromUserId', '==', this.currentUserData.uid), orderBy('createdAt', 'desc'));
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
            html += `
                <div class="request-item ${statusClass}">
                    <div class="request-avatar">${this.getAvatarForUser(request.toUserId, request.toUserName)}</div>
                    <div class="request-info">
                        <div class="request-name">${request.toUserName}</div>
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
        const confirmed = await this.showConfirm('<i class="fas fa-user-minus"></i> Eliminar amigo', `¿Estás seguro de que quieres eliminar a ${friendName} de tus amigos?`, 'Eliminar');
        if (!confirmed) return;
        try {
            const { doc, deleteDoc, collection, query, where, getDocs } = window.firebase.firebaseModules;
            await deleteDoc(doc(window.firebase.firestore, 'friends', friendshipId));
            const q = query(collection(window.firebase.firestore, 'friends'), where('userId', '==', friendId), where('friendId', '==', this.currentUserData.uid));
            const querySnapshot = await getDocs(q);
            await Promise.all(querySnapshot.docs.map(d => deleteDoc(doc(window.firebase.firestore, 'friends', d.id))));
            this.showNotification(`Has eliminado a ${friendName} de tus amigos`, 'success');
            await this.createNotification(friendId, '👥 Eliminado de amigos', `${this.currentUserData.username} te ha eliminado de su lista de amigos`, 'error');
            await this.loadFriendsList();
        } catch (error) {
            console.error('Error removing friend:', error);
            this.showNotification('Error al eliminar amigo', 'error');
        }
    }

    // ===== NEWS FUNCTIONS =====
    async loadNews() {
        try {
            const { collection, getDocs, query, orderBy } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'news'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) { this.renderNews(null); return; }
            let newsData = null;
            let firstDoc = true;
            querySnapshot.forEach((doc) => {
                if (firstDoc) {
                    const data = doc.data();
                    newsData = { id: doc.id, ...data, createdAt: data.createdAt?.toDate() || new Date() };
                    firstDoc = false;
                }
            });
            this.renderNews(newsData);
        } catch (error) {
            console.error('Error loading news:', error);
            this.renderNews(null);
        }
    }

    renderNews(newsData) {
        const container = document.getElementById('newsContainer');
        const loading = document.getElementById('loadingNews');
        const countElement = document.getElementById('newsCount');
        if (loading) loading.classList.add('hidden');
        if (countElement) countElement.textContent = newsData ? '1' : '0';
        if (!container) return;
        if (!newsData) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-newspaper"></i><h4>No hay novedades publicadas</h4></div>`;
            return;
        }
        const date = newsData.createdAt ? newsData.createdAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Fecha no disponible';
        if (newsData.description && !newsData.implemented) {
            container.innerHTML = `<div class="news-single-card"><div class="news-card-header"><div><div class="news-card-title">${newsData.title || 'Actualización'}</div><div class="news-card-date">Publicado el ${date}</div></div><div class="news-card-version">${newsData.version || 'v1.0.0'}</div></div><div class="news-card-body"><div style="color:var(--text-color);line-height:1.6;font-size:1rem;padding:20px;">${newsData.description}</div></div><div class="news-card-footer"><p><i class="fas fa-info-circle"></i> Versión ${newsData.version || 'v1.0.0'}</p></div></div>`;
        } else {
            const sections = [
                { key: 'implemented', icon: 'fa-check-circle', label: 'Implementado' },
                { key: 'new', icon: 'fa-star', label: 'Nuevo' },
                { key: 'corrections', icon: 'fa-wrench', label: 'Correcciones' },
                { key: 'upcoming', icon: 'fa-clock', label: 'Próxima actualización' }
            ].filter(s => newsData[s.key]?.length > 0).map(s => `
                <div class="news-section">
                    <div class="news-section-title"><i class="fas ${s.icon}"></i> ${s.label}</div>
                    <ul class="news-list">${newsData[s.key].map(item => `<li>${item}</li>`).join('')}</ul>
                </div>
            `).join('');
            container.innerHTML = `<div class="news-single-card"><div class="news-card-header"><div><div class="news-card-title">${newsData.title || 'Actualización'}</div><div class="news-card-date">Publicado el ${date}</div></div><div class="news-card-version">${newsData.version || 'v1.0.0'}</div></div><div class="news-card-body">${sections}</div><div class="news-card-footer"><p><i class="fas fa-info-circle"></i> Versión ${newsData.version || 'v1.0.0'}</p></div></div>`;
        }
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
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const futureDate = new Date();
            futureDate.setDate(now.getDate() + 7);
            const { collection, query, where, getDocs, orderBy } = window.firebase.firebaseModules;
            const q = query(collection(window.firebase.firestore, 'calendar_content'), where('date', '>=', this.formatDate(today)), where('date', '<=', this.formatDate(futureDate)), where('status', '==', 'active'), orderBy('date', 'asc'));
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
            container.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-day"></i><p>No hay contenido programado para los próximos días</p></div>`;
            return;
        }
        container.innerHTML = content.map(item => {
            const date = new Date(item.date);
            const formattedDate = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
            return `<div class="content-preview-item" onclick="app.openDayModal('${item.date}')"><div class="preview-date">${formattedDate}</div><div class="preview-title">${item.title || 'Sin título'}</div><div class="preview-arrow"><i class="fas fa-chevron-right"></i></div></div>`;
        }).join('');
    }

    // ===== UTILITY FUNCTIONS =====
    // MEJORADO: Feedback visual al copiar ID
    copyUserId() {
        if (!this.currentUserData?.userId) {
            this.showNotification('ID no disponible', 'error');
            return;
        }
        navigator.clipboard.writeText(this.currentUserData.userId)
            .then(() => {
                this.showNotification('¡ID copiado al portapapeles!', 'success');
                // Feedback visual en el botón del dashboard
                const copyBtn = document.getElementById('copyUserIdBtn');
                const copyBtnText = document.getElementById('copyBtnText');
                if (copyBtn && copyBtnText) {
                    const originalText = copyBtnText.textContent;
                    copyBtnText.textContent = '¡Copiado!';
                    copyBtn.style.background = 'var(--color-green)';
                    setTimeout(() => {
                        copyBtnText.textContent = originalText;
                        copyBtn.style.background = '';
                    }, 2000);
                }
                // Feedback visual en el badge del header
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

    showNotification(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `notification-toast notification-${type}`;
        let icon = 'fas fa-info-circle';
        if (type === 'success') icon = 'fas fa-check-circle';
        if (type === 'error') icon = 'fas fa-exclamation-circle';
        if (type === 'warning') icon = 'fas fa-exclamation-triangle';
        toast.innerHTML = `
            <div class="notification-content">
                <i class="${icon}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    refreshActivity() {
        this.showNotification('Actividad actualizada', 'success');
        const activityList = document.getElementById('recentActivityList');
        if (activityList) {
            const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            activityList.innerHTML = `
                <div class="activity-item"><div class="activity-icon"><i class="fas fa-sync-alt"></i></div><div class="activity-content"><div class="activity-title">Actividad actualizada</div><div class="activity-time">${time}</div></div></div>
                <div class="activity-item"><div class="activity-icon"><i class="fas fa-calendar-alt"></i></div><div class="activity-content"><div class="activity-title">Calendario cargado</div><div class="activity-time">${time}</div></div></div>
            `;
        }
    }

    async refreshApp() {
        const confirmed = await this.showConfirm('<i class="fas fa-sync"></i> Recargar aplicación', '¿Recargar la aplicación? Se perderán los cambios no guardados.', 'Recargar', false);
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
                this.loadNews()
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
        if (newUsername === this.currentUserData?.username) { this.showNotification('Es el mismo nombre que ya tienes', 'error'); return; }

        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...'; btn.disabled = true; }

        // NUEVO: Verificar si el username ya existe antes de cambiar
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
            this.showNotification('Nombre de usuario actualizado correctamente', 'success');
            this.closeChangeUsernameModal();
        } catch (error) {
            console.error('Error al cambiar username:', error);
            this.showNotification('Error al actualizar el nombre de usuario', 'error');
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    openChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (!modal) return;
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
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
        document.getElementById('newEmail').value = '';
        document.getElementById('emailPassword').value = '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeChangeEmailModal() {
        const modal = document.getElementById('changeEmailModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        document.getElementById('newEmail').value = '';
        document.getElementById('emailPassword').value = '';
    }

    async saveNewEmail() {
        const newEmail = document.getElementById('newEmail')?.value.trim();
        const password = document.getElementById('emailPassword')?.value;
        const btn = document.querySelector('#changeEmailModal .btn-primary');
        if (!newEmail || !password) { this.showNotification('Por favor completa todos los campos', 'error'); return; }
        if (!this.isValidEmail(newEmail)) { this.showNotification('El correo electrónico no es válido', 'error'); return; }
        if (newEmail === this.currentUserData?.email) { this.showNotification('Es el mismo correo que ya tienes', 'error'); return; }
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
            this.showNotification('Correo electrónico actualizado correctamente', 'success');
            this.closeChangeEmailModal();
        } catch (error) {
            console.error('Error al cambiar email:', error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') this.showNotification('La contraseña es incorrecta', 'error');
            else if (error.code === 'auth/email-already-in-use') this.showNotification('Ese correo ya está en uso por otra cuenta', 'error');
            else if (error.code === 'auth/invalid-email') this.showNotification('El correo electrónico no es válido', 'error');
            else this.showNotification('Error al cambiar el correo electrónico', 'error');
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    openDeleteAccountModal() {
        const modal = document.getElementById('deleteAccountModal');
        if (!modal) return;
        document.getElementById('deleteAccountPassword').value = '';
        document.getElementById('deleteConfirmText').value = '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeDeleteAccountModal() {
        const modal = document.getElementById('deleteAccountModal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        document.getElementById('deleteAccountPassword').value = '';
        document.getElementById('deleteConfirmText').value = '';
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
            this.showNotification('Imagen de perfil actualizada correctamente', 'success');
            const display = document.getElementById('selectedFileName');
            if (display) display.textContent = '';
            fileInput.value = '';
        } catch (error) {
            console.error('Error al subir imagen:', error);
            this.showNotification('Error al subir la imagen', 'error');
        } finally {
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        }
    }

    async removeAvatar() {
        const confirmed = await this.showConfirm('<i class="fas fa-trash"></i> Eliminar avatar', '¿Seguro que quieres eliminar tu avatar? Volverá a mostrar tu inicial.', 'Eliminar');
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
        this.showNotification('Preparando exportación de datos...', 'info');
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
            const exportData = { exportDate: new Date().toISOString(), appVersion: 'v1.3.0', profile: userData, comments, notifications, totalComments: comments.length, totalNotifications: notifications.length };
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

    checkForUpdates() {
        this.showNotification('Ya tienes la versión más reciente (v1.3.0)', 'success');
    }

    // ===== MODAL DE CONFIRMACIÓN =====
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
                if (titleEl) { const icon = type === 'privacy' ? 'fa-shield-alt' : 'fa-file-contract'; titleEl.innerHTML = `<i class="fas ${icon}"></i> ${data.title || ''}`; }
                const hasHtml = /<[a-z][\s\S]*>/i.test(data.content || '');
                if (bodyEl) bodyEl.innerHTML = `<div class="policy-content" style="color:var(--text-color);line-height:1.7;font-size:.9rem">${hasHtml ? data.content : (data.content || '').replace(/\n/g, '<br>')}</div>`;
            } else {
                if (bodyEl) bodyEl.innerHTML = `<div class="empty-state" style="padding:40px"><i class="fas fa-file-alt"></i><h4>Contenido no disponible</h4></div>`;
            }
        } catch (error) {
            if (bodyEl) bodyEl.innerHTML = `<div class="empty-state" style="padding:40px"><i class="fas fa-exclamation-triangle"></i><h4>Error al cargar</h4></div>`;
        }
    }

    showPrivacyPolicy() { this._loadLegalModal('privacy', 'privacyModal'); }
    showTerms() { this._loadLegalModal('terms', 'termsModal'); }
}

// ===== INICIALIZAR APLICACIÓN =====
function initApp() {
    if (!window.app) window.app = new App();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
