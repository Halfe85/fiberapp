# Fiber Finder

A tiny mobile-first fiber lookup tool for field work.

Choose the color code and enter the fiber number. Color systems that use the common 12-color base set allow any tube size from 1 to 24. The sequence always restarts at color 1 for every tube, so a 4-fiber tube uses only colors 1–4 before the next tube starts again at color 1. Codes with their own 6F, 8F, 12F-special or 16F sequences are automatically locked to their defined tube size. The app immediately shows:

- Tube number
- Fiber color
- Position inside the tube
- Fiber range for that tube

Use `+` between fiber numbers to look up several fibers at once. For example, `13+14` shows separate results for fiber 13 and fiber 14. Results are stacked vertically for a mobile-friendly layout.

The color-code sequences are transcribed from the supplied `fiber farge koder.xlsx` workbook.

For common 12-color systems, tube positions 13–24 repeat positions 1–12 and mark the repeated colors with three black stripes (`///`). This applies whenever a selected tube size is above 12, not only at 24 fibers. If the repeated base color is Black, that repeated fiber is displayed as blank/white with `///` so the identification stripes remain visible.

## GitHub Pages

The app is a single static `index.html` with no build step and no dependencies.

To publish it with GitHub Pages:

1. Open **Settings** in this repository.
2. Open **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select **main** and **/ (root)**.
5. Save.

The normal project Pages address will be:

`https://halfe85.github.io/fiberapp/`
