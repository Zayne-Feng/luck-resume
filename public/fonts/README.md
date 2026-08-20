# Resume fonts

Four local families are available: Noto Sans SC, Noto Serif SC, LXGW WenKai TC
and ZCOOL XiaoWei. WenKai TC and XiaoWei use their unmodified regular outlines,
compressed from the official Google Fonts TTF distribution into WOFF2. Their
copyright metadata remains intact. Complete redistribution licenses are
`wenkai-OFL.txt` and `xiaowei-OFL.txt`. Browsers synthesize bold weights.

The additional sources are pinned to Google Fonts commit
`29b4ec6df2522a8aee279414b78a07910b065874`, under `ofl/lxgwwenkaitc/` and
`ofl/zcoolxiaowei/`. `additional-fonts.json` records source links, source
SHA-256 values, generated file sizes, Unicode mappings and output SHA-256.
Downloaded TTF files were checked against the pinned repository Git blob IDs
before compression. No characters were removed.

The local sans and serif fonts are derived from the official Google Fonts distribution of
Noto Sans SC and Noto Serif SC. Both are licensed under the SIL Open Font License
1.1. Their original copyright notices and complete license texts are distributed
as `sans-OFL.txt` and `serif-OFL.txt`.

## Sources

- Noto Sans SC: [`google/fonts` at `a85815a42757630ce188fdad368c2dfc444d4773`](https://github.com/google/fonts/tree/a85815a42757630ce188fdad368c2dfc444d4773/ofl/notosanssc).
  Source file: `NotoSansSC[wght].ttf`.
- Noto Serif SC: [`google/fonts` at `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`](https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notoserifsc).
  Source file: `NotoSerifSC[wght].ttf`.

## Transformation

`fontTools` 4.61.1 instantiated the variable `wght` axis at 400, then encoded
the result as WOFF2 using Brotli 1.2.1. No Unicode characters were removed.
Original family and copyright metadata are retained. The CSS families are
`Luck Sans` and `Luck Serif`. Browsers synthesize weight 600 from weight 400.

| File               |     Bytes | Unicode mappings | SHA-256                                                            |
| ------------------ | --------: | ---------------: | ------------------------------------------------------------------ |
| `luck-sans.woff2`  | 4,192,988 |           30,890 | `81047a04b1184a406a48b02fba3467d26eddb2f8aa8cbe3efe9e22b7d540cf20` |
| `luck-serif.woff2` | 5,733,160 |           30,928 | `596129b293ce16e6b83b95e110d33e1686a12caf55d8cc27a560816bc88f6c8f` |

The transformation is reproducible with Python and `fonttools[woff]`:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = TTFont("NotoSansSC[wght].ttf")
instantiateVariableFont(font, {"wght": 400}, inplace=True)
font.flavor = "woff2"
font.save("luck-sans.woff2")
```

Apply the same conversion to `NotoSerifSC[wght].ttf` to create
`luck-serif.woff2`. The source variable TTF files are not required at runtime.

## Loading

The `@font-face` declarations in `src/styles/fonts.css` use only local `/fonts/`
URLs. Before measuring or printing a resume, await
`ensureResumeFont("sans")` or `ensureResumeFont("serif")` from
`src/resume/fonts.ts`. It loads the requested family at weights 400 and 600 and
waits for `document.fonts.ready`. Missing font registration and font download
failures reject the returned promise.
