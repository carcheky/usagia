"""Genera los iconos de la bandeja (PNG) y el icono de la app (ICO).

Uso:
    python scripts/make-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

SIZE = 64
COLORS = {
    "ok": (62, 207, 142, 255),
    "warn": (240, 180, 41, 255),
    "crit": (239, 83, 80, 255),
    "idle": (140, 150, 165, 255),
}

SS = 8  # supermuestreo para que los bordes queden limpios


def gauge(color, fill_ratio=0.72):
    """Arco de indicador con aguja: representa la cuota restante."""
    big = Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    m = 4 * SS
    box = [m, m, SIZE * SS - m, SIZE * SS - m]
    d.arc(box, start=135, end=405, fill=color, width=4 * SS)

    cx = cy = SIZE * SS / 2
    radius = (SIZE * SS - 2 * m) / 2
    import math

    angle = math.radians(135 + 270 * fill_ratio)
    x = cx + radius * math.cos(angle)
    y = cy + radius * math.sin(angle)
    d.line([(cx, cy), (x, y)], fill=color, width=3 * SS)
    d.ellipse(
        [cx - 3 * SS, cy - 3 * SS, cx + 3 * SS, cy + 3 * SS], fill=color
    )

    return big.resize((SIZE, SIZE), Image.LANCZOS)


def template():
    """Versión monocroma para macOS (setTemplateImage)."""
    img = gauge((0, 0, 0, 255), fill_ratio=0.72)
    alpha = img.getchannel("A")
    black = Image.new("RGBA", img.size, (0, 0, 0, 255))
    black.putalpha(alpha)
    return black


def main():
    for name, color in COLORS.items():
        img = gauge(color)
        img.save(ASSETS / f"tray-{name}.png")
        print(f"assets/tray-{name}.png")

    template().save(ASSETS / "trayTemplate.png")
    print("assets/trayTemplate.png")

    # Icono grande de la aplicación (y .ico para electron-builder).
    app_icon = gauge(COLORS["ok"], fill_ratio=0.72).resize((256, 256), Image.LANCZOS)
    app_icon.save(ASSETS / "icon.png")
    app_icon.save(
        ASSETS / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("assets/icon.png + assets/icon.ico")


if __name__ == "__main__":
    main()
