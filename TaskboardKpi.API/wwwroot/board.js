const API_BASE = window.API_BASE_URL || '';
function api(path, options = {}) {
    return fetch(API_BASE + path, options);
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

// ================== Вкладки ==================
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panels = {
        board: document.getElementById('board-panel'),
        calendar: document.getElementById('calendar-panel'),
        gantt: document.getElementById('gantt-panel')
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            const target = tab.dataset.tab;

            // Обновляем классы активных вкладок и панелей
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            Object.values(panels).forEach(p => p?.classList.remove('active'));
            if (panels[target]) panels[target].classList.add('active');

            // При переключении на календарь или Ганта — рендерим их
            if (target === 'calendar') {
                await renderCalendar();
            } else if (target === 'gantt') {
                await renderGantt();
            } else if (target === 'events') {
                await renderEvents();
            }
        });
    });
}

function initResizer() {
    const sidebar = document.querySelector('.sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    if (!sidebar || !resizer) return;

    let startX, startWidth;

    function onMouseDown(e) {
        e.preventDefault();
        startX = e.clientX;
        startWidth = sidebar.getBoundingClientRect().width;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        resizer.classList.add('resizing');
        document.body.style.userSelect = 'none';
    }

    function onMouseMove(e) {
        const delta = e.clientX - startX;
        let newWidth = startWidth + delta;
        // Ограничиваем ширину в пределах [220, 480] (как в CSS)
        newWidth = Math.min(Math.max(newWidth, 220), 480);
        sidebar.style.width = newWidth + 'px';
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        resizer.classList.remove('resizing');
        document.body.style.userSelect = '';
    }

    resizer.addEventListener('mousedown', onMouseDown);
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
                        <span style="display: flex; align-items: center; gap: 4px;">
                            <span class="team-badge ${team.isOwner ? 'owner' : 'member'}">
                                ${team.isOwner ? 'Админ' : 'Участник'}
                            </span>
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
        
        cachedTasks = [];

        // Сбрасываем на доску при переключении команды
        document.querySelector('.tab[data-tab="board"]').click();
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

// ================== Календарь ==================
let calendarMode = 'month';
let cachedTasks = [];
const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

async function renderCalendar() {
    const container = document.getElementById('calendar-container');
    if (!container) return;

    // Загружаем задачи только один раз (при первом открытии или явном refresh)
    if (cachedTasks.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:40px;">Загрузка...</p>';
        try {
            const resp = await api('/api/tasks/my', {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            if (!resp.ok) throw new Error('Ошибка загрузки');
            cachedTasks = await resp.json();
        } catch (err) {
            console.error(err);
            container.innerHTML = '<p style="text-align:center;color:red;padding:40px;">Ошибка загрузки календаря</p>';
            return;
        }
    }

    const tasks = cachedTasks;

    // Строим режим-зависимую разметку
    if (calendarMode === 'month') {
        renderMonthView(container, tasks);
    } else {
        renderListView(container, tasks, calendarMode);
    }
}

function renderMonthView(container, tasks) {
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
        const dayHeaders = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

        let html = `
        <div class="calendar-mode-bar">
            <button class="${calendarMode === 'week' ? 'active' : ''}" data-mode="week">Неделя</button>
            <button class="${calendarMode === 'today' ? 'active' : ''}" data-mode="today">Сегодня</button>
            <button class="${calendarMode === 'month' ? 'active' : ''}" data-mode="month">Месяц</button>
        </div>
        <div class="calendar-controls">
            <button id="cal-prev">◀</button>
            <span>${monthNames[currentMonth]} ${currentYear}</span>
            <button id="cal-next">▶</button>
        </div>
        <div class="calendar-grid">`;

        dayHeaders.forEach(d => html += `<div class="calendar-day-header">${d}</div>`);

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

        // Навешиваем обработчики
        setupCalendarModeButtons(container);
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
        container.querySelectorAll('.task-dot').forEach(dot => {
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                openTaskDetail(dot.dataset.id);
            });
        });
    }

    renderMonth();
}

function renderListView(container, tasks, mode) {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Определяем диапазон
    let startDate, endDate;
    if (mode === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else { // week
        const dayOfWeek = now.getDay();
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        startDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
        endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 7);
    }

    const filtered = tasks.filter(t => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= startDate && d < endDate;
    });

    // Сортируем по дате
    filtered.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    let html = `
    <div class="calendar-mode-bar">
        <button class="${mode === 'week' ? 'active' : ''}" data-mode="week">Неделя</button>
        <button class="${mode === 'today' ? 'active' : ''}" data-mode="today">Сегодня</button>
        <button class="${mode === 'month' ? 'active' : ''}" data-mode="month">Месяц</button>
    </div>
    <div class="calendar-list">`;

    if (filtered.length === 0) {
        html += '<p style="text-align:center;color:#6b7280;padding:20px;">Нет задач на этот период</p>';
    } else {
        filtered.forEach(t => {
            const dueDate = new Date(t.dueDate);
            const dateFormatted = dueDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });
            const colors = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' };
            const color = colors[t.priority] || '#6366f1';
            html += `
            <div class="calendar-list-item" data-id="${t.id}">
                <div class="calendar-list-date">${dateFormatted}</div>
                <div class="calendar-list-content">
                    <div class="task-title" style="border-left:3px solid ${color}; padding-left:8px;">${t.title}</div>
                    <div class="task-meta">Приоритет: ${t.priority} | Статус: ${t.status}</div>
                </div>
            </div>`;
        });
    }
    html += '</div>';
    container.innerHTML = html;

    setupCalendarModeButtons(container);
    container.querySelectorAll('.calendar-list-item').forEach(item => {
        item.addEventListener('click', () => {
            openTaskDetail(item.dataset.id);
        });
    });
}

