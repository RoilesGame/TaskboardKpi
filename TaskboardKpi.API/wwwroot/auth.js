const API_BASE = window.API_BASE_URL || '';
function api(path, options = {}) {
    return fetch(API_BASE + path, options);
}

function showToast(message, type = 'error') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
        background: ${type === 'error' ? '#fef2f2' : '#f0fdf4'};
        border-left: 4px solid ${type === 'error' ? '#ef4444' : '#22c55e'};
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 12px 20px;
        font-size: 14px;
        color: #1e293b;
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-width: 260px;
    `;
    toast.innerHTML = `<span>${message}</span><button style="background:none;border:none;color:#6b7280;cursor:pointer;font-size:16px;margin-left:12px;line-height:1;">✕</button>`;
    toast.querySelector('button').onclick = () => toast.remove();
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// Логин
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        const res = await api('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('token', data.token);
            window.location.href = '/index.html';
        } else {
            const err = await res.text();
            showToast(err || 'Ошибка входа');
        }
    });
}

// Регистрация
const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('fullname').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const projectName = document.getElementById('project')?.value.trim() || undefined;
        const teamName = document.getElementById('team')?.value.trim() || undefined;

        const res = await api('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, password, projectName, teamName })
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('token', data.token);
            window.location.href = '/index.html';
        } else {
            const err = await res.text();
            showToast(err || 'Ошибка регистрации');
        }
    });
}