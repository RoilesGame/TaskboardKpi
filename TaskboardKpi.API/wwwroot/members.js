// Список участников
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
            const roleText = m.role === 'owner' ? 'Владелец' : m.role === 'editor' ? 'Редактор' : m.role === 'observer' ? 'Наблюдатель' : 'Исполнитель';
            nameSpan.textContent = m.fullName + ` (${roleText})`;
            li.appendChild(avatar);
            li.appendChild(nameSpan);
            list.appendChild(li);
        });
    } catch (err) {
        console.error(err);
    }
}