const hero = document.querySelector('[data-article-hero]');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (hero && !reduceMotion) {
  let scheduled = false;
  const update = () => {
    const progress = Math.min(Math.max(scrollY / (innerHeight * .72), 0), 1);
    hero.style.opacity = `${1 - progress * .96}`;
    hero.style.transform = `scale(${1 + progress * .035})`;
    scheduled = false;
  };

  addEventListener('scroll', () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

const carousel = document.querySelector('[data-carousel]');
const current = carousel?.querySelector('[data-current-card]');

if (carousel && current) {
  requestAnimationFrame(() => {
    carousel.scrollLeft = Math.max(
      0,
      current.offsetLeft - (carousel.clientWidth - current.clientWidth) / 2,
    );
  });
}

if (carousel) {
  let activePointer = null;
  let pointerType = 'mouse';
  let axis = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;
  let momentumFrame = 0;
  let dragged = false;
  let suppressNextClick = false;
  let suppressTimer = 0;

  const cancelMomentum = () => {
    if (momentumFrame) cancelAnimationFrame(momentumFrame);
    momentumFrame = 0;
  };

  const runMomentum = () => {
    cancelMomentum();
    if (reduceMotion || Math.abs(velocity) < .025) return;

    let previous = performance.now();
    const tick = (now) => {
      const elapsed = Math.min(now - previous, 34);
      previous = now;

      const before = carousel.scrollLeft;
      carousel.scrollLeft -= velocity * elapsed;
      const friction = pointerType === 'touch' ? .982 : .968;
      velocity *= Math.pow(friction, elapsed / 16.67);

      const atBoundary = carousel.scrollLeft === before;
      if (Math.abs(velocity) < .012 || atBoundary) {
        momentumFrame = 0;
        return;
      }

      momentumFrame = requestAnimationFrame(tick);
    };

    momentumFrame = requestAnimationFrame(tick);
  };

  const suppressClickOnce = () => {
    suppressNextClick = true;
    clearTimeout(suppressTimer);
    suppressTimer = setTimeout(() => {
      suppressNextClick = false;
    }, 700);
  };

  const finishPointer = (event, useMomentum = false) => {
    if (activePointer === null) return;
    if (event?.pointerId != null && event.pointerId !== activePointer) return;

    const pointerToRelease = activePointer;
    const horizontal = axis === 'horizontal';
    const moved = dragged;

    activePointer = null;
    axis = null;
    dragged = false;
    carousel.classList.remove('is-pointer-down', 'is-dragging');

    try {
      if (carousel.hasPointerCapture(pointerToRelease)) {
        carousel.releasePointerCapture(pointerToRelease);
      }
    } catch {}

    if (moved) suppressClickOnce();

    if (horizontal && useMomentum) {
      const releaseBoost = pointerType === 'touch'
        ? 4.4
        : pointerType === 'pen'
          ? 2.2
          : 1.45;
      const maxVelocity = pointerType === 'touch' ? 4.8 : 3.2;
      velocity = Math.max(-maxVelocity, Math.min(maxVelocity, velocity * releaseBoost));
      runMomentum();
    }
  };

  carousel.addEventListener('dragstart', (event) => event.preventDefault());

  carousel.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    cancelMomentum();
    activePointer = event.pointerId;
    pointerType = event.pointerType || 'mouse';
    axis = null;
    dragged = false;
    startX = lastX = event.clientX;
    startY = lastY = event.clientY;
    lastTime = event.timeStamp;
    velocity = 0;
    carousel.classList.add('is-pointer-down');

    // Touch/pen need immediate capture so links/images inside cards cannot
    // hand the gesture back to the browser. Mouse clicks must remain native:
    // capture only after a real horizontal drag has started.
    if (pointerType !== 'mouse') {
      try { carousel.setPointerCapture(event.pointerId); } catch {}
    }
  }, true);

  carousel.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointer) return;

    const totalX = event.clientX - startX;
    const totalY = event.clientY - startY;

    if (axis === null) {
      const threshold = pointerType === 'mouse' ? 8 : 4;
      if (Math.hypot(totalX, totalY) < threshold) return;

      axis = Math.abs(totalX) >= Math.abs(totalY) * .9 ? 'horizontal' : 'vertical';

      if (axis === 'horizontal') {
        dragged = true;
        carousel.classList.add('is-dragging');

        // On desktop, only take ownership once this is unmistakably a drag.
        // A normal click therefore stays targeted at the <a> card.
        if (pointerType === 'mouse') {
          try { carousel.setPointerCapture(event.pointerId); } catch {}
        }
      }
    }

    const stepX = event.clientX - lastX;
    const stepY = event.clientY - lastY;
    const elapsed = Math.max(event.timeStamp - lastTime, 1);

    if (axis === 'horizontal' || pointerType !== 'mouse') {
      event.preventDefault();
    }

    if (axis === 'horizontal') {
      const dragGain = pointerType === 'touch' ? 1.24 : 1;
      const movedX = stepX * dragGain;
      const instantVelocity = movedX / elapsed;
      carousel.scrollLeft -= movedX;
      velocity = velocity * .22 + instantVelocity * .78;
    } else if (pointerType !== 'mouse') {
      // touch-action:none keeps the card from cancelling the pointer. Restore
      // normal page scrolling manually when the gesture is predominantly vertical.
      window.scrollBy(0, -stepY);
      velocity = 0;
    }

    lastX = event.clientX;
    lastY = event.clientY;
    lastTime = event.timeStamp;
  }, { passive: false, capture: true });

  carousel.addEventListener('pointerup', (event) => finishPointer(event, true), true);
  carousel.addEventListener('pointercancel', (event) => finishPointer(event, false), true);
  carousel.addEventListener('lostpointercapture', (event) => finishPointer(event, false));

  carousel.addEventListener('click', (event) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    clearTimeout(suppressTimer);
    event.preventDefault();
    event.stopPropagation();
  }, true);
}

