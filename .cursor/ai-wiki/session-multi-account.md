# Multi-account MTProto session (SQLite)

โฟลเดอร์ **`.telegram/`** (gitignore ทั้งหมด):

| โฟลเดอร์ | ไฟล์ |
|----------|------|
| `pending/` | `login-pending.json` — OTP ค้างระหว่าง login |
| `legacy/` | `session` — configstore JSON เก่า (import ครั้งเดียว) |
| `sqlite/` | `session.sqlite` — **หลายบัญชี** ใน DB เดียว |
| `sqlite/accounts/` | `{accountId}.sqlite` — ไฟล์แยกก่อน `session:import` |

ไฟล์ session เก่าที่ repo root จะถูกย้ายอัตโนมัติเมื่อเปิด DB (`ensureTelegramDataLayout`)

## Schema

- `mtproto_session_kv(account_id, key, value)` — คีย์ `@mtproto/core` แยกตามบัญชี
- `telegram_accounts` — metadata: phone, user_id, display_name, `is_default`

Migration อัตโนมัติ: KV รุ่นเก่า (ไม่มี `account_id`) → ย้ายเข้า slot **`default`**

## เลือกบัญชี

ลำดับความสำคัญ:

1. `--account` / `-a` บน CLI
2. `TELEGRAM_ACCOUNT`
3. `TELEGRAM_PHONE` → id จากตัวเลขเบอร์ (เช่น `15551234567`)
4. แถว `is_default` ใน `telegram_accounts`
5. `default`

## คำสั่ง

```bash
bun run login:phone --phone +15551234567    # account id = 15551234567
bun run session:list
TELEGRAM_ACCOUNT=work bun run test:profile

# ย้ายจากไฟล์ SQLite แยก (login เก่า)
bun run session:import -- --from .telegram/sqlite/accounts/15551234567.sqlite --account 15551234567
```

## Code

- `createMtprotoSession()` — `src/mtproto/client/create-session.ts`
- `MtprotoCoreSession.accountId` — slot ที่ใช้งาน
