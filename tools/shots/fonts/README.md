# Fonts for shots

`npm run shots` serves the app's two web fonts from here instead of Google Fonts, so a screenshot never depends on what the live font service sends (#37). The app itself still loads them from Google.

- `fonts.css` is what `fonts.googleapis.com` sends Microsoft Edge for the URL in `app/index.html`. Its first line records that URL (`/* Fetched for … */`). Its `url()`s still point at `fonts.gstatic.com`, and the shots tool answers each from the file of the same name here.
- Big Shoulders Display and JetBrains Mono are under the SIL Open Font License 1.1: `OFL-BigShouldersDisplay.txt`, `OFL-JetBrainsMono.txt`.

**When the app's font URL changes** (a family or weight added), a shots run fails with `font URL not in tools/shots/fonts`. Refresh the copy: fetch the new URL with an Edge user agent into `fonts.css`, put the URL in its first line, then download every `fonts.gstatic.com` file it names into this folder. A missing file fails the run with `font file not in tools/shots/fonts`.
