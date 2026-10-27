# Telegram Unofficial API

MTProto client และ HTTP API (Elysia + Bun) สำหรับ automation แบบ Telegram WebK — login หลายบัญชี, job queue (Redis/BullMQ), dump/invite สมาชิก, จัดการกลุ่ม/forum topics, ส่งสื่อ

## ความต้องการ

- [Bun](https://bun.sh)
- Redis (ดู `docker-compose.yml`)

## ติดตั้ง

```bash
bun install
cp .env.example .env
docker compose up -d redis   # หรือ Redis ที่มีอยู่แล้ว
```

Session เก็บใน `.telegram/` (gitignore) — login ผ่าน API หรือ CLI:

```bash
bun run dev          # HTTP API :3000
bun run dev:worker   # BullMQ worker
```

## เอกสาร

- `.cursor/ai-wiki/index.md` — สารบัญ wiki ใน repo
- `.env.example` — ตัวแปรสภาพแวดล้อม

## หมายเหตุ

โปรเจกต์นี้ใช้ `api_id` / fingerprint จาก Telegram WebK สำหรับการทดสอบและ automation ส่วนตัว — ปฏิบัติตาม [Terms of Service](https://telegram.org/tos) ของ Telegram
