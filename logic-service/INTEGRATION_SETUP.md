# Logic Service Integration Setup (Khi gop vao Project chinh)

## 0) Quick Command Order (Cho teammate)

### A. Chay theo Docker network (khuyen nghi)

1. Chay ha tang chung (tu project root chua `docker-compose.yml`):
```bash
docker compose up -d
```

2. Tu thu muc `logic-service`, build va start logic-service:
```bash
npm install
npm run docker:up
```

3. Chay migration DB:
```bash
npm run prisma:migrate
```

4. (Tuy chon) nap du lieu mau:
```bash
npm run prisma:seed
```

5. Xem log runtime:
```bash
npm run docker:logs
```

6. Dung logic-service:
```bash
npm run docker:down
```

### B. Chay local host mode (khong dong goi app vao container)

1. Dam bao ha tang docker dang chay (`postgres`, `redis`, `kafka`):
```bash
docker compose up -d
```

2. Tu thu muc `logic-service`:
```bash
npm install
npm run prisma:migrate
npm run dev
```

3. Neu port 8003 bi chiem:
```bash
set PORT=8004&& npm run dev
```

### C. Kiem tra nhanh sau khi len

```bash
# Health check
curl http://localhost:8003/health
```

Tai lieu nay la checklist setup de gop `logic-service` vao he thong nhieu service va chay on dinh trong Docker network.

## 1) Mo hinh giao tiep hien tai

- Internal REST API:
  - Public: `GET /health`
  - Protected (bat buoc `X-Service-Token`): `/v1/users/*`, `/v1/courses/*`, `/v1/grades/*`
- Event-driven qua Kafka:
  - Consume topic tu service khac
  - Produce topic de service khac xu ly tiep
- Ha tang phu thuoc:
  - PostgreSQL
  - Redis
  - Kafka
  - MinIO (luu file document)

## 2) Cau truc env va cach chay

Project dang su dung 2 mode ro rang:

- Local host mode:
  - File: `.env.local`
  - Chay: `npm run dev` hoac `npm run dev:local`
  - Kafka: `127.0.0.1:9094`
  - DB: `localhost:5432`
  - Redis: `localhost:6379`

- Docker network mode:
  - File: `.env.docker`
  - Chay qua compose (service container)
  - Kafka: `kafka:9092`
  - DB: `postgres:5432`
  - Redis: `redis:6379`

Ghi chu:
- Bien `ENV_FILE` duoc dung de chon file env.
- Mac dinh neu khong set `ENV_FILE`: `.env.local`.

## 3) Them service vao compose tong

Neu project chinh da co `docker-compose.yml` (kafka/postgres/redis), dung them file override cho logic-service.

File da tao san: `logic-service/docker-compose.logic.yml`

Noi dung chinh:

```yaml
services:
  logic-service:
    build:
      context: ./logic-service
      dockerfile: Dockerfile
    container_name: logic-service
    ports:
      - "8003:8003"
    env_file:
      - ./logic-service/.env.docker
    environment:
      - ENV_FILE=.env.docker
    depends_on:
      - postgres
      - redis
      - kafka
```

Lenh chay tu thu muc `logic-service`:

```bash
npm run docker:up
npm run docker:logs
```

## 4) Setup bat buoc de service khac goi API noi bo

Tat ca endpoint `/v1/*` can header `X-Service-Token` theo format:

`service:timestamp:signature`

Trong do:
- `timestamp`: Unix ms
- `signature`: HMAC-SHA256 cua chuoi `service:timestamp`
- Secret dung de ky: `SERVICE_TOKEN_SECRET` (phai giong nhau giua cac service noi bo)
- Token het han sau 5 phut

Node.js vi du tao token:

```js
const crypto = require('crypto');

function makeServiceToken(service, secret) {
  const timestamp = Date.now().toString();
  const message = `${service}:${timestamp}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  return `${service}:${timestamp}:${signature}`;
}
```

## 5) Kafka topics can map dung

### Logic Service consume

- `lms.discord.file.uploaded`
- `lms.discord.submission.created`
- `lms.discord.command.requested`
- `lms.discord.ticket.created`
- `lms.ai.response.quiz`
- `lms.ai.response.grade`
- `lms.web.quiz.submitted`

### Logic Service produce

- `lms.ai.request.answer_ticket`
- `lms.ai.request.summarize_doc`
- `lms.notification.send.dm`
- `lms.logic.process.submission`
- `lms.logic.process.grade`
- `lms.discord.response`

Ghi chu:
- Ten topic phai khop 100% (sai 1 ky tu se khong route duoc).
- Consumer group hien tai: `logic-service-group`.

## 6) Database migration khi gop he thong

Truoc khi traffic that:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Co the seed du lieu dev:

```bash
npm run prisma:seed
```

## 7) Data persistence va dong bo du lieu

- Du lieu PostgreSQL trong setup Docker duoc luu o Docker volume (khong nam trong git repo).
- `git push/pull` KHONG mang theo data DB.
- Teammate pull code se KHONG thay data cua ban, chi thay schema/migration.
- Muon chia se data: can backup/restore DB (pg_dump/psql).

## 8) Checklist sau khi tich hop

- [ ] `docker compose` nhin thay `postgres`, `redis`, `kafka`, `logic-service` cung up
- [ ] `logic-service` log: `Logic Service ready for requests`
- [ ] `GET /health` tra ve OK
- [ ] Goi 1 endpoint `/v1/*` voi `X-Service-Token` hop le tra ve thanh cong
- [ ] 1 message test vao topic consume duoc handler xu ly
- [ ] 1 action trong logic-service produce ra topic downstream
- [ ] File upload event luu document voi `fileUrl` MinIO (neu source la URL tai duoc)

## 9) Loi thuong gap

- `ENOTFOUND kafka`:
  - Dang chay local nhung de `KAFKA_BROKER=kafka:9092`
  - Fix: dung `127.0.0.1:9094` cho local

- `EADDRINUSE :8003`:
  - Port 8003 dang bi service/container khac chiem
  - Fix: dung container dang chay (`npm run docker:down`) hoac doi `PORT`

- `X-Service-Token invalid/expired`:
  - Sai secret giua cac service
  - Timestamp qua han > 5 phut
  - Sai format token

- MinIO khong luu duoc file:
  - Thieu `MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY/MINIO_BUCKET`
  - `fileId` trong event khong phai URL HTTP(S) tai duoc
  - Khi loi upload, service se fallback luu `fileId` goc de khong lam fail luong
