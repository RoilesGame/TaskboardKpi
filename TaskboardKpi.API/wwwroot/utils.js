// Общие утилиты
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

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c =>
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

function getUserIdFromToken(token) {
    const payload = parseJwt(token);
    return payload ? payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] : null;
}

function getGlobalRoleFromToken(token) {
    const payload = parseJwt(token);
    return payload?.globalRole || 'user';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}