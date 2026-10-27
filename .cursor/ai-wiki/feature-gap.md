# Feature gap vs รายการ MyTelegram Pro (อ้างอิงเทียบ)

โปรเจกต์นี้ **ไม่ใช่** MyTelegram server — เป็น reverse WebK + client MTProto (`@mtproto/core`) ไป **Telegram จริง**

## ใช้ได้จริงวันนี้

- Login เบอร์ + OTP (+ cloud 2FA ตอน login)
- Session SQLite (`.telegram-session.sqlite`)
- `users.getFullUser` (script `test:profile`)
- HTTP dev: config, websync URL, RPC catalog browse
- รายชื่อ RPC ~1141 จาก worker (catalog เท่านั้น)

## Reverse WebK (มีแล้ว — ยังไม่ใช่ product)

- แผนที่ manager/RPC/UI: [webk-features.md](./webk-features.md), JSON `src/reverse/features/webk-feature-map.json`, script `scripts/extract-webk-features.py`

## ทุกรายการด้านล่าง = ยังไม่มี product/UI/flow ใน repo

Multi-Layer 223–232, E2E, Calls, Bots, Privacy/2FA (settings), Stickers, Reactions, Star Gifts, Forum, Themes, Auto-delete, Scheduled, Chatlist, Business, Stories, Passkey login, Email login, Email sender, Direct Messages, Firebase push, Communities — มีได้แค่ **ชื่อ method ใน `rpc-catalog.json`** ถ้า Telegram API รองรับ; ยังไม่มี service ที่เรียกใช้หรือ UI

`MtprotoClient.invoke` ยัง throw — transport แบบ WebK worker ยังไม่ต่อ

## Forum topic

มี job `group.manage` แล้ว — ดู [api-jobs.md](./api-jobs.md). เรียกผ่าน schema ของ `@mtproto/core` (`channels.toggleForum` / `channels.createForumTopic`). ยังไม่มีลบประวัติ topic.
