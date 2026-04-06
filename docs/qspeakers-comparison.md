# QSpeakers Feature Comparison

## What QSpeakers Does That We Don't

1. **Enclosure optimization** — 6 vented alignments (Max Flat, Bessel, Bullock, Keele-Hoge, Legendre, Zbinden) + sealed Qtc=0.707 + bandpass optimization. One-click.
2. **OpenSCAD export** — 3D box models + 2D cutting templates with wood thickness/kerf parameters
3. **Series/parallel driver wiring** (Nd scaling within a single enclosure)
4. **Slot/rectangular ports**
5. **Undo/redo**
6. **Visual driver and enclosure cross-section rendering**
7. **~1100 drivers** vs our 485 (we imported a subset of their DB)

## What We Do That QSpeakers Doesn't

1. **4 additional enclosure types** (TL, Horn, PR, Open Baffle)
2. **Crossover design** (passive + active filters, multi-way)
3. **5 additional output plots** (impedance, displacement, group delay, port velocity)
4. **Full electromechanical circuit models** (QSpeakers uses simplified polynomials)
5. **Web-based** (zero install)
6. **83 unit tests with cited equations**
7. **CLI binary for LLM optimization**

## Priority Gaps to Close

1. Vented alignment optimizer (closed-form formulas — easy to implement)
2. Slot port support
3. Undo/redo
4. OpenSCAD/SVG enclosure diagram export
