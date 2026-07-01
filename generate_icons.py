from PIL import Image, ImageDraw

SIZES = [16, 32, 48, 128]

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background rounded rectangle
    margin = max(1, size // 16)
    bg_color = (30, 30, 30, 255)
    border_color = (100, 100, 100, 255)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=max(2, size // 8),
        fill=bg_color,
        outline=border_color,
        width=max(1, size // 32)
    )
    
    # Page content area (left)
    left = margin + max(2, size // 16)
    top = margin + max(2, size // 16)
    right = int(size * 0.72) - margin
    bottom = size - margin - max(2, size // 16)
    
    # Draw a few content lines/blocks
    line_height = max(2, size // 16)
    gap = max(2, size // 24)
    
    # Title bar
    draw.rounded_rectangle(
        [left, top, right, top + line_height * 2],
        radius=max(1, size // 32),
        fill=(255, 204, 128, 220)
    )
    
    # Lines
    y = top + line_height * 2 + gap
    while y + line_height < bottom:
        line_width = right - left - (size // 8 if y % (line_height * 4) == 0 else 0)
        draw.rounded_rectangle(
            [left, y, left + line_width, y + line_height],
            radius=max(1, size // 48),
            fill=(255, 255, 255, 140)
        )
        y += line_height + gap
    
    # Minimap bar on the right
    bar_left = int(size * 0.75)
    bar_right = size - margin - max(2, size // 16)
    bar_color = (66, 165, 245, 200)
    draw.rounded_rectangle(
        [bar_left, top, bar_right, bottom],
        radius=max(1, size // 32),
        fill=bar_color
    )
    
    # Viewport indicator on the minimap
    vp_top = top + (bottom - top) // 4
    vp_bottom = vp_top + (bottom - top) // 3
    draw.rounded_rectangle(
        [bar_left, vp_top, bar_right, vp_bottom],
        radius=max(1, size // 32),
        fill=(255, 255, 255, 180)
    )
    
    return img

if __name__ == '__main__':
    for size in SIZES:
        icon = draw_icon(size)
        icon.save(f'icons/icon{size}.png')
        print(f'Generated icons/icon{size}.png')
