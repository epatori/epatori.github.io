# Scriptorium

개인 리뷰 아카이브용 정적 사이트입니다.

- Public URL: https://epatori.github.io/
- Local preview: `node preview.mjs`
- Build: `node build.mjs`
- GitHub Pages: `.github/workflows/pages.yml`이 `main` push마다 `site/`를 빌드·배포합니다.

## 콘텐츠 추가

리뷰 원문은 `source/reviews/*.md`, 이미지는 `source/images/`에 둡니다. `site/`는 생성물이라 Git에 커밋하지 않습니다.

## 검색엔진

빌드 시 아래 파일/메타데이터가 자동 생성됩니다.

- `sitemap.xml`
- `robots.txt`
- canonical URL
- Open Graph / Twitter Card
- `WebSite`, `CollectionPage`, `BlogPosting` JSON-LD

## 보안

`.env`, 키 파일, 토큰, 비밀번호, 개인 문서는 저장소에 넣지 마십시오. 이 저장소는 GitHub Pages 게시를 위해 공개 저장소로 사용합니다.
