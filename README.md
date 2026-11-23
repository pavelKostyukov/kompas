# Компас целей

Личный дашборд целей и саморазвития. Сайт: https://pavelkostyukov.github.io/kompas/

| Файл | Что это |
|---|---|
| `index.html` | дашборд, вкладки «Обзор» и «Дерево навыков» |
| `goals.md` | исходный файл целей, из которого собран дашборд |
| `goals.html` | тот же goals.md в виде страницы |
| `tools/build.mjs` | сборка страниц из исходников в `src/` |
| `tools/from-artifact.mjs` | превращает страницу артефакта Claude в `src/dashboard.html` |

Галочки и очки навыков хранятся в браузере (localStorage) и в репозиторий не попадают.

## Как обновить

Нужны Node 18+ и pandoc.

```sh
node tools/from-artifact.mjs путь/к/странице-артефакта.html src/dashboard.html
cp путь/к/goals.md src/goals.md
node tools/build.mjs --plain
git add index.html goals.html goals.md && git commit -m "Обновить компас" && git push
```

Сборка умеет и закрывать страницы паролем: `KOMPAS_PASSWORD='...' node tools/build.mjs` шифрует их (AES-256-GCM, ключ через PBKDF2-SHA256) и убирает открытый goals.md из корня.
