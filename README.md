# PocketIDE

Установка (Codespaces / Linux / Banana Pi):

    sudo apt-get install -y tmux build-essential python3   # если ещё нет
    cp .env.example .env    # впишите свой AUTH_TOKEN (>=16 символов)
    npm run setup           # ставит зависимости и собирает UI (web/out)
    npm start               # http://localhost:8080

Codespaces: добавьте secret AUTH_TOKEN (или .env), запустите `npm start`,
во вкладке Ports сделайте порт 8080 Public и откройте ссылку на телефоне.
iPhone: Safari → Поделиться → «На экран Домой» (PWA).

Preview: /proxy/<порт>/ — приложение должно работать под относительными путями
(Vite: `base: './'`, Next: `basePath` не нужен для API-страниц без абсолютных ассетов).
tmux: префикс Ctrl+B (есть кнопка ^B на панели), разбиение окна: ^B затем %  или "
