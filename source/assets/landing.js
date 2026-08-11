const root = document.querySelector('[data-water-gate]');
let canvas = root?.querySelector('canvas');
const button = root?.querySelector('.enter-button');
const target = root?.dataset.target || 'reviews/';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const AMBIENT_WORDS = Array.isArray(window.__PENSIVE_TITLES__)
  ? window.__PENSIVE_TITLES__.filter((title) => typeof title === 'string' && title.trim())
  : [];
let lastAmbientWord = '';

function pickAmbientWord() {
  if (AMBIENT_WORDS.length <= 1) return AMBIENT_WORDS[0] || '';
  const choices = AMBIENT_WORDS.filter((word) => word !== lastAmbientWord);
  const next = choices[Math.floor(Math.random() * choices.length)];
  lastAmbientWord = next;
  return next;
}

if (root && canvas && button) {
  const cursorPrompt = document.createElement('div');
  cursorPrompt.className = 'cursor-prompt';
  cursorPrompt.setAttribute('aria-hidden', 'true');
  cursorPrompt.textContent = 'Click to Enter';

  const touchPrompt = document.createElement('div');
  touchPrompt.className = 'touch-prompt';
  touchPrompt.setAttribute('aria-hidden', 'true');
  touchPrompt.textContent = 'Touch to Enter';

  root.append(cursorPrompt, touchPrompt);

  let width = innerWidth;
  let height = innerHeight;
  let entering = false;
  let pointerInside = false;
  let lastTrailX = 0;
  let lastTrailY = 0;
  let lastTrailTime = 0;
  let ambientTimer = 0;

  function showAmbientWord(x, y) {
    const word = document.createElement('span');
    word.className = 'ambient-ripple-word';
    word.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'ambient-ripple-word__text';
    text.textContent = pickAmbientWord();
    word.append(text);

    // 큰 글자가 화면 가장자리에서 잘리지 않도록 실제 렌더링 크기를 잰 뒤
    // 파문과 텍스트의 중심 좌표를 함께 안쪽으로 보정한다.
    word.style.left = '0px';
    word.style.top = '0px';
    word.style.visibility = 'hidden';
    root.append(word);

    const bounds = word.getBoundingClientRect();
    const horizontalInset = Math.min(bounds.width / 2 + 28, width / 2 - 12);
    const verticalInset = Math.min(bounds.height / 2 + 30, height / 2 - 12);
    const safeX = Math.min(Math.max(x, horizontalInset), width - horizontalInset);
    const safeY = Math.min(Math.max(y, verticalInset), height - verticalInset);

    word.style.left = `${safeX}px`;
    word.style.top = `${safeY}px`;
    word.style.visibility = 'visible';
    word.addEventListener('animationend', () => word.remove(), { once: true });

    return { x: safeX, y: safeY };
  }

  function placeCursorPrompt(x, y) {
    const promptWidth = cursorPrompt.offsetWidth || 148;
    const promptHeight = cursorPrompt.offsetHeight || 36;
    const left = Math.min(Math.max(x + 18, 12), width - promptWidth - 12);
    const top = Math.min(Math.max(y + 16, 12), height - promptHeight - 12);

    // 보간이나 별도 속도값 없이 실제 포인터 좌표를 즉시 사용한다.
    cursorPrompt.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  function setCursorVisibility() {
    cursorPrompt.classList.toggle(
      'is-visible',
      pointerInside && finePointer.matches && !entering,
    );
  }

  function createWebGLWater() {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!gl) return null;

    const vertexSource = `#version 300 es
      in vec2 a_position;
      out vec2 v_uv;

      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const simulationSource = `#version 300 es
      precision highp float;

      uniform sampler2D u_state;
      uniform vec2 u_texel;
      uniform vec2 u_simulationSize;
      uniform vec2 u_dropPosition;
      uniform float u_dropRadius;
      uniform float u_dropStrength;
      uniform float u_damping;
      uniform int u_encoded;

      in vec2 v_uv;
      out vec4 outColor;

      vec2 decodeState(vec2 value) {
        return u_encoded == 1 ? value * 2.0 - 1.0 : value;
      }

      vec2 encodeState(vec2 value) {
        return u_encoded == 1 ? value * 0.5 + 0.5 : value;
      }

      float readHeight(vec2 uv) {
        return decodeState(texture(u_state, uv).rg).r;
      }

      void main() {
        vec2 state = decodeState(texture(u_state, v_uv).rg);
        float height = state.r;
        float velocity = state.g;

        float leftHeight = readHeight(v_uv - vec2(u_texel.x, 0.0));
        float rightHeight = readHeight(v_uv + vec2(u_texel.x, 0.0));
        float downHeight = readHeight(v_uv - vec2(0.0, u_texel.y));
        float upHeight = readHeight(v_uv + vec2(0.0, u_texel.y));

        float laplacian = leftHeight + rightHeight + downHeight + upHeight - 4.0 * height;
        velocity += laplacian * 0.285;
        velocity *= u_damping;
        height += velocity;
        height *= 0.9992;

        if (u_dropRadius > 0.0) {
          vec2 distanceInCells = (v_uv - u_dropPosition) * u_simulationSize;
          float distanceFromDrop = length(distanceInCells);
          float drop = 1.0 - smoothstep(0.0, u_dropRadius, distanceFromDrop);
          drop = 0.5 - 0.5 * cos(drop * 3.14159265);
          height += drop * u_dropStrength;
        }

        height = clamp(height, -0.96, 0.96);
        velocity = clamp(velocity, -0.96, 0.96);
        vec2 encoded = encodeState(vec2(height, velocity));
        outColor = vec4(encoded, 0.0, 1.0);
      }
    `;

    const renderSource = `#version 300 es
      precision highp float;

      uniform sampler2D u_state;
      uniform vec2 u_texel;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform int u_encoded;

      in vec2 v_uv;
      out vec4 outColor;

      vec2 decodeState(vec2 value) {
        return u_encoded == 1 ? value * 2.0 - 1.0 : value;
      }

      float readHeight(vec2 uv) {
        return decodeState(texture(u_state, uv).rg).r;
      }

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));

        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);

        for (int octave = 0; octave < 4; octave++) {
          value += noise(p) * amplitude;
          p = rotation * p * 2.03 + vec2(11.7, 6.2);
          amplitude *= 0.5;
        }

        return value;
      }

      void main() {
        float leftHeight = readHeight(v_uv - vec2(u_texel.x, 0.0));
        float rightHeight = readHeight(v_uv + vec2(u_texel.x, 0.0));
        float downHeight = readHeight(v_uv - vec2(0.0, u_texel.y));
        float upHeight = readHeight(v_uv + vec2(0.0, u_texel.y));
        float centerHeight = readHeight(v_uv);

        vec2 slope = vec2(leftHeight - rightHeight, downHeight - upHeight);
        vec3 normal = normalize(vec3(slope * 7.2, 1.0));

        float aspect = u_resolution.x / max(u_resolution.y, 1.0);
        vec2 centered = (v_uv - 0.5) * vec2(aspect, 1.0);
        vec2 refractedUv = v_uv + normal.xy * (0.018 + abs(centerHeight) * 0.013);

        float slowTime = u_time * 0.000035;
        float largePattern = fbm(refractedUv * vec2(3.2, 2.6) + vec2(slowTime, -slowTime * 0.7));
        float finePattern = fbm(refractedUv * vec2(10.0, 8.0) - vec2(slowTime * 1.7, slowTime));
        float surfacePattern = largePattern * 0.72 + finePattern * 0.28;

        float vignette = 1.0 - smoothstep(0.12, 0.92, length(centered));
        float upperGlow = smoothstep(1.0, 0.0, length((v_uv - vec2(0.46, 0.61)) * vec2(0.82, 1.0)));

        vec3 blackWater = vec3(0.027, 0.031, 0.047);
        vec3 blueWater = vec3(0.044, 0.070, 0.105);
        vec3 baseColor = mix(blackWater, blueWater, 0.16 + surfacePattern * 0.30 + upperGlow * 0.10);
        baseColor *= 0.80 + vignette * 0.20;

        vec3 lightDirection = normalize(vec3(-0.42, 0.48, 0.78));
        vec3 viewDirection = vec3(0.0, 0.0, 1.0);
        vec3 halfDirection = normalize(lightDirection + viewDirection);

        float diffuse = max(dot(normal, lightDirection), 0.0);
        float specular = pow(max(dot(normal, halfDirection), 0.0), 54.0);
        float broadSpecular = pow(max(dot(normal, halfDirection), 0.0), 13.0);
        float fresnel = pow(1.0 - clamp(normal.z, 0.0, 1.0), 2.2);
        float waveEnergy = clamp(length(slope) * 8.0 + abs(centerHeight) * 0.35, 0.0, 1.0);

        vec3 reflectionColor = vec3(0.43, 0.60, 0.76);
        vec3 highlightColor = vec3(0.80, 0.90, 0.98);

        baseColor += reflectionColor * diffuse * 0.055;
        baseColor += reflectionColor * broadSpecular * (0.09 + waveEnergy * 0.14);
        baseColor += highlightColor * specular * (0.25 + waveEnergy * 0.55);
        baseColor += reflectionColor * fresnel * 0.08;

        float trough = clamp(-centerHeight * 0.30 + dot(normal.xy, vec2(0.45, -0.35)) * 0.07, -0.10, 0.10);
        baseColor *= 1.0 + trough;

        float grain = hash21(gl_FragCoord.xy) - 0.5;
        baseColor += grain * 0.006;

        baseColor = pow(max(baseColor, 0.0), vec3(0.94));
        outColor = vec4(baseColor, 1.0);
      }
    `;

    function compileShader(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
        gl.deleteShader(shader);
        throw new Error(message);
      }

      return shader;
    }

    function createProgram(fragmentSource) {
      const program = gl.createProgram();
      const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program) || 'Unknown program link error';
        gl.deleteProgram(program);
        throw new Error(message);
      }

      return program;
    }

    let simulationProgram;
    let renderProgram;

    try {
      simulationProgram = createProgram(simulationSource);
      renderProgram = createProgram(renderSource);
    } catch (error) {
      console.warn('WebGL water shader could not start:', error);
      return null;
    }

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(simulationProgram, 'a_position');
    const renderPositionLocation = gl.getAttribLocation(renderProgram, 'a_position');
    const simulationUniforms = {
      state: gl.getUniformLocation(simulationProgram, 'u_state'),
      texel: gl.getUniformLocation(simulationProgram, 'u_texel'),
      simulationSize: gl.getUniformLocation(simulationProgram, 'u_simulationSize'),
      dropPosition: gl.getUniformLocation(simulationProgram, 'u_dropPosition'),
      dropRadius: gl.getUniformLocation(simulationProgram, 'u_dropRadius'),
      dropStrength: gl.getUniformLocation(simulationProgram, 'u_dropStrength'),
      damping: gl.getUniformLocation(simulationProgram, 'u_damping'),
      encoded: gl.getUniformLocation(simulationProgram, 'u_encoded'),
    };
    const renderUniforms = {
      state: gl.getUniformLocation(renderProgram, 'u_state'),
      texel: gl.getUniformLocation(renderProgram, 'u_texel'),
      resolution: gl.getUniformLocation(renderProgram, 'u_resolution'),
      time: gl.getUniformLocation(renderProgram, 'u_time'),
      encoded: gl.getUniformLocation(renderProgram, 'u_encoded'),
    };

    const supportsFloatTargets = Boolean(gl.getExtension('EXT_color_buffer_float'));
    const supportsFloatLinear = Boolean(gl.getExtension('OES_texture_float_linear'));
    const textureFilter = supportsFloatTargets && !supportsFloatLinear ? gl.NEAREST : gl.LINEAR;
    const encoded = supportsFloatTargets ? 0 : 1;
    const internalFormat = supportsFloatTargets ? gl.RG16F : gl.RGBA8;
    const textureFormat = supportsFloatTargets ? gl.RG : gl.RGBA;
    const textureType = supportsFloatTargets ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    let simulationWidth = 256;
    let simulationHeight = 256;
    let textures = [];
    let framebuffers = [];
    let currentTexture = 0;
    let lastFrameTime = performance.now();
    let accumulatedTime = 0;
    let animationFrame = 0;
    const drops = [];

    function bindGeometry(program, location) {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    }

    function destroySimulationTargets() {
      for (const texture of textures) gl.deleteTexture(texture);
      for (const framebuffer of framebuffers) gl.deleteFramebuffer(framebuffer);
      textures = [];
      framebuffers = [];
    }

    function createSimulationTarget() {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, textureFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, textureFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        simulationWidth,
        simulationHeight,
        0,
        textureFormat,
        textureType,
        null,
      );

      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('WebGL ripple framebuffer is incomplete.');
      }

      gl.clearColor(encoded ? 0.5 : 0.0, encoded ? 0.5 : 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture, framebuffer };
    }

    function resize() {
      width = innerWidth;
      height = innerHeight;
      const pixelRatio = Math.min(devicePixelRatio || 1, 1.75);

      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const longestSide = innerWidth < 700 ? 300 : 420;
      if (width >= height) {
        simulationWidth = longestSide;
        simulationHeight = Math.max(128, Math.round(longestSide * height / width));
      } else {
        simulationHeight = longestSide;
        simulationWidth = Math.max(128, Math.round(longestSide * width / height));
      }

      destroySimulationTargets();
      const first = createSimulationTarget();
      const second = createSimulationTarget();
      textures = [first.texture, second.texture];
      framebuffers = [first.framebuffer, second.framebuffer];
      currentTexture = 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function queueDrop(x, y, radius, strength) {
      drops.push({
        x: Math.min(Math.max(x / Math.max(width, 1), 0), 1),
        y: 1 - Math.min(Math.max(y / Math.max(height, 1), 0), 1),
        radius,
        strength,
      });
    }

    function simulateStep() {
      const sourceIndex = currentTexture;
      const targetIndex = 1 - currentTexture;
      const drop = drops.shift();

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[targetIndex]);
      gl.viewport(0, 0, simulationWidth, simulationHeight);
      bindGeometry(simulationProgram, positionLocation);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[sourceIndex]);
      gl.uniform1i(simulationUniforms.state, 0);
      gl.uniform2f(simulationUniforms.texel, 1 / simulationWidth, 1 / simulationHeight);
      gl.uniform2f(simulationUniforms.simulationSize, simulationWidth, simulationHeight);
      gl.uniform2f(simulationUniforms.dropPosition, drop?.x ?? -10, drop?.y ?? -10);
      gl.uniform1f(simulationUniforms.dropRadius, drop?.radius ?? 0);
      gl.uniform1f(simulationUniforms.dropStrength, drop?.strength ?? 0);
      gl.uniform1f(simulationUniforms.damping, 0.9865);
      gl.uniform1i(simulationUniforms.encoded, encoded);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      currentTexture = targetIndex;
    }

    function render(time) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      bindGeometry(renderProgram, renderPositionLocation);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[currentTexture]);
      gl.uniform1i(renderUniforms.state, 0);
      gl.uniform2f(renderUniforms.texel, 1 / simulationWidth, 1 / simulationHeight);
      gl.uniform2f(renderUniforms.resolution, width, height);
      gl.uniform1f(renderUniforms.time, time);
      gl.uniform1i(renderUniforms.encoded, encoded);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function frame(time) {
      const elapsed = Math.min(time - lastFrameTime, 50);
      lastFrameTime = time;
      accumulatedTime += elapsed;

      const fixedStep = 1000 / 60;
      let stepCount = 0;
      while (accumulatedTime >= fixedStep && stepCount < 3) {
        simulateStep();
        accumulatedTime -= fixedStep;
        stepCount += 1;
      }

      render(time);
      animationFrame = requestAnimationFrame(frame);
    }

    function disturbFromPointer(x, y, time) {
      if (!finePointer.matches || reduceMotion || entering) return;

      const distance = Math.hypot(x - lastTrailX, y - lastTrailY);
      if (time - lastTrailTime < 34 || distance < 16) return;

      const speed = Math.min(distance / Math.max(time - lastTrailTime, 1), 2.4);
      queueDrop(x, y, 3.8 + speed * 1.4, -0.010 - speed * 0.010);
      lastTrailX = x;
      lastTrailY = y;
      lastTrailTime = time;
    }

    function impact(x, y) {
      queueDrop(x, y, Math.max(9, Math.min(15, Math.min(width, height) * 0.018)), -0.42);
      window.setTimeout(() => {
        queueDrop(x, y, Math.max(6, Math.min(10, Math.min(width, height) * 0.012)), 0.15);
      }, 95);
    }

    resize();
    animationFrame = requestAnimationFrame(frame);

    return {
      resize,
      disturbFromPointer,
      ambient(x, y) {
        queueDrop(x, y, 5 + Math.random() * 3, -0.012 - Math.random() * 0.016);
      },
      impact,
      destroy() {
        cancelAnimationFrame(animationFrame);
        destroySimulationTargets();
        gl.deleteBuffer(positionBuffer);
        gl.deleteProgram(simulationProgram);
        gl.deleteProgram(renderProgram);
      },
    };
  }

  function createCanvasFallback() {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;

    const rings = [];
    let animationFrame = 0;

    function resize() {
      width = innerWidth;
      height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function addRipple(x, y, strength = 1) {
      rings.push({ x, y, born: performance.now(), strength });
    }

    function frame(time) {
      const gradient = context.createRadialGradient(
        width * 0.46,
        height * 0.40,
        0,
        width * 0.46,
        height * 0.40,
        Math.max(width, height),
      );
      gradient.addColorStop(0, '#0d1622');
      gradient.addColorStop(0.45, '#090d15');
      gradient.addColorStop(1, '#07080c');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      for (const ring of rings) {
        const age = time - ring.born;
        const progress = Math.min(age / 1900, 1);
        const alpha = Math.pow(1 - progress, 1.6) * ring.strength;
        const radius = 8 + progress * Math.max(width, height) * 0.45;

        context.save();
        context.globalCompositeOperation = 'screen';
        context.filter = 'blur(4px)';
        context.strokeStyle = `rgba(148, 190, 224, ${alpha * 0.22})`;
        context.lineWidth = 8;
        context.beginPath();
        context.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
        context.stroke();
        context.filter = 'none';
        context.strokeStyle = `rgba(216, 236, 249, ${alpha * 0.42})`;
        context.lineWidth = 1.1;
        context.beginPath();
        context.arc(ring.x, ring.y, radius - 3, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }

      for (let index = rings.length - 1; index >= 0; index -= 1) {
        if (time - rings[index].born > 1900) rings.splice(index, 1);
      }

      animationFrame = requestAnimationFrame(frame);
    }

    resize();
    animationFrame = requestAnimationFrame(frame);

    return {
      resize,
      disturbFromPointer(x, y, time) {
        if (!finePointer.matches || reduceMotion || entering) return;
        const distance = Math.hypot(x - lastTrailX, y - lastTrailY);
        if (time - lastTrailTime < 80 || distance < 30) return;
        addRipple(x, y, 0.08);
        lastTrailX = x;
        lastTrailY = y;
        lastTrailTime = time;
      },
      ambient(x, y) {
        addRipple(x, y, 0.16);
      },
      impact(x, y) {
        addRipple(x, y, 1);
      },
      destroy() {
        cancelAnimationFrame(animationFrame);
      },
    };
  }

  let water = null;

  try {
    water = createWebGLWater();
  } catch (error) {
    console.warn('WebGL water could not start:', error);
  }

  if (!water) {
    // 한 canvas에서는 WebGL과 2D context를 번갈아 만들 수 없으므로
    // WebGL 초기화가 실패했으면 동일한 새 canvas로 교체한 뒤 2D fallback을 시작한다.
    const replacementCanvas = canvas.cloneNode(true);
    canvas.replaceWith(replacementCanvas);
    canvas = replacementCanvas;
    water = createCanvasFallback();
  }

  function scheduleAmbientRipple(delay = 300 + Math.random() * 400) {
    clearTimeout(ambientTimer);
    ambientTimer = window.setTimeout(() => {
      if (entering || reduceMotion) return;
      const x = width * (0.15 + Math.random() * 0.7);
      const y = height * (0.16 + Math.random() * 0.68);
      water?.ambient(x, y);
      // A 5.44s ambient word remains visible while roughly five more
      // raindrop-like ripples are born around it.
      scheduleAmbientRipple(20 + Math.random() * 60);
    }, delay);
  }

  scheduleAmbientRipple();

  function enter(x, y) {
    if (entering) return;
    entering = true;
    clearTimeout(ambientTimer);
    setCursorVisibility();
    touchPrompt.classList.add('is-hidden');

    if (reduceMotion) {
      location.href = target;
      return;
    }

    water?.impact(x, y);
    window.setTimeout(() => root.classList.add('is-entering'), 1020);
    window.setTimeout(() => {
      location.href = target;
    }, 1810);
  }

  root.addEventListener('pointerenter', (event) => {
    pointerInside = true;
    if (event.pointerType === 'mouse') placeCursorPrompt(event.clientX, event.clientY);
    setCursorVisibility();
  });

  root.addEventListener('pointerleave', () => {
    pointerInside = false;
    setCursorVisibility();
  });

  root.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;

    // 실제 이벤트 좌표를 그대로 반영하므로 마우스와 문구 사이에 지연이 없다.
    placeCursorPrompt(event.clientX, event.clientY);
    water?.disturbFromPointer(event.clientX, event.clientY, event.timeStamp);
  }, { passive: true });

  button.addEventListener('pointerdown', (event) => {
    enter(event.clientX, event.clientY);
  });

  button.addEventListener('click', (event) => {
    event.preventDefault();
  });

  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      enter(width / 2, height / 2);
    }
  });

  addEventListener('resize', () => {
    width = innerWidth;
    height = innerHeight;
    water?.resize();
  }, { passive: true });

  addEventListener('pagehide', () => {
    clearTimeout(ambientTimer);
    water?.destroy();
  }, { once: true });
}
