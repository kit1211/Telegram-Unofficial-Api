# Dump / invite สมาชิกกลุ่ม (CSV)

**API (แนะนำ):** `POST /v1/jobs` `{ "type": "member.dump", "params": { "username": "example_channel" } }` → poll `GET /v1/jobs/:id` → `GET /v1/jobs/:id/members.csv` (ต้องรัน `bun run dev:worker` + Redis). ดู [api-jobs.md](./api-jobs.md)

สคริปต์ (legacy): `scripts/group-members-csv.ts` · `bun run group:dump-csv` / `group:invite-csv`

RPC หลัก: [channels.getParticipants](https://core.telegram.org/method/channels.getParticipants) · [channels.inviteToChannel](https://core.telegram.org/method/channels.inviteToChannel)

---

## Dump — “ครั้งละกี่คน” vs “ติด limit”

### ต่อ 1 ครั้งเรียก API (`limit`)

| ค่า | ใน repo | ความหมาย |
|-----|---------|----------|
| **`limit`** | **200** (`PAGE`) | สูงสุดที่ขอต่อ 1 RPC |
| **ได้กลับมาจริง (กลุ่มใหญ่, ทดสอบ local)** | **201 แล้ว 200** | หน้าแรกของ `Recent` / search ว่างได้ **201** คน ทั้งที่ขอ 200; หน้าถัดไปได้ **200** |
| **หน่วงระหว่างหน้า** | **1000 ms** (`PAGE_DELAY_MS`) | ถือล็อกบัญชีระหว่างพัก — บัญชีหนึ่งดึงแล้วพัก 1 วิ ก่อน RPC ถัดไป |
| **`FLOOD_WAIT_N`** | sleep **N+1 s** แล้ว retry | จำกัดที่ **อัตรา RPC ต่อบัญชี** ไม่ใช่ “ดึงได้แค่ N คนแล้วหยุดถาวร” |

เอกสาร Telegram เรื่อง pagination: [offsets](https://core.telegram.org/api/offsets) — `channels.getParticipants` ใช้ `offset` + `limit` แบบง่าย

### ต่อ 1 filter (เพดานรายการ ไม่ใช่ต่อ RPC)

Telegram **ไม่คืนรายชื่อครบทุกคน** ถ้าไล่ filter เดียวยาว ๆ:

| ประเภท / filter | เพดานที่ community มักเจอ | หมายเหตุ |
|-----------------|----------------------------|----------|
| Supergroup + filter เดียว (เช่น `Recent`) | **~10,000** คน | หลัง offset ใกล้ 10k มักไม่มี user ใหม่ ([gram.js #101](https://github.com/gram-js/gramjs/issues/101)) |
| Channel (broadcast) บางกลุ่มใหญ่ | **~200** | ขึ้นกับ server-side ([SO / WTelegramClient](https://stackoverflow.com/questions/70256092/get-all-participants-of-a-channel-using-wtelgramclient-only-returning-200)) |

**ใน repo:** หลัง `channelParticipantsRecent` ถ้า unique `< 95%` ของ `participants_count` → รอบ **`channelParticipantsSearch`** ทีละตัวอักษร (a–z, 0–9, `_`, ไทย) เพื่อรวม unique ข้ามเพดาน ~10k/filter

### เงื่อนไขก่อน dump

- ต้อง **join** กลุ่มแล้ว (`CHANNEL_PRIVATE` ถ้าไม่ได้อยู่ในกลุ่ม — job จะ `channels.joinChannel` แล้วลองใหม่ครั้งเดียว)
- `channels.getFullChannel` → **`can_view_participants !== false`**
- **`access_hash` ผูกกับบัญชี** — ห้ามเอา hash จากบัญชี A ไปเรียกด้วยบัญชี B จะได้ `CHANNEL_INVALID` ทันที filter ของแต่ละบัญชีต้อง `contacts.resolveUsername` เอง
- RPC error จาก `@mtproto/core` เป็น object `{ error_message }` ไม่มี `.message` — worker ต้อง log `error_message` ไม่งั้นขึ้น `failed: undefined`
- CSV: `user_id`, `access_hash`, `username`, ชื่อ, `is_bot` — **ไม่ได้เบอร์โทร** ทั่วไป
- ไฟล์ output: gitignore `/data/`, `*.members.csv`

---

## ผลทดสอบจริง (session local)

| ประเภทกลุ่ม | สมาชิก (reported) | แถว unique ใน CSV | สรุป |
|-------------|-------------------|-------------------|------|
| กลุ่มขนาดกลาง (~750) | ~747 | **~746** | pagination + recent พอ — ไม่ต้อง search pass |
| กลุ่มใหญ่ (~21k) | ~21,066 | **~20,728** | สองบัญชี, 74/74 filter, 0 failed — **~98%**; หน้าที่ขอ 200 ได้ 201 แล้ว 200; `recent` / `search:_` ชนเพดาน ~10,002 |

สคริปต์เดี่ยวรอบก่อนได้ ~63% เพราะไล่ filter ไม่ครบเท่าคิวสองบัญชี

Resume: ถ้ามี CSV อยู่แล้ว สคริปต์โหลด `user_id` เดิมแล้ว merge ต่อ

---

## Invite จาก CSV — limit แยกจาก dump

Dump กับ invite **คนละ bucket**:

| พารามิเตอร์ (default) | ค่า | ความหมาย |
|-------------------------|-----|----------|
| `--batch` | **5** | user ต่อ 1 ครั้ง `channels.inviteToChannel` — supergroup สูงสุด **20**/ครั้ง (TDLib), broadcast channel สูงสุด **100**/ครั้ง; เกินแล้ว `USERS_TOO_MUCH` |
| `--limit` | **10** | จำนวนแถวสูงสุดจาก CSV ต่อรัน |
| `--delay-ms` | **2000** | หน่วงระหว่าง batch |
| API `offset` | **0** | ข้าม N แถวแรกของ CSV (Mac branch) |

เป้าหมาย invite รองรับ **ลิงก์เชิญ** (`+hash`) ไม่ใช่แค่ public username

Error ที่หยุดรัน invite:

- **`PEER_FLOOD`** — anti-spam บัญชี (เชิญคนแปลกหน้า / bulk). ทดสอบ local: หยุดหลัง **~10** คนในรอบเดียว แล้วคิวต่ออีก ~1 ชม. ลด `delayMs` หรือเพิ่ม `batch` ไม่ยกเพดานนี้ — เพดานนับคนต่อบัญชีต่อรอบ
- **`FLOOD_WAIT_*`** — requeue job ด้วย delay (ไม่ block worker)

`access_hash` ใน CSV **ผูกกับบัญชีที่ dump** — ข้ามบัญชีต้อง resolve จาก username หรือ dump ใหม่ด้วยบัญชีที่เชิญ; cache `job:{id}:invite-hash:{accountId}`

---

## สรุปสั้น (ตอบ “dump ได้ครั้งละกี่คน ถึงติด limit”)

1. **ต่อครั้งเรียก API:** ขอ **200** คน/ครั้ง; กลุ่มใหญ่หน้าแรกได้ **201** หน้าถัดไป **200**; โดน **`FLOOD_WAIT`** = เร็วเกิน → รอแล้ว retry
2. **ต่อ filter / กลุ่มใหญ่:** มักได้สูงสุด **~10k** ต่อ filter → ต้อง **search แยก** ถึงจะเก็บ unique เพิ่ม (ยังไม่ครบ 100% ถ้าเซิร์ฟเวอร์รายงาน ~21k)
3. **Invite:** default **5 คน/batch**, **10 คน/รัน** — limit หลักคือ **`PEER_FLOOD`** ไม่ใช่ตัวเลขใน CSV. Broadcast channel บังคับเพิ่มได้แค่ **200 คนแรก** หลังจากนั้นเข้าได้ทางลิงก์เท่านั้น ([FAQ](https://telegram.org/faq_channels/)). บอทเรียก `channels.inviteToChannel` ไม่ได้ (เอกสารระบุเฉพาะผู้ใช้) — บอททำได้แค่ลิงก์เชิญหรืออนุมัติคนที่ขอเข้าเอง
