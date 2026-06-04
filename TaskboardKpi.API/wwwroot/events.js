// Лента событий
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
            self_unassigned: '🙅',
            deleted: '🗑️'
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