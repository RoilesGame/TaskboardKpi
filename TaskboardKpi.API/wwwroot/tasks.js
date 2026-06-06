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

        // Загружаем файлы и инициализируем кнопку прикрепления после отображения окна
        await loadFiles(taskId);
        initFileUpload(taskId);
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

// ================== Файлы ==================
async function loadFiles(taskId) {
    const container = document.getElementById('files-scroll');
    if (!container) return;
    try {
        const resp = await api(`/api/files/${taskId}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const files = resp.ok ? await resp.json() : [];
        container.innerHTML = '';
        files.forEach(f => {
            const chip = document.createElement('div');
            chip.className = 'file-chip';
            chip.innerHTML = `
                <a href="${API_BASE}/api/files/download/${f.id}" target="_blank" title="${escapeHtml(f.fileName)}">
                    📄 ${escapeHtml(f.fileName)} (${formatFileSize(f.fileSize)})
                </a>
                <button class="file-delete-btn" data-file-id="${f.id}" title="Удалить">✕</button>
            `;
            container.appendChild(chip);
        });

        container.querySelectorAll('.file-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const fileId = btn.dataset.fileId;
                if (!confirm('Удалить файл?')) return;
                await api(`/api/files/${fileId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${currentToken}` }
                });
                await loadFiles(taskId);
            });
        });
    } catch (err) {
        console.error(err);
    }
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

function initFileUpload(taskId) {
    const input = document.getElementById('file-upload-input');
    const attachBtn = document.getElementById('attach-file-btn');
    if (!input || !attachBtn) return;

    const newAttachBtn = attachBtn.cloneNode(true);
    attachBtn.parentNode.replaceChild(newAttachBtn, attachBtn);
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newAttachBtn.addEventListener('click', () => newInput.click());

    newInput.addEventListener('change', async () => {
        const files = newInput.files;
        if (!files.length) return;

        const formData = new FormData();
        for (let f of files) {
            formData.append('file', f);
        }

        const resp = await api(`/api/files/${taskId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` },
            body: formData
        });

        if (resp.ok) {
            showToast('Файлы прикреплены', 'success');
            await loadFiles(taskId);
        } else {
            const err = await resp.text();
            showToast(err || 'Ошибка загрузки');
        }
        newInput.value = '';
    });
}