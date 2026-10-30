import asyncio
import json
import sys

import edge_tts


def main():
    try:
        cfg = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"error": "bad input: " + str(e)}))
        return
    text = (cfg.get("text") or "").strip()
    if not text:
        print(json.dumps({"error": "empty text"}))
        return
    voice = cfg.get("voice") or "zh-CN-XiaoxiaoNeural"
    rate = cfg.get("rate") or "+0%"
    pitch = cfg.get("pitch") or "+0Hz"
    volume = cfg.get("volume") or "+0%"
    out = cfg.get("out")
    if not out:
        print(json.dumps({"error": "no output path"}))
        return

    async def run():
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume=volume)
        await communicate.save(out)

    try:
        asyncio.run(run())
        print(json.dumps({"ok": True, "out": out}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))


if __name__ == "__main__":
    main()
