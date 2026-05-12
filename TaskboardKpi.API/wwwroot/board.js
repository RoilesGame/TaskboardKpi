const statuses = ['backlog', 'in_progress', 'review', 'done'];

// Проверка авторизации
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return null;
    }
    return token;
}

// Инициализация перетаскивания
function initSortable(token) {
    statuses.forEach(status => {
        new Sortable(document.getElementById(status), {
            group: 'tasks',
            animation: 150,
            onEnd: async function (evt) {
                const taskId = evt.item.dataset.id;
                const newStatus = evt.to.parentElement.dataset.status;
                const newPosition = Array.from(evt.to.children).indexOf(evt.item);

                await fetch(`/api/tasks/move/${taskId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ newStatus, newPosition })
                });
            }
        });
    });
}

// Загрузка задач (companyId в URL больше не нужен)
async function loadBoard(token) {
    try {
        const response = await fetch('/api/tasks/board', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Not authorized');
        const board = await response.json();

        renderColumn('backlog', board.backlog);
        renderColumn('in_progress', board.inProgress);
        renderColumn('review', board.review);
        renderColumn('done', board.done);
    } catch (err) {
        console.error('Ошибка загрузки доски:', err);
    }
}

function renderColumn(status, tasks) {
    const container = document.getElementById(status);
    container.innerHTML = '';
    const countSpan = document.getElementById(`${status}-count`);
    if (tasks && Array.isArray(tasks)) {
        tasks.forEach(task => {
            const card = document.createElement('div');
            card.className = 'task-card';
            card.dataset.id = task.id;
            card.textContent = task.title;
            container.appendChild(card);
        });
        if (countSpan) countSpan.textContent = tasks.length;
    } else {
        if (countSpan) countSpan.textContent = '0';
    }
}

// Старт приложения
const token = checkAuth();
if (token) {
    initSortable(token);
    loadBoard(token);
}