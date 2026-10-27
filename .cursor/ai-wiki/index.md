# AI Wiki — telegram-reverse

ดัชนีความรู้ถาวรของโปรเจกต์ (อัปเดตเมื่อมีข้อเท็จจริงใหม่ ไม่ใช่บันทึกแชททุกบรรทัด)

| ไฟล์ | เนื้อหา |
|------|---------|
| [project.md](./project.md) | ภาพรวม stack, โครงสร้าง, สถานะงาน |
| [session-multi-account.md](./session-multi-account.md) | SQLite หลายบัญชี, TELEGRAM_ACCOUNT |
| [auth-qr-burp.md](./auth-qr-burp.md) | Flow QR login จาก Burp + WebK bundles |
| [mytelegram-ref.md](./mytelegram-ref.md) | เทียบ loyldg/mytelegram + webk (passkey/QR, OSS vs Pro) |
| [feature-gap.md](./feature-gap.md) | เทียบฟีเจอร์ product vs สถานะ repo |
| [webk-features.md](./webk-features.md) | Reverse WebK: Reactions, Scheduled, Chatlist, Stories, Stickers, Communities, E2E |
| [group-members-dump.md](./group-members-dump.md) | Dump/invite สมาชิก CSV: limit ต่อ RPC (~200), ~10k/filter, FLOOD_WAIT |
| [api-jobs.md](./api-jobs.md) | REST `/v1/jobs` + Redis/BullMQ worker, UUID v7, multi-account dump |

## หลักการ

- เก็บเฉพาะสิ่งที่ **ยังใช้ได้ในอนาคต**: สถาปัตยกรรม, การตัดสินใจ, convention, ลิงก์, ปัญหาที่แก้แล้ว
- ไม่ซ้ำกับ `hotcache.md` (บริบทสั้น ≤500 คำ) หรือ `log.md` (บันทึกเต็มตามวัน)
