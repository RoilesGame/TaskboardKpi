const statuses = ['backlog', 'in_progress', 'review', 'done'];
let currentToken = null;  // будет хранить токен

// ================== Утилиты ==================
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

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return null;
    }
    return token;
}

// ================== Профиль ==================
async function loadProfile() {
    try {
        const resp = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!resp.ok) throw new Error('Ошибка профиля');
        const profile = await resp.json();
        document.getElementById('user-name').textContent = profile.fullName;
        const avatar = document.getElementById('user-avatar');
        avatar.textContent = profile.fullName.charAt(0).toUpperCase();
    } catch (e) {
        console.error('Не удалось загрузить профиль', e);
    }
}

// ================== Список команд ==================
async function loadTeams() {
    const list = document.getElementById('teams-list');
    if (!list) return;

    try {
        const resp = await fetch('/api/teams/my', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!resp.ok) throw new Error('Не удалось загрузить команды');
        const teams = await resp.json();

        // Определяем текущий teamId из токена
        const tokenData = parseJwt(currentToken);
        const currentTeamId = tokenData?.teamId;

        list.innerHTML = '';
        teams.forEach(team => {
            const li = document.createElement('li');
            li.className = 'team-item';
            if (team.id === currentTeamId) li.classList.add('active');

            li.innerHTML = `
                <div style="display: flex; flex-direction: column;">
                    <span>${escapeHtml(team.name)}</span>
                    ${team.isOwner ? '' : `<span class="team-owner">Владелец: ${escapeHtml(team.ownerName)}</span>`}
                </div>
                <span class="team-badge ${team.isOwner ? 'owner' : 'member'}">
                    ${team.isOwner ? 'Админ' : 'Участник'}
                </span>
            `;
            li.addEventListener('click', async () => {
                if (team.id === currentTeamId) return; // уже выбрана
                await switchTeam(team.id);
            });
            list.appendChild(li);
        });
    } catch (err) {
        console.error('Ошибка загрузки команд', err);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

async function switchTeam(teamId) {
    try {
        const resp = await fetch('/api/auth/switch-team', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ teamId })
        });
        if (!resp.ok) throw new Error('Не удалось переключить команду');
        const data = await resp.json();
        localStorage.setItem('token', data.token);
        currentToken = data.token;

        // Перезагружаем профиль, список команд и доску
        await loadProfile();
        await loadTeams();
        await loadBoard();
    } catch (err) {
        console.error(err);
        showToast('Ошибка при переключении команды');
    }
}

// ================== Доска ==================
async function loadBoard() {
    try {
        const response = await fetch('/api/tasks/board', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!response.ok) throw new Error('Не авторизован');
        const board = await response.json();
        renderColumn('backlog', board.backlog || board.Backlog || []);
        renderColumn('in_progress', board.inProgress || board.InProgress || []);
        renderColumn('review', board.review || board.Review || []);
        renderColumn('done', board.done || board.Done || []);
    } catch (err) {
        console.error('Ошибка загрузки доски:', err);
        showToast('Ошибка загрузки доски');
    }
}

function renderColumn(status, tasks) {
    const container = document.getElementById(status);
    const countSpan = document.getElementById(`${status}-count`);
    if (!container) return;
    container.innerHTML = '';
    const arr = Array.isArray(tasks) ? tasks : [];
    arr.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.id = task.id;
        card.textContent = task.title;
        container.appendChild(card);
    });
    if (countSpan) countSpan.textContent = arr.length;
}

// ================== Drag-and-drop ==================
function initSortable() {
    statuses.forEach(status => {
        const el = document.getElementById(status);
        if (!el) return;
        // Удаляем старые Sortable, если есть (чтобы не дублировались при переключении)
        if (el.sortable) el.sortable.destroy();
        el.sortable = new Sortable(el, {
            group: 'tasks',
            animation: 150,
            onEnd: async function (evt) {
                const taskId = evt.item.dataset.id;
                const col = evt.to.closest('.column');
                const newStatus = col ? col.dataset.status : null;
                const newPosition = Array.from(evt.to.children).indexOf(evt.item);
                if (newStatus && taskId) {
                    await fetch(`/api/tasks/move/${taskId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${currentToken}`
                        },
                        body: JSON.stringify({ newStatus, newPosition })
                    });
                }
            }
        });
    });
}

// ================== Модальное окно создания задачи ==================
function initCreateTaskModal() {
    const modal = document.getElementById('modal-overlay');
    const openBtn = document.getElementById('new-task-btn');
    const closeBtn = document.getElementById('close-modal');
    const form = document.getElementById('create-task-form');

    if (!modal || !openBtn || !closeBtn || !form) return;

    openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('task-title').value.trim();
        const description = document.getElementById('task-desc').value.trim();
        const priority = document.getElementById('task-priority').value;
        if (!title) return;

        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ title, description, priority })
        });

        if (res.ok) {
            modal.classList.add('hidden');
            form.reset();
            await loadBoard();
            showToast('Задача создана', 'success');
        } else {
            const err = await res.text();
            showToast(err || 'Ошибка создания задачи');
        }
    });
}

// ================== Модальное окно создания новой доски ==================
function initCreateTeamModal() {
    const modal = document.getElementById('team-modal-overlay');
    const openBtn = document.getElementById('create-team-btn');
    const closeBtn = document.getElementById('close-team-modal');
    const form = document.getElementById('create-team-form');

    if (!modal || !openBtn || !closeBtn || !form) return;

    openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('team-name').value.trim();
        const allowEdit = document.getElementById('allow-edit').checked;
        if (!name) return;

        const res = await fetch('/api/teams', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ name, allowMemberEditing: allowEdit })
        });

        if (res.ok) {
            modal.classList.add('hidden');
            form.reset();
            showToast('Команда создана', 'success');
            await loadTeams(); // обновить список команд
            // Опционально: автоматически переключиться на новую команду
            const newTeam = await res.json();
            if (newTeam.id) {
                await switchTeam(newTeam.id);
            }
        } else {
            const err = await res.text();
            showToast(err || 'Ошибка создания команды');
        }
    });
}

// ================== Выход ==================
function initLogout() {
    const btn = document.getElementById('logout-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        });
    }
}

// ================== Старт ==================
currentToken = checkAuth();
if (currentToken) {
    // Последовательная инициализация
    loadProfile().then(() => {
        return loadTeams();
    }).then(() => {
        initLogout();
        initSortable();
        initCreateTaskModal();
        initCreateTeamModal();
        return loadBoard();
    }).catch(err => console.error(err));
}