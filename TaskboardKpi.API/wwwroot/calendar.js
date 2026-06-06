let calendarMode = 'month';      // 'month' | 'week' | 'today'
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
                renderCalendar();
            }
        });
    });
}