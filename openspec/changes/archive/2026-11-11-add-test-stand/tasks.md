# Tasks

Автотесты по этой доработке не пишем (сервер, скрипты выкатки и nginx — правило
проекта «без автотестов, проверяем настоящей выкаткой»). Проверка каждого шага —
командой или руками, как указано в задаче.

## 1. Параметризация compose и deploy.sh

- [x] 1.1 В `deploy/docker-compose.prod.yml` вынести в переменные с прод-дефолтами:
  `container_name: ${APP_CONTAINER:-prod-app}` и `${DB_CONTAINER:-prod-postgres}`,
  порт `"127.0.0.1:${APP_PORT:-3000}:3000"`, `env_file: ${ENV_FILE:-.env}` (у app и
  migrate), `mem_limit: ${APP_MEM_LIMIT:-0}` и `${DB_MEM_LIMIT:-0}`. Проверка:
  `APP_IMAGE=x docker compose -p prod -f deploy/docker-compose.prod.yml config`
  показывает прежние имена `prod-app`/`prod-postgres`, порт `3000`, env_file `.env`.
- [x] 1.2 В `deploy/deploy.sh` добавить второй аргумент `env` (по умолчанию `prod`) и
  по нему задать: проект compose (`prod`/`test`), `APP_CONTAINER`/`DB_CONTAINER`,
  `APP_PORT` (3000/3100), `ENV_FILE` (`.env`/`.env.staging`), флаги «делать бэкап»
  (прод да / стенд нет) и «пересев из прода» (стенд да). Прод-ветка по смыслу не
  меняется. Проверка: `bash -n deploy/deploy.sh`; прогон глазами — при пустом втором
  аргументе путь идентичен нынешнему (бэкап, миграции, smoke на 3000).
- [x] 1.3 В `deploy/deploy.sh` для `env=test`: если `.env.staging` на сервере нет —
  напечатать «стенд не настроен (нет .env.staging) — пропускаю» и выйти с кодом 0
  (стенд подключается наличием файла, прод от этого не страдает). Если есть — перед
  миграциями пересев: `docker exec <prod-postgres> pg_dump -Fc` →
  `docker exec -i <test-postgres> pg_restore --clean --if-exists --no-owner`, бэкап
  стенда НЕ делать. Проверка: `bash -n deploy/deploy.sh`; реальная проверка — на
  сервере в задаче 5.4.
- [x] 1.4 Обновить `deploy/.env.example`: пояснить блок стенда (`.env.staging`:
  `APP_PORT=3100`, свои `POSTGRES_*`/`DATABASE_URL`/`BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL=PUBLIC_APP_URL=https://test-app.dobrymaxx.ru`, лимиты памяти,
  что бэкап стенда не делается, пересев из прода). Проверка: файл читается, значения
  согласуются с `deploy.sh` и compose; секретов нет.

## 2. Workflow: прод первым, стенд после

- [x] 2.1 Разбить `.github/workflows/deploy.yml` на задачи `build` (сборка+push
  образа, выход — ссылка на образ), `deploy-prod` (`needs: build`, `deploy.sh
  <image>` — прод как раньше), `deploy-staging` (`needs: [build, deploy-prod]`,
  `deploy.sh <image> staging`). Группу параллельности оставить на весь workflow
  (`cancel-in-progress: false`). Проверка: `actionlint .github/workflows/deploy.yml`
  (или просмотр), граф задач — стенд после прода, прод не зависит от стенда.

## 3. nginx стенда: пароль и свой сертификат

- [x] 3.1 Добавить `deploy/nginx/test-app.dobrymaxx.ru.conf`: `server_name
  test-app.dobrymaxx.ru`, `proxy_pass http://127.0.0.1:3100`, `auth_basic` +
  `auth_basic_user_file /etc/nginx/.htpasswd-test-app`, `location = /health {
  auth_basic off; ... }`, свой сертификат `live/test-app.dobrymaxx.ru`. В шапке —
  инструкция применения на сервере (как у прод-конфига), с пометкой не трогать чужие
  конфиги и общий серт. Проверка: при применении `sudo nginx -t` зелёный (задача 5.4).

## 4. Авторизация: проверить и зафиксировать

- [x] 4.1 Подтвердить по `src/lib/auth.ts`, что ссылка строится из `BETTER_AUTH_URL`
  и ничто не переопределяет базовый URL на запрос, а кука host-only (нет
  `advanced.crossSubDomainCookies` и `Domain`). Если полезно — добавить короткий
  комментарий, фиксирующий это требование; код по смыслу не меняем. Проверка:
  `grep -n "crossSubDomainCookies\|cookieDomain\|Domain" src/lib/auth.ts` пусто;
  `BETTER_AUTH_URL` — единственный источник адреса.

## 5. Поднятие стенда на сервере (разово, после влития PR)

- [x] 5.1 (владелец, human-only) Добавить DNS A-запись `test-app.dobrymaxx.ru` →
  `153.76.175.174`. Проверка: `dig +short test-app.dobrymaxx.ru` возвращает этот IP.
- [x] 5.2 (владелец) Создать `~/deploy/.env.staging` по образцу из `deploy/.env.example`
  (секреты не в git), права 600. Проверка: `ssh crm 'ls -l ~/deploy/.env.staging'` —
  файл есть, права `-rw-------`.
- [x] 5.3 (владелец) Создать `/etc/nginx/.htpasswd-test-app` своим паролем
  (`sudo htpasswd -c /etc/nginx/.htpasswd-test-app <логин>`). Проверка: файл есть,
  строка с логином присутствует.
- [x] 5.4 Применить `deploy/nginx/test-app.dobrymaxx.ru.conf` на сервере и выпустить
  сертификат (`sudo certbot --nginx -d test-app.dobrymaxx.ru`); затем запустить
  выкатку стенда (re-run workflow или следующий merge). Проверки: `sudo nginx -t`
  зелёный; `curl -I https://test-app.dobrymaxx.ru/health` = 200; корень
  `https://test-app.dobrymaxx.ru/` без пароля отдаёт 401; с паролем открывается
  приложение с данными-копией прода.

## 6. Приёмка стенда (руками)

- [x] 6.1 На `test-app.dobrymaxx.ru` запросить вход своей почтой: письмо приходит,
  ссылка в нём ведёт на `test-app...` (не на прод), вход срабатывает. На проде при
  этом остаёшься гостем (кука не пересекается). Проверка — руками по письму и двум
  вкладкам.
- [x] 6.2 Проверить изоляцию и пересев: изменить что-то на стенде, прогнать выкатку
  ещё раз — правка пропала, данные снова как на проде; прод при выкатке стенда не
  затронут. Проверка — руками.

## Workflow follow-up

- Заархивировать изменение (`/opsx:archive`) после приёмки и влития, синхронизировав
  основные спеки.
