# API + BullMQ jobs

## รัน

```bash
bun run docker:up          # Redis (AOF)
bun run dev                # API :3000
bun run dev:worker         # BullMQ worker (ต้องรันคู่ API)
```

Env: `.env.example` — `REDIS_URL`, `PORT`, `WORKER_CONCURRENCY`

## Job id

- สร้างตอน `POST /v1/jobs` เป็น **UUID v7**
- BullMQ **ห้าม `:` ใน custom job id** — child ใช้ `{parentId}__filter-{label}` ผ่าน `src/queue/job-id.ts`

## Endpoints

| Method | Path | คำอธิบาย |
|--------|------|----------|
| GET | `/v1/health` | Redis ping |
| POST | `/v1/jobs` | `{ type, params, accounts? }` |
| POST | `/v1/jobs/:id/resume` | ทำ `member.dump` ที่ยังไม่จบต่อ — คง user ใน Redis และต่อจาก offset ที่เซฟไว้ |
| POST | `/v1/jobs/:id/input` | OTP / password / signup (auth) |
| GET | `/v1/jobs/:id/members.csv` | CSV dump |
| GET | `/v1/accounts` | รายการ session |
| GET | `/v1/accounts/:id/profile` | sync profile |
| POST | `/v1/accounts/import` | `{ fromPath, account }` |
| POST | `/v1/accounts/:id/reset` | ลบ KV บัญชี |

## Job types

| type | params หลัก |
|------|-------------|
| `member.dump` | `username`, `pageLimit?` (200), `pageDelayMs?` (1000), `accounts?` |
| `member.invite` | `targetUsername` (username หรือลิงก์ `+…` / `t.me/+…`), `sourceJobId` หรือ `csvPath`, `account?`, `limit`, `delayMs`, `batch`, `offset?` (ข้าม N แถวแรกของ CSV) |
| `auth.phone` | `phone`, `account?` |
| `auth.qr` | `account?` |
| `profile.self` | `account?` |
| `group.smoke` | `username` |
| `group.sendMedia` | `username`, `videoPath?`, `stickerShortName?` |
| `group.manage` | `username`, `account?`, `action` — ดูด้านล่าง |
| `account.reset` | `account` |

## Dump สมาชิก

- Orchestrator → child `member.dump.filter` ต่อ filter (recent + search) → `member.dump.finalize`
- แต่ละบัญชี resolve `inputChannel` ของตัวเอง (`job:{id}:peer:{accountId}`) แล้วถือ `lock:mtproto:{accountId}` ระหว่าง RPC และช่วงพัก `pageDelayMs` (default **1000**)
- หนึ่ง process ใช้ MTProto session เดียวต่อบัญชี (`session-pool`) — สอง connection พร้อมกันบน auth key เดียวกันทำให้ RPC พัง
- สมาชิก merge ใน Redis `HSET job:{id}:users` — ทุกหน้าเซฟ offset ที่ `job:{id}:cursor:{label}`
- งานค้าง: `POST /v1/jobs/:id/resume` แล้วให้ worker รันอยู่ จะข้าม filter ที่เสร็จแล้วและดึงต่อจาก offset เดิม ไม่เริ่ม unique ใหม่
- filter ที่ทำจบครบแล้ว resume ได้ 409
- หลายบัญชี: `accounts` ใน request หรือทุกแถวใน SQLite; round-robin ต่อ filter
- ทุกหน้า log `[dump] account=… filter=… got=… limit=… offset=… unique=…` และเขียน `progress.lastFetchCount`

## Invite สมาชิก

- **`targetUsername`**: `@channel`, `channel`, หรือ **invite link** (`+AbCd…`, `https://t.me/+AbCd…`) — resolve ผ่าน `messages.checkChatInvite` / `messages.importChatInvite` ใน `resolveChannel` (`src/jobs/mtproto-utils.ts`)
- **`offset`**: ข้ามแถว CSV N แถวแรก (ต่อ job หลัง job อื่นใช้หัวไฟล์ไปแล้ว)
- **`access_hash` ใน CSV**: ใช้ได้ถ้า dump ด้วยบัญชีเดียวกับที่เชิญ; ไม่มี username ก็ลอง hash จาก CSV ก่อน resolve username
- Progress: `inviteRpcOk` (RPC สำเร็จ), `channelMembersStart` / `channelMembers`, `membersJoinedDelta` (นับจาก `channels.getFullChannel` — RPC ok ไม่เท่ากับ join ทุกครั้ง)
- **`FLOOD_WAIT`**: คิว job ใหม่ด้วย delay แทน sleep ใน worker — worker ว่างไป job อื่นได้

## จัดการกลุ่มและ topic

`POST /v1/jobs` type `group.manage`. ไลบรารี `@mtproto/core` ในเครื่องเข้ารหัสชุดเก่าใต้ `channels.*` (`toggleForum`, `createForumTopic`, `getForumTopics`, `editForumTopic`, `updatePinnedForumTopic`) ไม่ใช่ `messages.createForumTopic`

| action | params | RPC |
|--------|--------|-----|
| `title` | `title` | `channels.editTitle` |
| `about` | `about` | `messages.editChatAbout` |
| `forum` | `enabled` (boolean) | `channels.toggleForum` |
| `topic.create` | `title`, `iconColor?`, `iconEmojiId?` | `channels.createForumTopic` |
| `topic.list` | `limit?` (1–100), `q?` | `channels.getForumTopics` |
| `topic.edit` | `topicId`, อย่างน้อยหนึ่งใน `title` / `closed` / `hidden` / `iconEmojiId` | `channels.editForumTopic` |
| `topic.pin` | `topicId`, `pinned` | `channels.updatePinnedForumTopic` |
| `topic.copy` | `sourceChannelId`, `replaceFrom?`, `replaceTo?` | เปิด forum ที่เป้าหมายแล้วสร้าง topic จากกลุ่มต้นทาง (หัวข้ออย่างเดียว) |

กลุ่มต้องเป็น supergroup ที่เปิด forum แล้ว ไม่งั้น topic ได้ `CHANNEL_FORUM_MISSING`. แอดมินต้องมี `manage_topics`. ผลอยู่ใน `GET /v1/jobs/:id` → `result.data`.

## สถานะ poll

`queued` | `active` | `waiting_input` | `completed` | `failed`

Auth: `waiting_input` + `input.needs` = `otp` | `password` | `scan` | `signup`
