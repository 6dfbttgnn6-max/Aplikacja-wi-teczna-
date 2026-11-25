// Efekt głębi 2,5D: karta graficzna przesuwa piksele zdjęcia zależnie od mapy głębi,
// więc przy ruchu kamery pierwszy plan przesuwa się względem tła jak w prawdziwym nagraniu.

const VS = `
attribute vec2 p;
varying vec2 v;
void main() { v = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `
precision highp float;
uniform sampler2D img;
uniform sampler2D dep;
uniform vec2 center;    // środek kadru (uv)
uniform vec2 halfSize;  // połowa widocznego obszaru (uv)
uniform vec2 par;       // przesunięcie paralaksy (uv na jednostkę głębi)
uniform float dolly;    // paralaksa przy przybliżaniu
uniform float focus;    // głębia, która stoi w miejscu (twarz Mikołaja)
uniform vec3 tint;      // korekcja koloru
uniform float contrast;
varying vec2 v;
vec2 disp(vec2 uv, float d) { return (d - focus) * (par + (uv - center) * dolly); }
void main() {
  vec2 uv = center + (v - 0.5) * 2.0 * halfSize;
  float d = texture2D(dep, uv).r;
  vec2 u2 = uv - disp(uv, d);
  d = texture2D(dep, u2).r;
  u2 = uv - disp(uv, d);
  d = texture2D(dep, u2).r;
  u2 = clamp(uv - disp(uv, d), vec2(0.0005), vec2(0.9995));
  vec3 c = texture2D(img, u2).rgb;
  c = (c - 0.5) * contrast + 0.5;
  c *= tint;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

let gl = null, canvas = null, prog = null, loc = {};
const textures = new Map();

function shader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export function glAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}

function init() {
  canvas = document.createElement('canvas');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false })
    || canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
  if (!gl) throw new Error('Brak WebGL');
  prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['img', 'dep', 'center', 'halfSize', 'par', 'dolly', 'focus', 'tint', 'contrast']) loc[n] = gl.getUniformLocation(prog, n);
  gl.uniform1i(loc.img, 0);
  gl.uniform1i(loc.dep, 1);
}

function texture(source) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/** Rejestruje obraz i jego mapę głębi pod kluczem. */
export function glRegister(key, img, depthImg) {
  if (!gl) init();
  if (textures.has(key)) return;
  textures.set(key, { img: texture(img), dep: texture(depthImg) });
}

/**
 * Renderuje ujęcie do wewnętrznego canvasu i zwraca go (do narysowania w 2D).
 * view: {cx, cy, halfW, halfH} w uv; par: [x,y]; dolly; focus; w,h: rozmiar wyjścia
 */
export function glRender(key, view, { par = [0, 0], dolly = 0, focus = 0.5, tint = [1, 1, 1], contrast = 1 }, w, h) {
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  const tx = textures.get(key);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tx.img);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tx.dep);
  gl.uniform2f(loc.center, view.cx, view.cy);
  gl.uniform2f(loc.halfSize, view.halfW, view.halfH);
  gl.uniform2f(loc.par, par[0], par[1]);
  gl.uniform1f(loc.dolly, dolly);
  gl.uniform1f(loc.focus, focus);
  gl.uniform3f(loc.tint, tint[0], tint[1], tint[2]);
  gl.uniform1f(loc.contrast, contrast);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}