const protectedCopy = document.querySelector('[data-protected-copy]');
if (protectedCopy) {
  const notice = document.createElement('div');
  notice.className = 'copy-blocked-notice';
  notice.textContent = '본문 복사는 지원하지 않습니다.';
  document.body.append(notice);
  let noticeTimer = 0;

  const showNotice = () => {
    clearTimeout(noticeTimer);
    notice.classList.add('is-visible');
    noticeTimer = setTimeout(() => notice.classList.remove('is-visible'), 1500);
  };

  for (const type of ['copy', 'cut', 'contextmenu', 'dragstart']) {
    protectedCopy.addEventListener(type, (event) => {
      event.preventDefault();
      showNotice();
    });
  }

  protectedCopy.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && ['c', 'x', 'a'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      showNotice();
    }
  });
}

const sharePanel = document.querySelector('[data-share-panel]');
if (sharePanel) {
  const title = sharePanel.dataset.shareTitle || document.title;
  const text = sharePanel.dataset.shareText || '';
  const status = sharePanel.querySelector('[data-share-status]');
  const systemButton = sharePanel.querySelector('[data-share="system"]');

  if (!navigator.share && systemButton) systemButton.hidden = true;

  const setStatus = (message) => {
    if (!status) return;
    status.textContent = message;
    clearTimeout(setStatus.timer);
    setStatus.timer = setTimeout(() => { status.textContent = ''; }, 2200);
  };

  const popup = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer,width=680,height=720');
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
    } catch {
      const input = document.createElement('textarea');
      input.value = location.href;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.append(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setStatus('링크를 복사했습니다.');
  };

  sharePanel.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-share]');
    if (!button) return;

    const channel = button.dataset.share;
    const url = location.href;
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    if (channel === 'system') {
      try {
        await navigator.share({ title, text, url });
      } catch (error) {
        if (error?.name !== 'AbortError') setStatus('공유 창을 열지 못했습니다.');
      }
      return;
    }

    if (channel === 'copy') {
      await copyUrl();
      return;
    }

    if (channel === 'x') {
      popup(`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`);
    } else if (channel === 'facebook') {
      popup(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`);
    } else if (channel === 'bluesky') {
      popup(`https://bsky.app/intent/compose?text=${encodeURIComponent(`${title}\n${url}`)}`);
    }
  });
}
