# Generates the app icons. Run: python make_icons.py
from PIL import Image, ImageDraw

S = 1024
img = Image.new("RGB", (S, S), "#6c5ce7")
d = ImageDraw.Draw(img)
# clipboard
d.rounded_rectangle((232, 200, 792, 860), radius=70, fill="white")
d.rounded_rectangle((392, 150, 632, 260), radius=40, fill="#fdcb6e")
rows = [(340, True), (500, True), (660, False)]
for y, done in rows:
    box = (300, y - 50, 400, y + 50)
    if done:
        d.rounded_rectangle(box, radius=22, fill="#00b894")
        d.line([(318, y), (343, y + 26), (384, y - 26)], fill="white", width=22, joint="curve")
    else:
        d.rounded_rectangle(box, radius=22, outline="#b2bec3", width=14)
    d.rounded_rectangle((440, y - 18, 720, y + 18), radius=18, fill="#dfe6e9")

for size, name in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
    img.resize((size, size), Image.LANCZOS).save(f"icons/{name}")
print("ok")
