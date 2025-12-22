# Полное руководство по Docker: от основ к production

## Что такое Docker

Docker — это платформа контейнеризации, которая позволяет упаковать приложение со всеми его зависимостями (библиотеки, фреймворки, переменные окружения) в изолированный контейнер. Этот контейнер работает одинаково на любой машине: на ноутбуке разработчика, на CI/CD сервере или в production.

Основная идея: вместо установки Python, Node.js, PostgreSQL и всех зависимостей на машину, вы описываете все это в конфигурационном файле (Dockerfile), и Docker создает образ (image) — шаблон контейнера. Из этого образа можно запустить множество идентичных контейнеров.

**Ключевые преимущества:**
- Одинаковое окружение везде (dev, staging, production)
- Легко масштабировать приложение
- Изолированность процессов и файловых систем
- Простой откат на предыдущую версию
- Эффективное использование ресурсов

## Основные концепции

### Образ (Image)
Образ — это неизменяемый шаблон, который содержит все необходимое для запуска приложения: операционную систему, библиотеки, код приложения. Образ состоит из слоев (layers), каждый слой представляет отдельный шаг в Dockerfile.

Образ создается один раз, проверяется, и потом может быть запущен миллион раз как контейнер.

### Контейнер (Container)
Контейнер — это запущенный экземпляр образа. Это изолированный процесс, который имеет собственную файловую систему, переменные окружения, сетевое пространство имен.

Если образ — это класс в программировании, то контейнер — это экземпляр этого класса.

### Dockerfile
Текстовый файл с инструкциями для построения образа. Каждая команда в Dockerfile создает новый слой образа.

### Registry (репозиторий образов)
Место, где хранятся образы. Docker Hub — это публичный registry по умолчанию. Там находятся образы Linux, Node.js, PostgreSQL и тысячи других приложений.

Пример: `docker.io/library/node:18` — образ Node.js версии 18 из Docker Hub.

### Docker Compose
Инструмент для определения и запуска multi-container приложений. Вместо запуска нескольких контейнеров вручную, вы описываете их в файле docker-compose.yml и запускаете все одной командой.

## Установка Docker

### На Linux (Ubuntu/Debian)
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавьте пользователя в группу docker, чтобы не писать sudo
sudo usermod -aG docker $USER
newgrp docker

# Проверьте установку
docker --version
docker run hello-world
```

### На macOS
Установите Docker Desktop с официального сайта docker.com. После установки проверьте:
```bash
docker --version
docker run hello-world
```

### На Windows
Установите Docker Desktop. Убедитесь, что включен WSL 2 (Windows Subsystem for Linux 2).

## Как запустить контейнер

### Самый простой способ: запуск существующего образа
```bash
docker run nginx
```

Эта команда:
1. Проверит, есть ли образ `nginx` локально
2. Если нет — скачает его из Docker Hub
3. Создаст и запустит контейнер на основе этого образа

По умолчанию контейнер запускается в foreground режиме (вы видите логи).

### Запуск контейнера в фоне
```bash
docker run -d nginx
```

Флаг `-d` означает detached mode. Контейнер запустится в фоне, и Docker выведет ID контейнера.

### Запуск контейнера с именем
```bash
docker run -d --name my-nginx nginx
```

Флаг `--name` присваивает контейнеру удобное имя вместо случайного.

### Пробросить порты
```bash
docker run -d -p 8080:80 nginx
```

Флаг `-p 8080:80` означает: проксировать трафик с порта 8080 хоста на порт 80 контейнера.

После этой команды вы можете открыть `http://localhost:8080` в браузере и увидеть nginx.

### Запуск с переменными окружения
```bash
docker run -d -e DATABASE_URL=postgres://user:pass@db:5432/mydb -e NODE_ENV=production myapp
```

Флаг `-e` устанавливает переменную окружения. Можно передать несколько переменных.

### Запуск с маунтированием директории
```bash
docker run -d -v /home/user/data:/data myapp
```

Флаг `-v /home/user/data:/data` делает директорию `/home/user/data` с хоста доступной внутри контейнера по пути `/data`. Изменения синхронизируются в реальном времени.

