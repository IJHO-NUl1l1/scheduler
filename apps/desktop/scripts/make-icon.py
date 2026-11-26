"""
앱 아이콘 만들기: 부드러운 짙은 회색 둥근 사각형 위에 마크다운 할 일 체크박스 `[x]`
(일정을 md 파일의 `- [x]` 줄로 저장하는 이 앱의 특징). 크림색 대괄호 + 흙빛 주황 체크.
작은 크기(16·24px)는 선을 더 굵고 크게 한 모양으로 따로 그린다.
아이콘을 바꿀 때는 이 파일만 고치고 `pnpm icon`: 창·작업 표시줄·트레이와 설치 파일(exe·바로가기·탐색기)이 모두 여기서 나온 파일을 쓴다.

실행: python apps/desktop/scripts/make-icon.py   (Pillow 필요)
결과:
  apps/desktop/build/icon.ico        설치 파일·exe 아이콘 (16~256 여러 크기)
  apps/desktop/build/icon.png        512px 원본
  apps/desktop/resources/icon.png    창·작업 표시줄 아이콘 (256px)
  apps/desktop/resources/tray.png    트레이 (32px, 작은 모양)
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
S = 1024  # 그리는 크기 (줄일 때 부드럽게)

BG_TOP = (60, 58, 54)
BG_BOTTOM = (36, 35, 33)
MARK = (236, 231, 221)  # 크림색 대괄호
CHECK = (214, 150, 124)  # 흙빛 주황 체크 (앱 강조색을 차분하게)


def background(img: Image.Image) -> None:
    """둥근 사각형 + 위에서 아래로 어두워지는 그라데이션"""
    grad = Image.new('RGB', (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        t = y / (S - 1)
        gd.line([(0, y), (S, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
    img.paste(grad, (0, 0), mask)


def check(d: ImageDraw.ImageDraw, pts: list[tuple[float, float]], w: int, color) -> None:
    """끝이 둥근 체크 표시"""
    d.line(pts, fill=color, width=w, joint='curve')
    r = w / 2
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def bracket(d: ImageDraw.ImageDraw, x: float, top: float, bottom: float, arm: float, w: int) -> None:
    """[ 또는 ] : arm이 양수면 오른쪽으로 팔이 나온 '[', 음수면 ']'"""
    check(d, [(x + arm, top), (x, top), (x, bottom), (x + arm, bottom)], w, MARK)


def draw(w: int, top: float, bottom: float, left: float, right: float, arm: float, pts: list[tuple[float, float]]) -> Image.Image:
    """마크다운 할 일 체크박스 [x] 모양: 대괄호 안에 체크"""
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    background(img)
    d = ImageDraw.Draw(img)
    bracket(d, left, top, bottom, arm, w)
    bracket(d, right, top, bottom, -arm, w)
    check(d, pts, w, CHECK)
    return img


def draw_full() -> Image.Image:
    return draw(78, 262, 762, 236, 788, 92, [(396, 520), (474, 598), (630, 430)])


def draw_small() -> Image.Image:
    """16·24px용: 선을 굵게, 크게"""
    return draw(132, 200, 824, 176, 848, 110, [(368, 524), (470, 626), (660, 410)])


def main() -> None:
    full = draw_full()
    small = draw_small()
    sized = lambda im, n: im.resize((n, n), Image.LANCZOS)
    (ROOT / 'build').mkdir(exist_ok=True)
    (ROOT / 'resources').mkdir(exist_ok=True)
    sized(full, 512).save(ROOT / 'build' / 'icon.png')
    sized(full, 256).save(ROOT / 'resources' / 'icon.png')
    sized(small, 32).save(ROOT / 'resources' / 'tray.png')
    # .ico: 작은 크기는 단순한 모양, 큰 크기는 원래 모양
    frames = [sized(small, n) for n in (16, 24)] + [sized(full, n) for n in (32, 48, 64, 128, 256)]
    frames[-1].save(ROOT / 'build' / 'icon.ico', format='ICO', sizes=[f.size for f in frames], append_images=frames[:-1])
    # 미리보기 (확인용)
    prev = Image.new('RGBA', (16 + 24 + 32 + 48 + 64 + 128 + 256 + 8 * 8, 256), (40, 40, 40, 255))
    x = 8
    for f in frames:
        prev.paste(f, (x, 256 - f.size[1]), f)
        x += f.size[0] + 8
    prev.save(ROOT / 'build' / 'icon-preview.png')
    print('ok')


if __name__ == '__main__':
    main()
