# Fiber Finder

A tiny mobile-first fiber lookup tool for field work.

Choose the color code and enter the fiber number. Color codes with fewer than 12 defined colors automatically lock the tube size to the number of colors in that code. Telenor, OPGW / TIA-598 and Skanove S12 keep manual tube-size selection. The app immediately shows:

- Tube number
- Fiber color
- Position inside the tube
- Fiber range for that tube

The color-code sequences are transcribed from the supplied `fiber farge koder.xlsx` workbook.

For 24-fiber tubes, Telenor, OPGW / TIA-598 and Skanove S12 repeat positions 1–12 for positions 13–24 and mark the second set with three black stripes (`///`). If the repeated color is Black, the second-range fiber is displayed as blank/white with `///` so the identification stripes remain visible.

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