function setupCalendarModeButtons(container) {
    container.querySelectorAll('.calendar-mode-bar button').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            if (mode && mode !== calendarMode) {
                calendarMode = mode;
                renderCalendar();   // перерисовываем с тем же кэшем
            }
        });
    });
}

// ================== Диаграмма Ганта ==================
async function renderGantt() {
    const container = document.getElementById('gantt-container');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;padding:40px;">Загрузка...</p>';

    try {
        const resp = await api('/api/tasks/gantt', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const tasks = resp.ok ? await resp.json() : [];
        if (!tasks.length) {
            container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:40px;">Нет задач с дедлайнами в этой команде.</p>';
            return;
        }

        const minDate = new Date(Math.min(...tasks.map(t => new Date(t.startDate))));
        const maxDate = new Date(Math.max(...tasks.map(t => new Date(t.dueDate))));
        minDate.setDate(minDate.getDate() - 2);
        maxDate.setDate(maxDate.getDate() + 2);
        const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));

        if (typeof ganttScale === 'undefined') {
            window.ganttScale = 30; // px на день по умолчанию
        }
        if (typeof ganttDivision === 'undefined') {
            window.ganttDivision = 'weeks';
        }

        function buildGantt(division) {
            window.ganttDivision = division;
            const colors = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' };
            const scale = window.ganttScale;
            const totalWidth = totalDays * scale;
            let html = '';

            // Панель управления
            html += `
            <div class="gantt-controls">
                <span>Цена деления:</span>
                <select id="gantt-division">
                    <option value="weeks" ${division === 'weeks' ? 'selected' : ''}>Недели</option>
                    <option value="months" ${division === 'months' ? 'selected' : ''}>Месяцы</option>
                </select>
            </div>`;

            html += '<div class="gantt-chart">';

            // Левая колонка с названиями задач
            html += '<div class="gantt-left-col">';
            html += '<div class="gantt-left-header">Задача</div>';
            tasks.forEach(t => {
                html += `<div class="gantt-task-name" title="${t.title}">${t.title}</div>`;
            });
            html += '</div>';

            // Правая колонка с диаграммой
            html += '<div class="gantt-right-col">';

            // Шкала месяцев
            html += '<div class="gantt-timescale" style="width:' + totalWidth + 'px;">';
            const monthFormatter = new Intl.DateTimeFormat('ru', { month: 'short' });
            let currentMonth = null;
            for (let i = 0; i <= totalDays; i++) {
                const d = new Date(minDate);
                d.setDate(minDate.getDate() + i);
                const monthKey = d.getMonth() + '-' + d.getFullYear();
                if (monthKey !== currentMonth) {
                    currentMonth = monthKey;
                    const left = i * scale;
                    html += `<span class="gantt-month-marker" style="left:${left + 4}px">${monthFormatter.format(d)}</span>`;
                }
            }
            html += '</div>';

            // Сетка и полосы
            html += '<div class="gantt-grid-container" style="width:' + totalWidth + 'px; height:' + (tasks.length * 48) + 'px;">';

            // Вертикальные линии сетки
            let currentMonthLine = null;
            for (let i = 0; i <= totalDays; i++) {
                const d = new Date(minDate);
                d.setDate(minDate.getDate() + i);
                const monthKey = d.getMonth() + '-' + d.getFullYear();
                if (monthKey !== currentMonthLine) {
                    currentMonthLine = monthKey;
                    const left = i * scale;
                    html += `<div class="gantt-grid-line month" style="left:${left}px"></div>`;
                }
            }

            if (division === 'weeks') {
                let prevMonthLine = null;
                let daysSinceLastMonthLine = 0;
                for (let i = 0; i <= totalDays; i++) {
                    const d = new Date(minDate);
                    d.setDate(minDate.getDate() + i);
                    const monthKey = d.getMonth() + '-' + d.getFullYear();
                    if (prevMonthLine === null) {
                        prevMonthLine = monthKey;
                    }
                    if (monthKey !== prevMonthLine) {
                        const daysInPrevMonth = daysSinceLastMonthLine;
                        for (let w = 1; w <= 3; w++) {
                            const weekDay = i - daysSinceLastMonthLine + Math.round((daysInPrevMonth / 4) * w);
                            const left = weekDay * scale;
                            html += `<div class="gantt-grid-line week" style="left:${left}px"></div>`;
                        }
                        prevMonthLine = monthKey;
                        daysSinceLastMonthLine = 0;
                    }
                    daysSinceLastMonthLine++;
                }
                if (daysSinceLastMonthLine > 0) {
                    const lastMonthStart = totalDays - daysSinceLastMonthLine;
                    for (let w = 1; w <= 3; w++) {
                        const weekDay = lastMonthStart + Math.round((daysSinceLastMonthLine / 4) * w);
                        const left = weekDay * scale;
                        html += `<div class="gantt-grid-line week" style="left:${left}px"></div>`;
                    }
                }
            }

            // Линия "Сегодня"
            const today = new Date();
            if (today >= minDate && today <= maxDate) {
                const todayLeft = ((today - minDate) / (1000 * 60 * 60 * 24)) * scale;
                html += `<div class="gantt-today-line" style="left:${todayLeft}px"></div>`;
            }

            // Строки с полосами
            tasks.forEach((t, index) => {
                const start = new Date(t.startDate);
                const end = new Date(t.dueDate);
                const left = ((start - minDate) / (1000 * 60 * 60 * 24)) * scale;
                const width = ((end - start) / (1000 * 60 * 60 * 24)) * scale;
                const color = colors[t.priority] || '#6366f1';

                html += `
                <div class="gantt-row">
                    <div class="gantt-bar" style="left:${left}px; width:${width}px; background:${color};" data-id="${t.id}">
                    </div>
                </div>`;
            });

            html += '</div>'; // конец grid-container
            html += '</div>'; // конец right-col
            html += '</div>'; // конец gantt-chart

            container.innerHTML = html;

            // Обработчик переключения деления
            const selectEl = document.getElementById('gantt-division');
            if (selectEl) {
                selectEl.addEventListener('change', function() {
                    buildGantt(this.value);
                });
            }

            // Клик по задаче
            container.querySelectorAll('.gantt-bar').forEach(bar => {
                bar.addEventListener('click', () => {
                    openTaskDetail(bar.dataset.id);
                });
            });

            // Масштабирование колесом мыши
            const rightCol = container.querySelector('.gantt-right-col');
            if (rightCol && !rightCol._wheelBound) {
                rightCol._wheelBound = true;
                rightCol.addEventListener('wheel', function(e) {
                    e.preventDefault();
                    if (e.deltaY < 0) {
                        window.ganttScale = Math.min(200, window.ganttScale + 5);
                    } else {
                        window.ganttScale = Math.max(10, window.ganttScale - 5);
                    }
                    buildGantt(window.ganttDivision);
                });
            }
        }

        buildGantt(window.ganttDivision || 'weeks');

    } catch (err) {
        console.error(err);
        container.innerHTML = '<p style="text-align:center;color:red;padding:40px;">Ошибка загрузки диаграммы</p>';
    }
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
        const startDate = document.getElementById('task-start-date').value;

        if (startDate && dueDate && dueDate < startDate) {
            showToast('Дата окончания не может быть раньше даты начала');
            return;
        }

        if (!title) return;

        const res = await api('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ title, description, priority, dueDate: dueDate || null, startDate: startDate || null })
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
        document.getElementById('detail-task-start-date').value = task.startDate || '';

        document.getElementById('current-assignee-name').textContent = task.assigneeName || 'Не назначен';
        const selfAssignBtn = document.getElementById('self-assign-btn');
        const unassignBtn = document.getElementById('unassign-btn');
        const assignOthersDiv = document.getElementById('assign-others');
        const assigneeSelect = document.getElementById('assignee-select');
        const startDate = document.getElementById('detail-task-start-date').value;
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
    const startDate = document.getElementById('detail-task-start-date').value;

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
        const startDate = document.getElementById('detail-task-start-date').value;

        if (startDate && dueDate && dueDate < startDate) {
            showToast('Дата окончания не может быть раньше даты начала');
            return;
        }

        const res = await api(`/api/tasks/${currentDetailTaskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ title, description, priority, status, dueDate: dueDate || null, startDate: startDate || null })
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

// ================== Копирование ID команды ==================
function initCopyTeamIdButton() {
    const btn = document.getElementById('copy-team-id-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
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

// ================== Выход из команды ==================
function initLeaveTeam() {
    const openBtn = document.getElementById('leave-team-btn');
    const overlay = document.getElementById('confirm-leave-overlay');
    const confirmBtn = document.getElementById('confirm-leave-btn');
    const cancelBtn = document.getElementById('cancel-leave-btn');

    if (!openBtn || !overlay || !confirmBtn || !cancelBtn) return;

    openBtn.addEventListener('click', () => overlay.classList.remove('hidden'));
    cancelBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });

    confirmBtn.addEventListener('click', async () => {
        const res = await api('/api/teams/leave', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            overlay.classList.add('hidden');
            showToast('Вы покинули команду', 'success');
            const teamsResp = await api('/api/teams/my', { headers: { 'Authorization': `Bearer ${currentToken}` } });
            if (teamsResp.ok) {
                const teams = await teamsResp.json();
                if (teams.length > 0) await switchTeam(teams[0].id);
                else {
                    showToast('У вас не осталось команд. Создайте новую.', 'error');
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

async function renderEvents() {
    const container = document.getElementById('events-container');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;padding:40px;">Загрузка...</p>';

    try {
        const resp = await api('/api/tasks/events?limit=50', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const events = resp.ok ? await resp.json() : [];
        if (!events.length) {
            container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:40px;">Нет событий</p>';
            return;
        }

        const icons = {
            created: '➕',
            updated: '✏️',
            moved: '↔️',
            assigned: '👤',
            self_assigned: '🙋',
            unassigned: '❌',
            self_unassigned: '🙅'
        };

        let html = '<div class="events-list">';
        events.forEach(ev => {
            const icon = icons[ev.eventType] || '📌';
            const time = new Date(ev.createdAt).toLocaleString('ru-RU');
            html += `
            <div class="event-item">
                <div class="event-icon">${icon}</div>
                <div class="event-content">
                    <div>
                        <span class="event-task-link" data-task-id="${ev.taskId}">${escapeHtml(ev.taskTitle)}</span>
                        &mdash; ${escapeHtml(ev.description || ev.eventType)}
                    </div>
                    <div class="event-meta">
                        <span>${ev.userName || 'Система'}</span>
                        <span>${time}</span>
                    </div>
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;

        // Клик по названию задачи открывает её
        container.querySelectorAll('.event-task-link').forEach(link => {
            link.addEventListener('click', () => {
                openTaskDetail(link.dataset.taskId);
            });
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = '<p style="text-align:center;color:red;padding:40px;">Ошибка загрузки событий</p>';
    }
}

// ================== Выход из профиля ==================
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
    currentUserId = getUserIdFromToken(currentToken);
    loadProfile().then(() => loadTeams()).then(() => loadMembers()).then(() => {
        initTabs();
        initResizer();
        initLogout();
        initSortable();
        initCreateTaskModal();
        initTaskDetailModal();
        initCreateTeamModal();
        initJoinTeamModal();
        initCopyTeamIdButton();
        initLeaveTeam();
        return loadBoard();
    }).catch(err => console.error(err));
}