// ==============================
// Constants
// ==============================
const PI = Math.PI;
const a0 = 1; // Bohr radius (can scale visually)

// ==============================
// Factorial + helpers
// ==============================
function factorial(n: number): number {
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

// Associated Laguerre Polynomial L_k^alpha(x)
function laguerre(k: number, alpha: number, x: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    const coeff =
      Math.pow(-1, i) *
      factorial(k + alpha) /
      (factorial(k - i) * factorial(alpha + i) * factorial(i));
    sum += coeff * Math.pow(x, i);
  }
  return sum;
}

// ==============================
// Radial function R_nl(r)
// ==============================
export function radial(n: number, l: number, r: number): number {
  const rho = (2 * r) / (n * a0);

  const norm =
    Math.sqrt(
      Math.pow(2 / (n * a0), 3) *
      factorial(n - l - 1) /
      (2 * n * factorial(n + l))
    );

  return (
    norm *
    Math.exp(-rho / 2) *
    Math.pow(rho, l) *
    laguerre(n - l - 1, 2 * l + 1, rho)
  );
}

// ==============================
// Spherical Harmonics Y_l^m
// (Real-valued versions for rendering)
// ==============================

function legendre(l: number, m: number, x: number): number {
  if (m < 0 || m > l) return 0;

  let pmm = 1.0;
  if (m > 0) {
    const somx2 = Math.sqrt((1 - x) * (1 + x));
    let fact = 1.0;
    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2;
      fact += 2.0;
    }
  }

  if (l === m) return pmm;

  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;

  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll =
      ((2 * ll - 1) * x * pmmp1 - (ll + m - 1) * pmm) /
      (ll - m);
    pmm = pmmp1;
    pmmp1 = pll;
  }

  return pll;
}

export function sphericalHarmonic(
  l: number,
  m: number,
  theta: number,
  phi: number
): number {
  const absM = Math.abs(m);
  const norm =
    Math.sqrt(
      ((2 * l + 1) / (4 * PI)) *
      factorial(l - absM) /
      factorial(l + absM)
    );

  const P = legendre(l, absM, Math.cos(theta));

  if (m > 0) {
    return Math.sqrt(2) * norm * P * Math.cos(m * phi);
  } else if (m < 0) {
    return Math.sqrt(2) * norm * P * Math.sin(absM * phi);
  } else {
    return norm * P;
  }
}

// ==============================
// Full wavefunction ψ
// ==============================
export function psi(
  n: number,
  l: number,
  m: number,
  r: number,
  theta: number,
  phi: number
): number {
  return radial(n, l, r) * sphericalHarmonic(l, m, theta, phi);
}

// ==============================
// Probability density |ψ|^2
// ==============================
export function probabilityDensity(
  n: number,
  l: number,
  m: number,
  r: number,
  theta: number,
  phi: number
): number {
  const val = psi(n, l, m, r, theta, phi);
  return val * val;
}

// ==============================
// Radial probability P(r)
// ==============================
export function radialProbability(
  n: number,
  l: number,
  r: number
): number {
  const R = radial(n, l, r);
  return r * r * R * R;
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const gl = canvas.getContext("webgl2")!;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

gl.viewport(0, 0, canvas.width, canvas.height);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.BLEND_SRC_ALPHA);

function createShader(type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
		console.error(gl.getShaderInfoLog(s));
		throw Error("Could not compile shader!");
	}
  return s;
}

function createProgram(vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, createShader(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);

	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
		console.error(gl.getProgramInfoLog(prog));
		throw Error("Could not link program!");
	}

  return prog;
}

const vs = `#version 300 es
precision highp float;

layout(location=0) in vec3 position;

uniform mat4 uProj;
uniform mat4 uView;

void main() {
  gl_Position = uProj * uView * vec4(position, 1.0);
  gl_PointSize = 2.0;
}
`;

const fs = `#version 300 es
precision highp float;
out vec4 fragColor;

void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float alpha = smoothstep(0.5, 0.0, d);
	// Soft blue, will probably make adjustable/some other cool thing.
  fragColor = vec4(0.86, 0.34, 0.10, alpha);
}
`;

const program = createProgram(vs, fs);
gl.useProgram(program);

// Generate electron cloud
function samplePoints(n: number, l: number, m: number, count: number) {
  const points: number[] = [];

  while (points.length < count * 3) {
    const r = Math.random() * 20;
    const theta = Math.acos(1 - 2 * Math.random());
    const phi = 2 * PI * Math.random();

    const p = probabilityDensity(n, l, m, r, theta, phi);

    // rejection sampling
    if (Math.random() < p * 50) {
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.sin(theta) * Math.sin(phi);
      const z = r * Math.cos(theta);

      points.push(x, y, z);
    }
  }

  return new Float32Array(points);
}

const data = samplePoints(2, 1, 0, 6_500);

// Upload buffer
const vao = gl.createVertexArray()!;
gl.bindVertexArray(vao);

const buf = gl.createBuffer()!;
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ]);
}

function lookAt(eye: number[], center: number[], up: number[]) {
  const z = normalize(sub(eye, center)) as number[];
  const x = normalize(cross(up, z)) as number[];
  const y = cross(z, x) as number[];
	

	//TODO: All these null negations make me SICK!!! I'm sure theres a better way but I'm tired rn.
  return new Float32Array([
    x[0]!, y[0]!, z[0]!, 0,
    x[1]!, y[1]!, z[1]!, 0,
    x[2]!, y[2]!, z[2]!, 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
}

// Handful of ts ignores here to stop it from displaying errors due to "possibly undefined". It wont be and if it is fuck me i guess.
function sub(a: number[], b: number[]) {
	// @ts-ignore
  return [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
}
function cross(a: number[], b: number[]) {
  return [
	// @ts-ignore
    a[1]*b[2]-a[2]*b[1],
	// @ts-ignore
    a[2]*b[0]-a[0]*b[2],
	// @ts-ignore
    a[0]*b[1]-a[1]*b[0]
  ];
}
function dot(a: number[], b: number[]) {
	// @ts-ignore
  return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}
function normalize(v: number[]) {
  const l = Math.hypot(...v);
  return v.map(x => x/l);
}

const uProj = gl.getUniformLocation(program, "uProj");
const uView = gl.getUniformLocation(program, "uView");

const proj = perspective(PI/4, canvas.width/canvas.height, 0.1, 100);
gl.uniformMatrix4fv(uProj, false, proj);

// ==============================
// Render loop
// ==============================
let angle = 0.1;

function render() {
  angle += 0.01;

  const eye = [
    Math.cos(angle) * 40,
    20,
    Math.sin(angle) * 40
  ];

  const view = lookAt(eye, [0,0,0], [0,1,0]);
  gl.uniformMatrix4fv(uView, false, view);
	
	// Pretty gray background
  gl.clearColor(0.1,0.11,0.134,1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.drawArrays(gl.POINTS, 0, data.length / 3);

  requestAnimationFrame(render);
}

render();
