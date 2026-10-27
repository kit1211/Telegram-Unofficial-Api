# QR Login — Burp + WebK bundle

อ้างอิง capture ผ่าน Burp (`127.0.0.1:39607`) กับ [Telegram Web K](https://web.telegram.org/k/) 2026-10-26

## HTTP ที่อ่านได้ใน Burp

| ลำดับ | รายการ | หมายเหตุ |
|------|--------|----------|
| 1 | `GET web.telegram.org/k/` + chunks | lazy load `mountAuthFlow-*.js`, `SignQRCard-*.js` ~21:57:48 |
| 2 | `GET telegram.me` + `t.me` `/_websync_?authed=0&version=2.2%20K` | body `true`; ลบ `stel_web_auth` ตอนยังไม่ล็อกอิน |
| 3 | `GET kws2.web.telegram.org/apiws` → **101** | `Sec-WebSocket-Protocol: binary` — MTProto (เข้ารหัสใน Burp) |
| 4 | หลังสแกน QR ~21:59:24 | `/_websync_?authed=1` + `Set-Cookie: stel_web_auth=...web.telegram.org/k/` |
| 5 | หลังล็อกอิน | WebSocket ไป `apiws_premium` (หลาย connection) |

Cookie คงที่ระหว่าง session: `stel_acid` บน `web.telegram.org`

`POST venus.web.telegram.org/apiw1` (body ว่าง) → **404** ใน capture นี้ — ไม่ใช่ channel หลักของ QR; transport จริงคือ `apiws`

## Logic ใน bundle (ไม่เห็น plaintext ใน Burp)

`SignQRCard-*.js`:

- `pushToState` → `authStateSignQr`
- loop: `auth.exportLoginToken` `{ api_id, api_hash, except_ids }`
- migrate: `auth.loginTokenMigrateTo` → `auth.importLoginToken`
- success: `auth.loginTokenSuccess` → `setUser(authorization.user)`
- QR payload: `tg://login?token=` + base64url(token)
- poll ตาม `expires`; error `AUTH_TOKEN_EXPIRED`, `SESSION_PASSWORD_NEEDED`

Worker `index.worker-*.js`: RPC names รวม `auth.exportLoginToken`, `importLoginToken`, `acceptLoginToken`, `loginTokenSuccess`

## Repo mapping

- FSM: `src/services/auth/auth-states.ts` (`authStateSignQr`)
- websync: `src/http/telegram-me/websync.ts`, `src/services/sync/telegram-me-web.ts`
- evidence: `src/reverse/evidence.ts`
