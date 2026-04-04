# Album Cover Demo Specs

## Prompt

Create a 1500x1500 Spotify-style album cover. Here's the exact sequence:

1. Create a 1500x1500 document with background color #0a0014
2. Apply noise filter to the background with amount 25
3. Add a new layer called "Purple Glow"
4. Apply a linear gradient to "Purple Glow" with colors ["#1a0033", "#4a0080", "#cc00ff", "#4a0080", "#1a0033"] at angle 90
5. Set "Purple Glow" layer to opacity 50, blend mode screen
6. Add a rectangle shape at x:200 y:600 width:1100 height:300, fill color #cc00ff, name it "Light Streak 1"
7. Apply gaussian blur to "Light Streak 1" with radius 80
8. Set "Light Streak 1" to opacity 40, blend mode screen
9. Add a rectangle shape at x:400 y:300 width:700 height:200, fill color #7700cc, name it "Light Streak 2"
10. Apply motion blur to "Light Streak 2" with angle 30, distance 120
11. Set "Light Streak 2" to opacity 35, blend mode color-dodge
12. Load a custom font from https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2
13. Add text "1337" centered at x:750 y:620, font PressStart2P-Regular, size 160, color #e600ff
14. Add text "DESIGN" centered at x:750 y:790, font PressStart2P-Regular, size 80, color #ffffff
15. Duplicate the "1337" text layer, name the copy "1337 Glow"
16. Rasterize "1337 Glow" using run_script: `var doc=app.activeDocument;doc.layers.getByName('1337 Glow').rasterize(RasterizeType.ENTIRELAYER);app.echoToOE('ok');`
17. Select layer "1337 Glow" and apply gaussian blur with radius 50
18. Set "1337 Glow" to blend mode screen, opacity 90
19. Add a solid fill layer color #808080, name it "Noise Overlay"
20. Apply noise filter to "Noise Overlay" with amount 40
21. Set "Noise Overlay" to blend mode overlay, opacity 20
22. Export as PNG to ~/Desktop/album-cover.png

## Important Notes

- Text layers will be renamed by Photopea to "Layer 1", "Layer 2" etc. After adding text, use `get_layers` to find the actual names before duplicating.
- The font loads as a separate document. Use `load_font` tool which handles switching back to the active document automatically.
- Do NOT use `reorder_layer` -- it causes the Photopea UI to hang. Create layers in the correct order instead.
- After duplicating a layer, select it before applying filters.
- Execute steps one at a time, not in parallel.

## Tools Showcased

- `create_document` -- canvas setup
- `apply_filter` -- noise, gaussian blur, motion blur
- `add_layer` -- empty layer for gradient
- `add_gradient` -- linear gradient with multiple color stops
- `set_layer_properties` -- opacity, blend modes (screen, color-dodge, overlay)
- `add_shape` -- rectangles for light streaks
- `load_font` -- custom Google Font loading
- `add_text` -- text with custom font
- `duplicate_layer` -- clone for glow effect
- `run_script` -- rasterize text layer
- `select_layer` -- target specific layer
- `add_fill_layer` -- solid color for noise overlay
- `export_image` -- final PNG export
