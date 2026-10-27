#!/usr/bin/env python3
"""Extract WebK feature → manager/RPC/UI map from bundles in reverse/webk/."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBK = ROOT / "reverse" / "webk"
OUT = ROOT / "src" / "reverse" / "features" / "webk-feature-map.json"
CATALOG = ROOT / "src" / "generated" / "rpc-catalog.json"


def read(name: str) -> str:
    return (WEBK / name).read_text(encoding="utf-8", errors="replace")


def main() -> None:
    worker = read("index.worker-Ccu9tVP2.js")
    index = read("index-BUtITCqw.js")
    proxy = read("apiManagerProxy-BQdxJWr5.js")
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))

    chunks = sorted(
        set(re.findall(r"\./([A-Za-z0-9_.-]+\.js)", index + proxy))
    )
    inv = set(re.findall(r"invokeApi\(`([^`]+)`", worker))
    _JS_ARRAY_OPS = frozenset(
        {"map", "forEach", "filter", "find", "length", "concat", "push", "slice"}
    )

    def is_tl_rpc(name: str) -> bool:
        if "." not in name:
            return False
        ns, method = name.split(".", 1)
        if ns == "stickers" and method == "map":
            return False
        if ns == "stories" and method in _JS_ARRAY_OPS:
            return False
        return method[0].islower()

    all_tl = {
        m
        for m in re.findall(
            r"(?:messages|stories|stickers|chatlists|communities|account|phone)\.[a-z][a-zA-Z]+",
            worker,
        )
        if is_tl_rpc(m)
    }
    all_methods = all_tl | inv

    def ui(*keywords: str) -> list[str]:
        return [c for c in chunks if any(k in c for k in keywords)]

    specs: dict[str, dict] = {
        "reactions": {
            "managers": ["appReactionsManager"],
            "pred": lambda m: "reaction" in m.lower(),
            "ui": ui("reaction"),
        },
        "scheduled": {
            "managers": ["appMessagesManager", "appDraftsManager"],
            "pred": lambda m: "scheduled" in m.lower(),
            "ui": ui("schedul"),
        },
        "chatlists": {
            "managers": ["appChatInvitesManager", "appChatsManager"],
            "pred": lambda m: m.startswith("chatlists."),
            "ui": ui("chatlist", "folder"),
        },
        "stories": {
            "managers": ["appStoriesManager"],
            "pred": lambda m: m.startswith("stories."),
            "ui": ui("story"),
        },
        "stickers": {
            "managers": ["appStickersManager"],
            "pred": lambda m: m.startswith("stickers."),
            "ui": ui("sticker"),
        },
        "communities": {
            "managers": ["appCommunitiesManager"],
            "pred": lambda m: m.startswith("communities."),
            "ui": ui("communit"),
        },
        "e2e": {
            "managers": ["appMessagesManager"],
            "pred": lambda m: "encrypt" in m.lower(),
            "ui": ui("encrypt", "secret", "passcode"),
        },
    }

    arch = {
        "worker": "index.worker-Ccu9tVP2.js — TL layer + invokeApi + *Manager",
        "main_thread": "index-BUtITCqw.js / apiManagerProxy — UI, lazy chunks, worker RPC",
    }

    out: dict = {}
    for name, spec in specs.items():
        pred = spec["pred"]
        tl = sorted(m for m in all_methods if pred(m))
        ia = sorted(m for m in inv if pred(m))
        cat: list[str] = []
        for methods in catalog["namespaces"].values():
            for m in methods:
                if pred(m):
                    cat.append(m)
        out[name] = {
            "webk_managers": spec["managers"],
            "architecture": arch,
            "ui_chunks": spec["ui"],
            "catalog_rpc": sorted(set(cat)),
            "worker_tl_literals": tl,
            "worker_invokeApi": ia,
            "notes": [],
        }

    out["scheduled"]["notes"].append(
        "สร้างข้อความตั้งเวลา: messages.sendMessage + schedule_date; "
        "RPC scheduled ใช้ list/send/delete คิว"
    )
    out["chatlists"]["notes"].append(
        "Shared folder invite = chatlists.*; UI อาจ lazy-load จาก main bundle ไม่มีชื่อ chatlist ใน chunk"
    )
    out["stickers"]["notes"].append(
        "stickers.* ฝังใน TL schema; grep invokeApi(`stickers.`) มักว่าง — เรียกผ่าน invokeApi ทั่วไป"
    )
    out["e2e"]["notes"].append(
        "Secret chat: requestEncryption → acceptEncryption → sendEncrypted*; "
        "encryptedStorageLayer = passcode/local encryption แยกจาก secret chat"
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
