// Профиль и выход
async function loadProfile() {
    try {
        const resp = await api('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!resp.ok) throw new Error('Ошибка профиля');
        const profile = await resp.json();
        document.getElementById('user-name').textContent = profile.fullName;
        document.getElementById('user-avatar').textContent = profile.fullName.charAt(0).toUpperCase();
        currentUserRole = profile.role || 'user';
        // Показать ссылки на админ/HR, если доступно
        const adminLink = document.getElementById('admin-link');
        const hrLink = document.getElementById('hr-link');
        if (adminLink) adminLink.style.display = (currentUserRole === 'global_admin') ? 'block' : 'none';
        if (hrLink) hrLink.style.display = (currentUserRole === 'hr_manager' || currentUserRole === 'global_admin') ? 'block' : 'none';
    } catch (e) {
        console.error('Не удалось загрузить профиль', e);
    }
}

function initLogout() {
    const btn = document.getElementById('logout-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        });
    }
}