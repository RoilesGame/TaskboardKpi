// Канбан-доска
const statuses = ['backlog', 'in_progress', 'review', 'done'];

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

        // Наблюдатели не могут открывать задачи
        if (currentTeamRole !== 'observer') {
            card.addEventListener('click', () => {
                openTaskDetail(task.id);
            });
        }
    });

    if (countSpan) countSpan.textContent = arr.length;
}

function initSortable() {
    // Только для ролей, имеющих право перемещать задачи
    if (currentTeamRole === 'observer') return;

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