const API_BASE_URL = 'http://localhost:5073';
const API_BASE = API_BASE_URL || '';
function api(path, options = {}) {
    return fetch(API_BASE + path, options);
}