Pensive content expansion patch

Apply by copying this folder's contents into the project root and allowing overwrite.
Then run:
  node preview.mjs

Changes:
- Adds Currently Playing section between Pensive header and catalog cards.
- Currently Playing: Beast of Reincarnation / Dragon's Dogma 2.
- Both entries also belong to the 게임 filter and have 460x215 placeholder JPGs.
- 넷플릭스 filter renamed to 시리즈; legacy 넷플릭스/드라마 metadata normalizes to 시리즈.
- 소설 filter renamed to 웹소설; legacy 소설 metadata normalizes to 웹소설.
- Landing ripple NETFLIX -> SERIES and NOVEL -> WEB NOVEL.
- Adds 182 placeholder articles total:
  게임 2 / 시리즈 28 / 뮤지컬 22 / 영화 72 / 애니 46 / 웹소설 12
- Each new article has Lorem Ipsum body and its own title-based JPG placeholder.
- NEW-ARTICLES-AND-IMAGES.txt contains the full title -> markdown -> JPG mapping.

Validation:
- Build total: 226 reviews
- Missing generated image references: 0
- Beast of Reincarnation image: 460x215
- Dragon's Dogma 2 image: 460x215
