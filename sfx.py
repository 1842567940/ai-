import json
import math
import random
import sys
import wave

SR = 22050


def noise(n, amt=1.0):
    return [random.uniform(-1, 1) * amt for _ in range(n)]


def lowpass(sig, alpha):
    out = []
    prev = 0.0
    for x in sig:
        prev += alpha * (x - prev)
        out.append(prev)
    return out


def highpass(sig, alpha):
    lp = lowpass(sig, alpha)
    return [x - y for x, y in zip(sig, lp)]


def sine(freq, n, amp=1.0, phase=0.0):
    w = 2 * math.pi * freq / SR
    return [math.sin(w * i + phase) * amp for i in range(n)]


def mul(a, b):
    return [x * y for x, y in zip(a, b)]


def add(dst, src, k=1.0):
    for i in range(min(len(dst), len(src))):
        dst[i] += src[i] * k
    return dst


def fade(sig, sec=0.4):
    n = len(sig)
    f = min(int(SR * sec), n // 2)
    for i in range(f):
        v = i / max(1, f)
        sig[i] *= v
        sig[n - 1 - i] *= v
    return sig


def layer_rain(n):
    base = lowpass(noise(n, 0.6), 0.10)
    out = [x * 0.35 for x in base]
    drops = int(n / SR * 7)
    for _ in range(drops):
        pos = random.randrange(0, max(1, n - 4000))
        f = random.uniform(900, 2400)
        ln = random.randint(600, 2200)
        amp = random.uniform(0.05, 0.16)
        env = [math.exp(-i / (ln * 0.28)) for i in range(ln)]
        blip = [math.sin(2 * math.pi * f * i / SR) * amp * env[i] for i in range(ln)]
        add(out, blip, 1.0)
    return out


def layer_wind(n):
    base = lowpass(noise(n, 0.7), 0.015)
    out = []
    for i, x in enumerate(base):
        t = i / SR
        mod = 0.55 + 0.45 * math.sin(2 * math.pi * 0.06 * t + 1.3)
        out.append(x * 0.55 * mod)
    return out


def layer_night(n):
    out = [0.0] * n
    chirps = int(n / SR * 1.6)
    for _ in range(chirps):
        pos = random.randrange(0, max(1, n - 8000))
        f = random.uniform(3200, 4600)
        ln = random.randint(1200, 3200)
        amp = random.uniform(0.02, 0.05)
        for i in range(ln):
            e = math.sin(math.pi * i / ln)
            out[pos + i] += math.sin(2 * math.pi * f * (i / SR) + 0.6 * math.sin(i / 90.0)) * amp * e
    hum = lowpass(noise(n, 0.4), 0.02)
    add(out, [x * 0.12 for x in hum], 1.0)
    return out


def layer_fire(n):
    out = [x * 0.15 for x in lowpass(noise(n, 0.6), 0.06)]
    cracks = int(n / SR * 9)
    for _ in range(cracks):
        pos = random.randrange(0, max(1, n - 1500))
        ln = random.randint(200, 900)
        amp = random.uniform(0.08, 0.3)
        for i in range(ln):
            out[pos + i] += random.uniform(-1, 1) * amp * math.exp(-i / (ln * 0.18))
    return out


def layer_bell(n):
    out = [0.0] * n
    step = int(SR * 5.5)
    t = 0
    while t < n:
        ln = min(int(SR * 4.5), n - t)
        for f, a in ((220, 0.22), (440, 0.12), (660, 0.05)):
            for i in range(ln):
                out[t + i] += math.sin(2 * math.pi * f * i / SR) * a * math.exp(-i / (SR * 1.2))
        t += step
    return out


def layer_drums(n):
    out = [0.0] * n
    beat = int(SR * 0.72)
    t = 0
    k = 0
    while t < n:
        ln = min(int(SR * 0.5), n - t)
        f = 48 if k % 2 == 0 else 62
        for i in range(ln):
            e = math.exp(-i / (SR * 0.09))
            out[t + i] += (math.sin(2 * math.pi * f * i / SR) * 0.5 + random.uniform(-0.12, 0.12)) * e
        t += beat
        k += 1
    return out


def layer_sea(n):
    base = lowpass(noise(n, 0.8), 0.02)
    out = []
    for i, x in enumerate(base):
        t = i / SR
        swell = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(2 * math.pi * 0.11 * t - 1.0))
        out.append(x * 0.9 * swell)
    return out


def layer_crowd(n):
    band = highpass(lowpass(noise(n, 0.7), 0.20), 0.02)
    out = []
    for i, x in enumerate(band):
        t = i / SR
        mod = 0.6 + 0.4 * math.sin(2 * math.pi * 0.23 * t) * math.sin(2 * math.pi * 0.07 * t + 0.5)
        out.append(x * 0.3 * mod)
    return out


def layer_room(n):
    out = [x * 0.05 for x in lowpass(noise(n, 0.5), 0.01)]
    add(out, sine(60, n, 0.02), 1.0)
    add(out, sine(120, n, 0.008), 1.0)
    return out


def layer_pad(n):
    out = [x * 0.05 for x in lowpass(noise(n, 0.35), 0.008)]
    add(out, sine(110, n, 0.06), 1.0)
    add(out, sine(164.8, n, 0.045, 1.1), 1.0)
    add(out, sine(220, n, 0.02, 2.3), 1.0)
    return out


KEYWORDS = [
    (('雨', 'rain', '湿', '淅沥'), layer_rain, '雨'),
    (('风', 'wind', '山', '荒野', '吹'), layer_wind, '风'),
    (('夜', '虫', '静', 'night', '月'), layer_night, '夜虫'),
    (('火', '炉', '篝火', '柴', '烧'), layer_fire, '火'),
    (('钟', '寺', '庙', 'bell', '古刹'), layer_bell, '钟'),
    (('战', '鼓', '杀', '军', 'battle', '打'), layer_drums, '战鼓'),
    (('海', '浪', '潮', 'sea', '水边', '渡口'), layer_sea, '海浪'),
    (('街', '市', '集', '人声', '酒楼', '茶馆'), layer_crowd, '市声'),
    (('屋', '室内', '房', '客栈', 'room'), layer_room, '室内'),
]


def main():
    try:
        cfg = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({'error': 'bad input: ' + str(e)}))
        return
    scene = str(cfg.get('scene') or '').strip()
    mood = str(cfg.get('mood') or '').strip()
    duration = max(5, min(45, int(float(cfg.get('duration') or 20))))
    out = cfg.get('out')
    if not out:
        print(json.dumps({'error': 'no output path'}))
        return
    n = duration * SR
    random.seed()
    layers = []
    picked = []
    for keys, fn, label in KEYWORDS:
        if any(k in scene or k in mood for k in keys):
            if label not in picked:
                picked.append(label)
                layers.append(fn(n))
    if not layers:
        picked.append('空灵底色')
        layers.append(layer_pad(n))
    mix = [0.0] * n
    w = 1.0 / len(layers)
    for L in layers:
        add(mix, L, w)
    # normalize with soft clip
    peak = max(1e-6, max(abs(x) for x in mix))
    g = 0.88 / peak
    mix = [math.tanh(x * g * 1.2) for x in mix]
    fade(mix, min(0.8, duration * 0.1))
    with wave.open(out, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, x)) * 32767)) for x in mix))
    print(json.dumps({'ok': True, 'out': out, 'layers': picked, 'duration': duration}))


if __name__ == '__main__':
    import struct
    main()
