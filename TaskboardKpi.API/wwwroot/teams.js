// Команды: список, переключение, создание, присоединение, выход, копирование ID
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
        currentTeamId = tokenData?.teamId;

        // Группируем команды по проектам
        const projects = {};
        teams.forEach(team => {
            const pid = team.projectId;
            if (!projects[pid]) {
                projects[pid] = {
                    id: pid,
                    name: team.projectName,
                    isOwner: team.isOwner,
                    teams: []
                };
            }
            projects[pid].teams.push(team);
        });

        list.innerHTML = '';
        Object.values(projects).forEach(project => {
            const projectDiv = document.createElement('div');
            projectDiv.className = 'project-group';

            // Заголовок проекта с кнопкой сворачивания и кнопкой "Добавить команду"
            const header = document.createElement('div');
            header.className = 'project-header';
            header.innerHTML = `
                <span class="project-arrow" id="arrow-${project.id}">▼</span>
                <span class="project-name">${escapeHtml(project.name)}</span>
            `;
            header.addEventListener('click', (e) => {
                // Не сворачиваем, если клик был по кнопке "+"
                if (e.target.classList.contains('add-team-btn')) return;
                const teamsList = projectDiv.querySelector('.project-teams');
                const arrow = header.querySelector('.project-arrow');
                if (teamsList.style.display === 'none') {
                    teamsList.style.display = 'block';
                    arrow.textContent = '▼';
                } else {
                    teamsList.style.display = 'none';
                    arrow.textContent = '▶';
                }
            });

            projectDiv.appendChild(header);

            // Список команд внутри проекта
            const teamsList = document.createElement('div');
            teamsList.className = 'project-teams';

            project.teams.forEach(team => {
                const teamItem = document.createElement('div');
                teamItem.className = 'team-item';
                if (team.id === currentTeamId) teamItem.classList.add('active');

                teamItem.innerHTML = `
                    <span>${escapeHtml(team.name)}</span>
                    <span class="team-badge ${team.role === 'owner' ? 'owner' : 'member'}">
                        ${team.role === 'owner' ? 'Админ' : team.role === 'editor' ? 'Редактор' : team.role === 'observer' ? 'Наблюдатель' : 'Исполнитель'}
                    </span>
                `;
                teamItem.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (team.id === currentTeamId) return;
                    await switchTeam(team.id);
                });
                teamsList.appendChild(teamItem);
            });

            projectDiv.appendChild(teamsList);
            list.appendChild(projectDiv);
        });

    } catch (err) {
        console.error('Ошибка загрузки команд', err);
    }
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
        currentUserRole = getGlobalRoleFromToken(currentToken);
        currentTeamId = teamId;
        currentProjectId = data.projectId;
        cachedTasks = [];

        document.querySelector('.tab[data-tab="board"]')?.click();
        await loadProfile();
        await loadTeams();
        await loadMembers();
        await loadBoard();
    } catch (err) {
        console.error(err);
        showToast('Ошибка при переключении команды');
    }
}

// Модальное окно создания нового проекта
function initCreateProjectModal() {
    const modal = document.getElementById('project-modal-overlay');
    const openBtn = document.getElementById('new-project-btn');
    const closeBtn = document.getElementById('close-project-modal');
    const form = document.getElementById('create-project-form');

    if (!modal || !openBtn || !closeBtn || !form) return;

    openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('project-name').value.trim();
        if (!name) return;
        try {
            const resp = await api('/api/teams', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ name: 'Основная команда', projectName: name })
            });
            if (!resp.ok) throw new Error(await resp.text());
            modal.classList.add('hidden');
            form.reset();
            showToast('Проект создан', 'success');
            const newTeam = await resp.json();
            if (newTeam.id) await switchTeam(newTeam.id);
        } catch (err) {
            showToast(err.message || 'Ошибка создания проекта');
        }
    });
}

// Создание команды (внутри текущего проекта)
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
        if (!name) return;
        const res = await api('/api/teams', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ name })
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

// Присоединение к команде
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

// Копирование ID команды
function initCopyTeamIdButton() {
    const btn = document.getElementById('copy-team-id-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (!currentTeamId) return;
        navigator.clipboard.writeText(currentTeamId).then(() => {
            showToast('ID команды скопирован', 'success');
        }).catch(() => {
            prompt('ID команды:', currentTeamId);
        });
    });
}

// Выход из команды
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