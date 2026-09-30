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

## Клавиатура
Alt+/ — справка. Alt+1/2/3 — вкладки, Alt+0 — дерево (стрелки, Enter, Delete), Alt+Shift+M — курсор-мышь на стрелках.

## Турбоархив
Кнопка «Archive» в дереве (или Alt+Shift+A) скачивает выбранную папку/весь workspace одним файлом
`*.pocket.json.gz` (JSON: тексты как есть, бинарники в base64, sha256 на каждый файл; без .git и node_modules).
Распаковка на ПК (нужен только Node, скопируйте один файл `pocket.js`):

    node pocket.js unpack workspace-2026-09-30.pocket.json.gz ./workspace
    node pocket.js list   workspace-2026-09-30.pocket.json.gz

Обратно в IDE: кнопка «Восстановить из архива». Из терминала IDE: `node pocket.js pack . backup.pocket.json.gz`.
