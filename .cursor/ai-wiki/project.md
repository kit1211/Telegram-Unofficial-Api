# โปรเจกต์ telegram-reverse

## Stack

- **Runtime**: Bun
- **HTTP**: Elysia (`elysia@latest`)
- **Entry**: `src/index.ts` (API) · `src/worker.ts` (BullMQ)
- **Queue**: Redis + BullMQ — ดู [api-jobs.md](./api-jobs.md)

## คำสั่ง

- `bun run docker:up` — Redis
- `bun run dev` + `bun run dev:worker` — API + worker (ต้องรันคู่กัน)
- `bun run login:phone` / `login:qr` — CLI (ยังมี); แนะนำ `POST /v1/jobs` type `auth.*`
- Dump/invite: `POST /v1/jobs` `member.dump` / `member.invite` — ดู [group-members-dump.md](./group-members-dump.md)
- Forward โพสต์ช่วงวันที่: `bun run scripts/forward-channel-range.ts` (album batch, caption ไฟล์, delay สุ่ม) — CLI จาก Mac branch

## สถานะ

- MTProto client + SQLite session, login เบอร์, RPC services/catalog, reverse WebK map
- Product flow ยังไม่ครบ — ดู `feature-gap.md`

## ระบบความจำ AI (repo)

- `.cursor/ai-wiki/` — wiki ถาวร
- `.cursor/hotcache.md` — สรุปล่าสุด ≤500 คำ
- `log.md` — log การสนทนาทั้งหมด แยกตามวันที่
- Rule: `.cursor/rules/ai-memory.mdc`

## AI Wiki + RAG

- โค้ด local: `~/Documents/My/ai-wiki`
- **ถอด deploy แล้ว** บน xiaolong-server (Postgres/pgvector/SQLite Docker)
- **ทิศทาง:** MongoDB Vector Search + MongoDB text search — ดู `ai-wiki/docs/mongodb-rag.md`
- แยกจาก repo `telegram-reverse`
