Scriptorium card/ripple/image filename patch

Overwrite the project root with this patch.
Then run:
  node preview.mjs

Changes:
- Removes duplicate titles from card image-frame on catalog and article carousel.
- Ripple words use transparent fill + outline, Gowun Batang, and 5.44s duration (20% shorter than 6.8s).
- Each of the 44 reviews now references its own JPG file in source/images/.
- The 44 JPG files are currently copies of the old temp.jpg placeholder; replace them one-by-one later without editing Markdown.
- IMAGE-FILENAMES.txt contains the title -> filename mapping.
