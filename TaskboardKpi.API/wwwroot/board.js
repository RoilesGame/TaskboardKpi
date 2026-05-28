const API_BASE = window.API_BASE_URL || '';
function api(path, options = {}) {
    return fetch(API_BASE + path, options).then(resp => {
        if (resp.status === 401){
            local.removeItem('token');
            window.location.href = '/login.html';
            throw new Error('Unauthorized');
        }
        return resp;
    });
}

const statuses = ['backlog', 'in_progress', 'review', 'done'];
let currentToken = null;
let currentUserId = null;

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

    // Проверяем срок действия токена
    const payload = parseJwt(token);
    if (payload && payload.exp) {
        const expiry = payload.exp * 1000; // в миллисекунды
        if (Date.now() > expiry) {
            // Токен истёк
            localStorage.removeItem('token');
            window.location.href = '/login.html';
            return null;
        }
    }
    return token;
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

// ================== Профиль ==================
async function loadProfile() {
    try {
        const resp = await api('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!resp.ok) throw new Error('Ошибка профиля');
        const profile = await resp.json();
        document.getElementById('user-name').textContent = profile.fullName;
        document.getElementById('user-avatar').textContent = profile.fullName.charAt(0).toUpperCase();
    } catch (e) {
        console.error('Не удалось загрузить профиль', e);
    }
}

// ================== Команды ==================
async function loadTeams() {
    const list = document.getElementById('teams-list');
    if (!list) return;
    try {
        const resp = await api('/api/teams/my', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!resp.ok) throw new Error('Не удалось загрузить команды');
        const teams = await resp.json();

        const tokenData = parseJwt(currentToken);
        const currentTeamId = tokenData?.teamId;

        list.innerHTML = '';
        teams.forEach(team => {
            const li = document.createElement('li');
            li.className = 'team-item';
            if (team.id === currentTeamId) li.classList.add('active');

            li.innerHTML = `
                <div style="display: flex; flex-direction: column; width: 100%;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span>${escapeHtml(team.name)}</span>
                        <span class="team-badge ${team.isOwner ? 'owner' : 'member'}">
                            ${team.isOwner ? 'Админ' : 'Участник'}
                        </span>
                    </div>
                    ${team.isOwner ? '' : `<span class="team-owner" style="font-size:12px;color:#6b7280;">Владелец: ${escapeHtml(team.ownerName)}</span>`}
                </div>
            `;

            li.addEventListener('click', async () => {
                if (team.id === currentTeamId) return;
                await switchTeam(team.id);
            });
            list.appendChild(li);
        });
    } catch (err) {
        console.error('Ошибка загрузки команд', err);
    }
}


function initCopyTeamIdButton() {
    const btn = document.getElementById('copy-team-id-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        // Получаем teamId из текущего токена
        const tokenData = parseJwt(currentToken);
        const teamId = tokenData?.teamId;
        if (!teamId) {
            showToast('Не удалось получить ID команды');
            return;
        }
        navigator.clipboard.writeText(teamId).then(() => {
            showToast('ID команды скопирован', 'success');
        }).catch(() => {
            prompt('ID команды:', teamId);
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function switchTeam(teamId) {
    try {
        const resp = await api('/api/auth/switch-team', {
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
        currentUserId = getUserIdFromToken(currentToken);

        await loadProfile();
        await loadTeams();
        await loadMembers();
        await loadBoard();
    } catch (err) {
        console.error(err);
        showToast('Ошибка при переключении команды');
    }
}

// ================== Участники ==================
async function loadMembers() {
    const list = document.getElementById('members-list');
    if (!list) return;
    try {
        const resp = await api('/api/teams/members', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!resp.ok) throw new Error('Ошибка загрузки участников');
        const members = await resp.json();
        list.innerHTML = '';
        members.forEach(m => {
            const li = document.createElement('li');
            li.className = 'member-item';
            const avatar = document.createElement('div');
            avatar.className = 'member-avatar';
            avatar.textContent = m.fullName.charAt(0).toUpperCase();
            const nameSpan = document.createElement('span');
            nameSpan.className = 'member-name';
            nameSpan.textContent = m.fullName + (m.isOwner ? ' (владелец)' : '');
            li.appendChild(avatar);
            li.appendChild(nameSpan);
            list.appendChild(li);
        });
    } catch (err) {
        console.error(err);
    }
}

// ================== Доска ==================
async function loadBoard() {
    try {
        const response = await api('/api/tasks/board', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!response.ok) throw new Error('Не авторизован');
        const board = await response.json();
        renderColumn('backlog', board.backlog || []);
        renderColumn('in_progress', board.inProgress || []);
        renderColumn('review', board.review || []);
        renderColumn('done', board.done || []);
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

        const topRow = document.createElement('div');
        topRow.className = 'task-top-row';

        const dot = document.createElement('span');
        dot.className = 'priority-dot ' + (task.priority || 'medium');
        topRow.appendChild(dot);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'task-title';
        titleSpan.textContent = task.title;
        topRow.appendChild(titleSpan);
        card.appendChild(topRow);

        if (task.dueDate) {
            const dateRow = document.createElement('div');
            dateRow.className = 'task-date-row';
            const date = new Date(task.dueDate);
            dateRow.textContent = 'Срок: ' + date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            card.appendChild(dateRow);
        }

        if (task.assigneeName) {
            const assigneeRow = document.createElement('div');
            assigneeRow.className = 'task-assignee-row';

            const avatar = document.createElement('span');
            avatar.className = 'task-assignee-avatar';
            avatar.textContent = task.assigneeName.charAt(0).toUpperCase();
            assigneeRow.appendChild(avatar);

            const nameSpan = document.createElement('span');
            nameSpan.textContent = task.assigneeName;
            assigneeRow.appendChild(nameSpan);

            card.appendChild(assigneeRow);
        }

        container.appendChild(card);

        card.addEventListener('click', () => {
            openTaskDetail(task.id);
        });
    });

    if (countSpan) countSpan.textContent = arr.length;
}

// ================== Drag-and-drop ==================
function initSortable() {
    statuses.forEach(status => {
        const el = document.getElementById(status);
        if (!el) return;
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
                    await api(`/api/tasks/move/${taskId}`, {
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

// ================== Создание задачи ==================
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
        const dueDate = document.getElementById('task-due-date').value;

        if (!title) return;

        const res = await api('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ title, description, priority, dueDate: dueDate || null })
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

// ================== Детали задачи ==================
let currentDetailTaskId = null;

async function openTaskDetail(taskId) {
    currentDetailTaskId = taskId;
    const overlay = document.getElementById('task-detail-overlay');
    if (!overlay) return;

    try {
        const [taskResp, membersResp] = await Promise.all([
            api(`/api/tasks/${taskId}`, { headers: { 'Authorization': `Bearer ${currentToken}` } }),
            api('/api/teams/members', { headers: { 'Authorization': `Bearer ${currentToken}` } })
        ]);
        if (!taskResp.ok || !membersResp.ok) throw new Error('Ошибка загрузки');
        const task = await taskResp.json();
        const members = await membersResp.json();

        document.getElementById('detail-task-title').value = task.title || '';
        document.getElementById('detail-task-desc').value = task.description || '';
        document.getElementById('detail-task-priority').value = task.priority || 'medium';
        document.getElementById('detail-task-status').value = task.status || 'backlog';
        document.getElementById('detail-task-due-date').value = task.dueDate || '';

        // Исполнитель
        document.getElementById('current-assignee-name').textContent = task.assigneeName || 'Не назначен';
        const selfAssignBtn = document.getElementById('self-assign-btn');
        const unassignBtn = document.getElementById('unassign-btn');
        const assignOthersDiv = document.getElementById('assign-others');
        const assigneeSelect = document.getElementById('assignee-select');
        const canEdit = task.canEdit;
        const isSelf = (task.assigneeId === currentUserId);

        selfAssignBtn.classList.toggle('hidden', isSelf);
        unassignBtn.classList.toggle('hidden', !isSelf);

        assigneeSelect.innerHTML = '';
        members.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.fullName;
            assigneeSelect.appendChild(opt);
        });
        if (task.assigneeId) assigneeSelect.value = task.assigneeId;

        assignOthersDiv.style.display = canEdit ? 'block' : 'none';

        document.getElementById('detail-save-btn').disabled = !canEdit;
        overlay.classList.remove('hidden');
    } catch (err) {
        console.error(err);
        showToast('Не удалось загрузить задачу');
    }
}

function closeDetailAndReload() {
    document.getElementById('task-detail-overlay').classList.add('hidden');
    currentDetailTaskId = null;
    loadBoard();
}

function initTaskDetailModal() {
    const overlay = document.getElementById('task-detail-overlay');
    const closeBtn = document.getElementById('close-detail-modal');
    const form = document.getElementById('task-detail-form');

    if (!overlay || !closeBtn || !form) return;

    closeBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
        currentDetailTaskId = null;
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.add('hidden');
            currentDetailTaskId = null;
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentDetailTaskId) return;
        const title = document.getElementById('detail-task-title').value.trim();
        const description = document.getElementById('detail-task-desc').value.trim();
        const priority = document.getElementById('detail-task-priority').value;
        const status = document.getElementById('detail-task-status').value;
        const dueDate = document.getElementById('detail-task-due-date').value;

        const res = await api(`/api/tasks/${currentDetailTaskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ title, description, priority, status, dueDate: dueDate || null })
        });

        if (res.ok) {
            overlay.classList.add('hidden');
            currentDetailTaskId = null;
            showToast('Задача обновлена', 'success');
            loadBoard();
        } else {
            const err = await res.text();
            showToast(err || 'Ошибка сохранения');
        }
    });

    // Кнопки назначения
    document.getElementById('self-assign-btn').addEventListener('click', async () => {
        if (!currentDetailTaskId) return;
        const res = await api(`/api/tasks/${currentDetailTaskId}/self-assign`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) { showToast('Задача взята на себя', 'success'); closeDetailAndReload(); }
        else { const err = await res.text(); showToast(err || 'Ошибка'); }
    });

    document.getElementById('unassign-btn').addEventListener('click', async () => {
        if (!currentDetailTaskId) return;
        const res = await api(`/api/tasks/${currentDetailTaskId}/self-assign`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) { showToast('Назначение снято', 'success'); closeDetailAndReload(); }
        else { const err = await res.text(); showToast(err || 'Ошибка'); }
    });

    document.getElementById('assign-btn').addEventListener('click', async () => {
        if (!currentDetailTaskId) return;
        const newAssigneeId = document.getElementById('assignee-select').value;
        const res = await api(`/api/tasks/${currentDetailTaskId}/assign`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ assigneeId: newAssigneeId })
        });
        if (res.ok) { showToast('Исполнитель назначен', 'success'); closeDetailAndReload(); }
        else { const err = await res.text(); showToast(err || 'Ошибка'); }
    });
}

// ================== Создание команды ==================
function initCreateTeamModal() {
    const modal = document.getElementById('team-modal-overlay');
    const openBtn = document.getElementById('create-team-btn');
    const closeBtn = document.getElementById('close-team-modal');
    const form = document.getElementById('create-team-form');
    if (!modal || !openBtn || !closeBtn || !form) return;

    openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('team-name').value.trim();
        const allowEdit = document.getElementById('allow-edit').checked;
        const allowInvites = document.getElementById('allow-invites').checked;
        if (!name) return;

        const res = await api('/api/teams', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ name, allowMemberEditing: allowEdit, allowMemberInvites: allowInvites })
        });

        if (res.ok) {
            modal.classList.add('hidden');
            form.reset();
            showToast('Команда создана', 'success');
            const newTeam = await res.json();
            if (newTeam.id) await switchTeam(newTeam.id);
        } else {
            const err = await res.text();
            showToast(err || 'Ошибка создания команды');
        }
    });
}

// ================== Присоединение к команде ==================
function initJoinTeamModal() {
    const modal = document.getElementById('join-modal-overlay');
    const openBtn = document.getElementById('join-team-btn');
    const closeBtn = document.getElementById('close-join-modal');
    const form = document.getElementById('join-team-form');

    if (!modal || !openBtn || !closeBtn || !form) return;

    openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const teamId = document.getElementById('join-team-id-input').value.trim();
        if (!teamId) return;

        const res = await api(`/api/teams/${teamId}/join`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            modal.classList.add('hidden');
            form.reset();
            showToast('Вы присоединились к команде', 'success');
            await loadTeams();
            await loadMembers();
            await loadBoard();
        } else {
            const err = await res.text();
            showToast(err || 'Ошибка');
        }
    });
}

function initLeaveTeam() {
    const openBtn = document.getElementById('leave-team-btn');
    const overlay = document.getElementById('confirm-leave-overlay');
    const confirmBtn = document.getElementById('confirm-leave-btn');
    const cancelBtn = document.getElementById('cancel-leave-btn');

    if (!openBtn || !overlay || !confirmBtn || !cancelBtn) return;

    openBtn.addEventListener('click', () => {
        overlay.classList.remove('hidden');
    });

    cancelBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
    });

    confirmBtn.addEventListener('click', async () => {
        const res = await api('/api/teams/leave', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (res.ok) {
            overlay.classList.add('hidden');
            showToast('Вы покинули команду', 'success');
            // Переключиться на другую команду или перезагрузить список команд
            const teamsResp = await api('/api/teams/my', {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            if (teamsResp.ok) {
                const teams = await teamsResp.json();
                if (teams.length > 0) {
                    await switchTeam(teams[0].id);
                } else {
                    // Если команд не осталось, перенаправим на создание команды или покажем ошибку
                    showToast('У вас не осталось команд. Создайте новую.', 'error');
                    // можно перенаправить на создание или обновить интерфейс
                    loadTeams();
                }
            }
        } else {
            const err = await res.text();
            showToast(err || 'Ошибка при выходе из команды');
            overlay.classList.add('hidden');
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

// Вспомогательная функция для загрузки скрипта динамически
function loadScript(url) {
    return new Promise((resolve, reject) => {
        if (window.FullCalendar) return resolve();
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function initCalendar() {
    const modal = document.getElementById('calendar-modal-overlay');
    const openBtn = document.getElementById('calendar-btn');
    const closeBtn = document.getElementById('close-calendar-modal');
    if (!modal || !openBtn || !closeBtn) return;

    openBtn.addEventListener('click', async () => {
        modal.classList.remove('hidden');
        const container = document.getElementById('calendar-container');
        container.innerHTML = '<p style="text-align:center;padding:40px;">Загрузка...</p>';

        try {
            const resp = await api('/api/tasks/my', {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            const tasks = resp.ok ? await resp.json() : [];

            // Собираем задачи по датам
            const tasksByDate = {};
            tasks.forEach(t => {
                const date = t.dueDate?.split('T')[0];
                if (!date) return;
                if (!tasksByDate[date]) tasksByDate[date] = [];
                tasksByDate[date].push(t);
            });

            const now = new Date();
            let currentMonth = now.getMonth();
            let currentYear = now.getFullYear();

            function renderMonth() {
                const firstDay = new Date(currentYear, currentMonth, 1).getDay();
                const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

                const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
                const dayHeaders = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

                let html = `<div class="calendar-controls">
                    <button id="cal-prev">◀</button>
                    <span>${monthNames[currentMonth]} ${currentYear}</span>
                    <button id="cal-next">▶</button>
                </div>`;
                html += '<div class="calendar-grid">';
                dayHeaders.forEach(d => html += `<div class="calendar-day-header">${d}</div>`);

                // Пустые ячейки до первого дня
                for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
                    html += '<div class="calendar-cell"></div>';
                }

                for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayTasks = tasksByDate[dateStr] || [];
                    let tasksHtml = '';
                    dayTasks.forEach(t => {
                        const colors = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' };
                        const color = colors[t.priority] || '#6366f1';
                        tasksHtml += `<span class="task-dot" style="border-left:3px solid ${color};" data-id="${t.id}">${t.title}</span>`;
                    });
                    html += `<div class="calendar-cell"><div class="day-num">${day}</div>${tasksHtml}</div>`;
                }
                html += '</div>';
                container.innerHTML = html;

                // Обработчики переключения месяцев
                document.getElementById('cal-prev').addEventListener('click', () => {
                    currentMonth--;
                    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
                    renderMonth();
                });
                document.getElementById('cal-next').addEventListener('click', () => {
                    currentMonth++;
                    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
                    renderMonth();
                });

                // Клик по задаче
                container.querySelectorAll('.task-dot').forEach(dot => {
                    dot.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const taskId = dot.dataset.id;
                        openTaskDetail(taskId);
                        modal.classList.add('hidden');
                    });
                });
            }

            renderMonth();
        } catch (err) {
            console.error(err);
            container.innerHTML = '<p style="text-align:center;color:red;padding:40px;">Ошибка загрузки календаря</p>';
        }
    });

    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}

function initGantt() {
    const modal = document.getElementById('gantt-modal-overlay');
    const openBtn = document.getElementById('gantt-btn');
    const closeBtn = document.getElementById('close-gantt-modal');
    if (!modal || !openBtn || !closeBtn) return;

    openBtn.addEventListener('click', async () => {
        modal.classList.remove('hidden');
        const container = document.getElementById('gantt-container');
        container.innerHTML = '<p style="text-align:center;padding:40px;">Загрузка...</p>';

        try {
            const resp = await api('/api/tasks/gantt', {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            const tasks = resp.ok ? await resp.json() : [];

            const filtered = tasks.filter(t => t.dueDate);
            if (filtered.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:40px;">Нет задач с дедлайнами в этой команде.</p>';
                return;
            }

            // Определяем диапазон дат
            const dates = filtered.map(t => new Date(t.dueDate));
            const minDate = new Date(Math.min(...dates));
            minDate.setDate(minDate.getDate() - 7); // отступ слева
            const maxDate = new Date(Math.max(...dates));
            maxDate.setDate(maxDate.getDate() + 1);
            const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));

            const colors = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' };

            let html = '<div class="gantt-chart">';
            filtered.forEach(t => {
                const due = new Date(t.dueDate);
                const start = new Date(due);
                start.setDate(start.getDate() - 5);
                if (start < minDate) start.setTime(minDate.getTime());

                const leftPercent = ((start - minDate) / (1000 * 60 * 60 * 24)) / totalDays * 100;
                const widthPercent = ((due - start) / (1000 * 60 * 60 * 24)) / totalDays * 100;
                const color = colors[t.priority] || '#6366f1';

                html += `<div class="gantt-row">
                    <div class="gantt-task-name">${t.title}</div>
                    <div class="gantt-bar-container">
                        <div class="gantt-bar" style="left:${leftPercent}%; width:${widthPercent}%; background:${color};" data-id="${t.id}">
                            <span class="gantt-bar-label">${t.assigneeName || ''}</span>
                        </div>
                    </div>
                </div>`;
            });
            html += '</div>';
            container.innerHTML = html;

            // Клик по полосе
            container.querySelectorAll('.gantt-bar').forEach(bar => {
                bar.addEventListener('click', () => {
                    const taskId = bar.dataset.id;
                    openTaskDetail(taskId);
                    modal.classList.add('hidden');
                });
            });

        } catch (err) {
            console.error(err);
            container.innerHTML = '<p style="text-align:center;color:red;padding:40px;">Ошибка загрузки диаграммы</p>';
        }
    });

    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}

// ================== Старт ==================
currentToken = checkAuth();
if (currentToken) {
    currentUserId = getUserIdFromToken(currentToken);
    loadProfile().then(() => loadTeams()).then(() => loadMembers()).then(() => {
        initLogout();
        initSortable();
        initCreateTaskModal();
        initTaskDetailModal();
        initCreateTeamModal();
        initJoinTeamModal();
        initLeaveTeam();
        initCopyTeamIdButton();
        initCalendar();
        initGantt();
        return loadBoard();
    }).catch(err => console.error(err));
}