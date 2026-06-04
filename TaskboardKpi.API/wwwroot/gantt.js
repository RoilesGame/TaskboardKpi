// Диаграмма Ганта
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

        function buildGantt(division) {
            ganttDivision = division;
            const colors = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' };
            const scale = ganttScale;
            const totalWidth = totalDays * scale;
            let html = '';

            html += `
            <div class="gantt-controls">
                <span>Цена деления:</span>
                <select id="gantt-division">
                    <option value="weeks" ${division === 'weeks' ? 'selected' : ''}>Недели</option>
                    <option value="months" ${division === 'months' ? 'selected' : ''}>Месяцы</option>
                </select>
                <span style="margin-left:16px;">Масштаб: ${scale}px/день</span>
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
                    if (prevMonthLine === null) prevMonthLine = monthKey;
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
            if (rightCol) {
                if (rightCol._wheelHandler) {
                    rightCol.removeEventListener('wheel', rightCol._wheelHandler);
                }
                const wheelHandler = function(e) {
                    e.preventDefault();
                    const containerWidth = rightCol.clientWidth;
                    const minScale = Math.ceil(containerWidth / totalDays);
                    let newScale = ganttScale;
                    if (e.deltaY < 0) {
                        newScale = Math.min(200, newScale + 5);
                    } else {
                        newScale = Math.max(minScale, newScale - 5);
                    }
                    if (newScale !== ganttScale) {
                        ganttScale = newScale;
                        buildGantt(ganttDivision);
                    }
                };
                rightCol.addEventListener('wheel', wheelHandler);
                rightCol._wheelHandler = wheelHandler;
            }
        }

        buildGantt(ganttDivision || 'weeks');

    } catch (err) {
        console.error(err);
        container.innerHTML = '<p style="text-align:center;color:red;padding:40px;">Ошибка загрузки диаграммы</p>';
    }
}