### Полный пример с несколькими флагами
```bash
docker run -d \
  --name web-server \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -v /app/logs:/var/log/app \
  --memory=512m \
  --cpus=1 \
  node:18
```

Здесь:
- `-d` — запуск в фоне
- `--name web-server` — имя контейнера
- `-p 3000:3000` — проброс портов
- `-e NODE_ENV=production` — переменная окружения
- `-v /app/logs:/var/log/app` — монтирование папки
- `--memory=512m` — лимит оперативной памяти
- `--cpus=1` — лимит CPU
- `node:18` — образ для запуска

## Создание собственного образа (Dockerfile)

### Базовая структура Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

**Разберем каждую команду:**

- **FROM node:18-alpine** — базовый образ (операционная система + Node.js 18). Alpine — это лёгкий Linux образ.
- **WORKDIR /app** — устанавливает рабочую директорию внутри контейнера. Все последующие команды выполняются из этой папки.
- **COPY package*.json ./** — копирует package.json и package-lock.json с хоста в контейнер. `*` — это wildcard.
- **RUN npm install --production** — устанавливает зависимости. Команда выполняется во время build, не во время запуска контейнера.
- **COPY . .** — копирует весь код приложения в контейнер.
- **EXPOSE 3000** — документирует, что контейнер слушает на порту 3000. Это не проксирует порт автоматически.
- **CMD ["node", "server.js"]** — команда по умолчанию, которая выполняется при запуске контейнера.

### Как собрать образ
```bash
docker build -t my-app:1.0 .
```

Флаг `-t` устанавливает тег образа в формате `name:version`. Точка `.` указывает на текущую директорию, где находится Dockerfile.

После этой команды образ будет готов и вы можете запустить его:
```bash
docker run -d -p 3000:3000 my-app:1.0
```

### Оптимизация Dockerfile для speed и размера

**Используйте .dockerignore:**
```
node_modules
npm-debug.log
.git
.env
.DS_Store
```

Это исключает файлы из копирования в контейнер, ускоряя build.

**Минимизируйте слои:**
```dockerfile
# Плохо — 2 отдельных RUN команды
RUN apt-get update
RUN apt-get install -y curl

# Хорошо — одна RUN команда
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
```

**Используйте multi-stage build для уменьшения размера:**
```dockerfile
# Stage 1: Build
FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
CMD ["node", "server.js"]
```

Здесь первый stage с полным образом используется только для install, а финальный образ содержит только нужное.

## Управление контейнерами

### Список запущенных контейнеров
```bash
docker ps
```

Показывает ID контейнера, образ, команду, статус, порты и имя.

### Список всех контейнеров (включая остановленные)
```bash
docker ps -a
```

### Остановить контейнер
```bash
docker stop my-nginx
```

Контейнер останавливается корректно с сигналом SIGTERM.

### Убить контейнер (принудительно)
```bash
docker kill my-nginx
```

Отправляет SIGKILL — немедленное завершение без graceful shutdown.

### Удалить контейнер
```bash
docker rm my-nginx
```

Можно удалить только остановленный контейнер. Если контейнер запущен, сначала остановите его.

### Удалить контейнер принудительно
```bash
docker rm -f my-nginx
```

Флаг `-f` остановит и удалит контейнер в одной команде.

### Просмотр логов контейнера
```bash
docker logs my-nginx
```

### Логи в реальном времени
```bash
docker logs -f my-nginx
```

Флаг `-f` означает follow (похоже на `tail -f`).

### Войти в работающий контейнер
```bash
docker exec -it my-nginx bash
```

Флаг `-it` означает interactive + tty. Вы сможете выполнять команды внутри контейнера.

Если bash нет (например в alpine Linux), используйте sh:
```bash
docker exec -it my-nginx sh
```

### Получить информацию о контейнере
```bash
docker inspect my-nginx
```

Выведет полный JSON с детальной информацией: IP адрес, переменные окружения, маунты и т.д.

## Работа с образами

### Список локальных образов
```bash
docker images
```

Показывает все загруженные образы с размером.

### Удалить образ
```bash
docker rmi nginx
```

Нельзя удалить образ, если есть контейнеры, использующие его. Сначала удалите контейнеры.

### Загрузить образ с Docker Hub
```bash
docker pull nginx:latest
```

Загрузит образ nginx последней версии.

### Отправить образ на Docker Hub
```bash
docker tag my-app:1.0 myusername/my-app:1.0
docker push myusername/my-app:1.0
```

Сначала нужно пройти аутентификацию:
```bash
docker login
```

## Docker Compose для multi-container приложений

### Создайте docker-compose.yml
```yaml
version: '3.9'

services:
  web:
    build: .
    container_name: my-app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:password@db:5432/myapp
    depends_on:
      - db
    volumes:
      - ./src:/app/src
    networks:
      - app-network

  db:
    image: postgres:15
    container_name: postgres-db
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=myapp
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - app-network

volumes:
  postgres-data:

networks:
  app-network:
```

**Разберем:**
- **version** — версия docker-compose синтаксиса
- **services** — определение контейнеров
- **build: .** — build из Dockerfile в текущей директории
- **ports** — проброс портов
- **environment** — переменные окружения
- **depends_on** — контейнер запустится после db
- **volumes** — монтирование папок или persistence данных
- **networks** — контейнеры в одной сети могут общаться по имени сервиса

### Запуск docker-compose
```bash
docker-compose up
```

Запустит все контейнеры в foreground режиме.

### Запуск в фоне
```bash
docker-compose up -d
```

### Остановить все контейнеры
```bash
docker-compose down
```

### Просмотр логов всех сервисов
```bash
docker-compose logs -f
```

### Просмотр логов конкретного сервиса
```bash
docker-compose logs -f web
```

### Перестроить образы (если изменился код)
```bash
docker-compose up -d --build
```

## Сетевые вопросы

### Как контейнеры общаются между собой
По умолчанию в docker-compose контейнеры находятся в одной сети и могут обращаться друг к другу по имени сервиса.

Пример: контейнер `web` может обратиться к `db` просто по адресу `db:5432`.

```javascript
// В Node.js контейнере
const dbUrl = 'postgres://user:password@db:5432/myapp';
```

### Как контейнер обращается к хосту
На Linux используйте `host.docker.internal` или IP адрес хоста.

На macOS и Windows просто используйте `host.docker.internal`:
```bash
docker run -e API_URL=http://host.docker.internal:8000 myapp
```

## Оптимизация для production

### Health checks
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

Docker будет периодически проверять здоровье контейнера.

### Использование read-only файловой системы
```bash
docker run --read-only --tmpfs /tmp myapp
```

Контейнер не сможет писать на диск (кроме /tmp), что повышает безопасность.

### Ограничение ресурсов
```bash
docker run \
  --memory=512m \
  --memory-swap=1g \
  --cpus=0.5 \
  myapp
```

- `--memory` — максимум оперативной памяти
- `--memory-swap` — максимум памяти включая swap
- `--cpus` — количество CPU cores

### Использование non-root пользователя
```dockerfile
RUN useradd -m appuser
USER appuser
```

Не запускайте приложение от root — это уязвимость.

## Debugging контейнеров

### Просмотр процессов в контейнере
```bash
docker top my-nginx
```

### Просмотр использования ресурсов
```bash
docker stats my-nginx
```

### Получить изменения в файловой системе
```bash
docker diff my-nginx
```

Покажет какие файлы были добавлены или изменены относительно образа.

### Скопировать файл из контейнера
```bash
docker cp my-nginx:/var/log/nginx/access.log ./access.log
```

### Скопировать файл в контейнер
```bash
docker cp ./config.json my-nginx:/etc/config.json
```

## Частые ошибки и решения

### "Cannot connect to Docker daemon"
Docker не запущен. Запустите Docker Desktop или Docker service:
```bash
sudo systemctl start docker
```

### "Port 3000 is already allocated"
Порт на хосте уже занят. Используйте другой порт:
```bash
docker run -p 3001:3000 myapp
```

Или найдите и убейте контейнер, занимающий этот порт:
```bash
docker ps | grep 3000
docker kill <container-id>
```

### "no space left on device"
Docker образы и контейнеры займут много места. Очистите неиспользуемые ресурсы:
```bash
docker system prune -a
```

Это удалит все неиспользуемые образы, контейнеры, тома и сети.

### Контейнер сразу выходит после запуска
Контейнер запустился, выполнил команду и вышел. Это нормально. Проверьте логи:
```bash
docker logs <container-id>
```

### Контейнер не может достучаться до сети
Убедитесь, что контейнер в docker-compose находится в одной сети с другим контейнером, к которому нужен доступ. Или убедитесь, что вы используете правильное имя сервиса.

### Файлы не синхронизируются при монтировании
На Windows монтирование работает медленнее. Используйте `:cached` флаг:
```bash
docker run -v C:\Users\mydata:/data:cached myapp
```

## Best practices

### 1. Используйте конкретные версии образов
```dockerfile
FROM node:18.15.0-alpine
```

Не используйте `FROM node:latest` — может внезапно сломаться из-за обновления.

### 2. Копируйте зависимости отдельно от кода
```dockerfile
COPY package*.json ./
RUN npm install
COPY . .
```

Слой с зависимостями кешируется. Если изменился только код, слой с npm install переиспользуется.

### 3. Используйте small base images
Alpine Linux (20 MB) вместо Ubuntu (77 MB):
```dockerfile
FROM node:18-alpine
```

### 4. Удаляйте кеши в одной RUN команде
```dockerfile
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
```

Иначе кеш оставляет слой в образе.

### 5. Не оставляйте secrets в Dockerfile
```dockerfile
# Плохо
ARG DATABASE_PASSWORD=secret123
RUN export DB_PASS=$DATABASE_PASSWORD

# Хорошо — передавайте во время запуска
ENV DATABASE_PASSWORD=""
```

Используйте Docker secrets для production.

### 6. Используйте .dockerignore
Исключайте node_modules, .git, .env и другие ненужные файлы.

### 7. Запускайте один процесс на контейнер
Один контейнер = один процесс (web сервер, база данных и т.д.). Используйте docker-compose для оркестрации.

## Полезные команды (шпаргалка)

```bash
# Запуск
docker run -d -p 3000:3000 -e VAR=value -v /host:/container --name myapp myimage

# Управление контейнерами
docker ps                          # Список запущенных
docker ps -a                       # Все контейнеры
docker stop <id>                   # Остановить
docker kill <id>                   # Убить
docker rm <id>                     # Удалить
docker logs <id>                   # Логи
docker logs -f <id>                # Логи в реальном времени
docker exec -it <id> bash          # Вход в контейнер

# Управление образами
docker images                      # Список образов
docker build -t name:tag .         # Собрать образ
docker push name:tag               # Отправить на registry
docker pull name:tag               # Загрузить с registry
docker rmi <image>                 # Удалить образ

# Информация
docker inspect <id>                # Детали контейнера
docker top <id>                    # Процессы
docker stats <id>                  # Ресурсы

# Docker Compose
docker-compose up                  # Запустить
docker-compose up -d               # В фоне
docker-compose down                # Остановить
docker-compose logs -f             # Логи
docker-compose build               # Собрать образы

# Очистка
docker system prune -a             # Удалить неиспользуемое
```

## Заключение

Docker революционизировал разработку, позволяя разработчикам и DevOps инженерам работать в одинаковых окружениях. Основные вещи которые нужно запомнить:

1. **Образ (Image)** — это шаблон, контейнер (Container) — это запущенный процесс.
2. **Dockerfile** описывает как собрать образ.
3. **Docker Compose** управляет несколькими контейнерами одновременно.
4. Контейнеры должны быть **stateless** — данные сохраняйте в volumes или external сервисах.
5. Используйте **environment variables** для конфигурации, а не hardcode.
6. В production используйте **health checks**, **resource limits** и **non-root user**.

С этими знаниями вы сможете контейнеризировать практически любое приложение и деплоить его везде одинаково.