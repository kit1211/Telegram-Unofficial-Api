# MyTelegram (loyldg) — อ้างอิงเทียบโปรเจกต์นี้

[MyTelegram](https://github.com/loyldg/mytelegram) = **self-hosted MTProto server (C#)** ไม่ใช่ client ไป Telegram จริง — โปรเจกต์เรา reverse **WebK + `@mtproto/core` → production DC**

## สิ่งที่เอามาใช้ได้

| แหล่ง | ใช้ทำอะไร |
|--------|-----------|
| `MyTelegram.Schema` (LatestLayer) | ยืนยัน constructor/method id passkey เช่น `auth.initPasskeyLogin` `0x518ad0b7`, `auth.finishPasskeyLogin` `0x9857ad07` |
| [mytelegram-webk](https://github.com/loyldg/mytelegram-webk) | flow client: `PasskeyLoginButton`, `getInputPasskeyCredential`, `SignQRCard` poll `auth.exportLoginToken` |

## Passkey บน MyTelegram server (OSS)

ใน `source/src/MyTelegram.Messenger/Handlers/LatestLayer/Auth/`:

- `InitPasskeyLoginHandler` / `FinishPasskeyLoginHandler` → **`throw new NotImplementedException()`**
- README ระบุ **Passkey Login = Pro** (เหมือน E2E, Stories, …)

OSS มีแค่ **TL stub + handler เปล่า** — ไม่มี logic ให้ reverse ฝั่ง server

## Passkey บน client (mytelegram-webk)

จาก `passkeyLoginButton.tsx`:

1. `initPasskeyLogin` → เก็บ `options.data` (JSON มี `publicKey`)
2. `navigator.credentials.get` + `PublicKeyCredential.parseRequestOptionsFromJSON`
3. แปลง credential → `inputPasskeyCredentialPublicKey` (`getInputPasskeyResponse.ts`)
4. แยก `user_handle` เป็น `dcId:userId` → `finishPasskeyLogin` บน DC ผู้ใช้ (ส่ง `from_dc_id` / `from_auth_key_id` ถ้า migrate)

ข้อจำกัด production: RP ID `telegram.org` — WebAuthn ต้องรันบน origin ที่ Telegram ยอมรับ (มักคือ [web.telegram.org/k](https://web.telegram.org/k/)); ดู [Passkey login (core.telegram.org)](https://core.telegram.org/api/passkeys)

## “สแกน” vs passkey

- **QR login** (`SignQRCard`): loop `auth.exportLoginToken` → `tg://login?token=` + base64url — สแกนด้วยมือถือที่ล็อกอินแล้ว (Settings → Devices → Link)
- **Passkey ปุ่มแยก**: WebAuthn บนเครื่องที่มี passkey (ไม่ใช่ QR loop เดียวกัน); บนคอมบาง flow ยังให้สแกน QR ด้วยมือถือที่เก็บ passkey (เอกสารช่วยผู้ใช้)

## ช่องว่างใน repo เรา

- `@mtproto/core@6.3` มี `auth.exportLoginToken` แต่ **ไม่มี** `auth.initPasskeyLogin` / parser passkey → เรียก passkey จาก Bun ต้อง patch TL หรือใช้ layer ใหม่กว่า
- ยังไม่มี `scripts/qr-login.ts` (QR ทดสอบ RPC ผ่านแล้ว)

## POC ใน repo

`poc/mytelegram/` = clone server — อ้างอิง client QR:

- `ExportLoginTokenHandler.cs` — สร้าง token 32 byte, `QrCodeExpireSeconds`, cache authKey → `loginTokenSuccess`
- `QrCodeAggregate.cs` — `AcceptLoginToken` / expire / migrate
- Client เรา: `scripts/qr-login.ts` → Telegram จริง (`auth.exportLoginToken` loop)

## ไม่สับสน

- Deploy MyTelegram + แก้ IP ใน client fork = คนละเป้ากับ session `.telegram/` ไป **api.telegram.org**
- รายการฟีเจอร์ Pro ใน README MyTelegram ≈ checklist product — ดู [feature-gap.md](./feature-gap.md)
