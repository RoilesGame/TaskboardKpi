// Глобальное состояние приложения
let currentToken = null;
let currentUserId = null;
let currentUserRole = 'user';   // глобальная роль (global_admin, hr_manager, user)
let currentTeamId = null;
let currentProjectId = null;
let currentTeamRole = null;    // роль в текущей команде (owner, editor, executor, observer)
let cachedTasks = [];
let ganttScale = 30;
let ganttDivision = 'weeks';