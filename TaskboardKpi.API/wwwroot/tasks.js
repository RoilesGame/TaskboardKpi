// Создание, редактирование, удаление, назначения

function initCreateTaskModal() {
    const modal = document.getElementById('modal-overlay');
    const openBtn = document.getElementById('new-task-btn');
    const closeBtn = document.getElementById('close-modal');
    const form = document.getElementById('create-task-form');

    if (!modal || !openBtn || !closeBtn || !form) return;

    openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('task-title').value.trim();
        const description = document.getElementById('task-desc').value.trim();
        const priority = document.getElementById('task-priority').value;
        const dueDate = document.getElementById('task-due-date').value;
        const startDate = document.getElementById('task-start-date').value;

        if (!title) return;
        if (startDate && dueDate && dueDate < startDate) {
            showToast('Дата окончания не может быть раньше даты начала');
            return;
        }

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

        // Кнопка удаления видна только владельцу команды или глобальному админу
        const deleteBtn = document.getElementById('delete-task-btn');
        if (deleteBtn) {
            deleteBtn.style.display = (task.userRole === 'owner' || currentUserRole === 'global_admin') ? 'inline-block' : 'none';
        }

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
    const deleteBtn = document.getElementById('delete-task-btn');

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

    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!currentDetailTaskId || !confirm('Удалить задачу?')) return;
            const res = await api(`/api/tasks/${currentDetailTaskId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            if (res.ok) {
                overlay.classList.add('hidden');
                showToast('Задача удалена', 'success');
                loadBoard();
            } else {
                const err = await res.text();
                showToast(err || 'Ошибка удаления');
            }
        });
    }

    // Назначение исполнителей
    document.getElementById('self-assign-btn')?.addEventListener('click', async () => {
        if (!currentDetailTaskId) return;
        const res = await api(`/api/tasks/${currentDetailTaskId}/self-assign`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) { showToast('Задача взята на себя', 'success'); closeDetailAndReload(); }
        else { const err = await res.text(); showToast(err || 'Ошибка'); }
    });

    document.getElementById('unassign-btn')?.addEventListener('click', async () => {
        if (!currentDetailTaskId) return;
        const res = await api(`/api/tasks/${currentDetailTaskId}/self-assign`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) { showToast('Назначение снято', 'success'); closeDetailAndReload(); }
        else { const err = await res.text(); showToast(err || 'Ошибка'); }
    });

    document.getElementById('assign-btn')?.addEventListener('click', async () => {
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