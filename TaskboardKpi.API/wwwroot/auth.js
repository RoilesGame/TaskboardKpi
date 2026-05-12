const apiUrl = '/api/auth';

// Логин
if (document.getElementById('login-form')) {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        const res = await fetch(`${apiUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('token', data.token);
            window.location.href = '/index.html';
        } else {
            alert('Ошибка входа');
        }
    });
}

// Регистрация
if (document.getElementById('register-form')) {
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('fullname').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const companyName = document.getElementById('company').value || undefined;

        const res = await fetch(`${apiUrl}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, email, password, companyName })
        });

        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('token', data.token);
            window.location.href = '/index.html';
        } else {
            const err = await res.text();
            alert(err || 'Ошибка регистрации');
        }
    });
}