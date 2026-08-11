Pensive favicon / landing ripple / SEO patch

Changed:
1. Adds source/favicon.png (192x192) and uses it as the site favicon.
2. Landing ambient ripple frequency: after the first ripple, a new ripple appears every ~0.82-1.05 sec.
   With the 5.44 sec text lifetime this leaves about five or six overlapping ripples/texts at once.
3. Landing ripple text is now drawn dynamically from all review/article titles present in source/reviews.
   The existing no-identical-consecutive-choice rule is retained.
4. Ripple text size is 50% of the previous value and uses Poppins.
5. Home/catalog search metadata:
   Title: Pensive: 오덕겜창의 리뷰공간
   Description: 하위문화생활총망라
   Visible catalog tagline remains: 오덕겜창의 리뷰공간
6. Google/Naver verification generation and the existing 227-review build remain intact.

Apply:
- Copy/overwrite this patch into your project root.
- Run: node preview.mjs
- Verify locally, then Commit -> Push origin.

After deployment, search engines need to recrawl before the displayed title/description/favicon changes.
