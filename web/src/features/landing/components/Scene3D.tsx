"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./hooks";

/**
 * The 3D backdrop of the landing page: a tunnel of glowing nodes joined by thin lines, which is
 * the sales pipeline seen from inside. The camera flies down the tunnel as the page scrolls, light
 * pulses travel along it, and the colour warms from violet to ember towards the end of the page.
 *
 * It is plain WebGL with no library. Without WebGL, or with reduced motion, the page keeps its
 * CSS glow: reduced motion draws one still frame and never animates.
 */

const NODES = 520;
const LENGTH = 70;
const TAU = Math.PI * 2;

const VERTEX = `
attribute vec3 aPos;
attribute float aSize;
attribute float aSeed;
uniform mat4 uMvp;
uniform float uTime;
uniform float uPx;
uniform float uWarm;
varying float vFade;
varying float vWarm;
varying float vPulse;
void main() {
  vec4 p = uMvp * vec4(aPos, 1.0);
  float along = -aPos.z / ${LENGTH.toFixed(1)};
  float wave = sin(uTime * 1.3 - along * 38.0 + aSeed * 6.0) * 0.5 + 0.5;
  vPulse = pow(wave, 7.0);
  vFade = clamp(1.0 - (p.w - 3.0) / 34.0, 0.0, 1.0);
  vWarm = clamp(uWarm + (aSeed - 0.5) * 0.35, 0.0, 1.0);
  gl_Position = p;
  gl_PointSize = min(aSize * uPx * (1.0 + vPulse * 1.1) / max(p.w, 0.5), 70.0);
}`;

const FRAGMENT = `
precision mediump float;
varying float vFade;
varying float vWarm;
varying float vPulse;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  vec3 violet = vec3(0.55, 0.45, 1.0);
  vec3 ember = vec3(1.0, 0.52, 0.2);
  vec3 col = mix(violet, ember, vWarm);
  col = mix(col, vec3(1.0, 0.93, 0.82), vPulse * 0.6);
  gl_FragColor = vec4(col, pow(core, 1.4) * vFade * (0.85 + vPulse * 0.5));
}`;

const LINE_VERTEX = `
attribute vec3 aPos;
attribute float aSeed;
uniform mat4 uMvp;
uniform float uTime;
uniform float uWarm;
varying float vFade;
varying float vWarm;
varying float vPulse;
void main() {
  vec4 p = uMvp * vec4(aPos, 1.0);
  float along = -aPos.z / ${LENGTH.toFixed(1)};
  float wave = sin(uTime * 1.3 - along * 38.0 + aSeed * 6.0) * 0.5 + 0.5;
  vPulse = pow(wave, 7.0);
  vFade = clamp(1.0 - (p.w - 3.0) / 34.0, 0.0, 1.0);
  vWarm = clamp(uWarm + (aSeed - 0.5) * 0.35, 0.0, 1.0);
  gl_Position = p;
}`;

const LINE_FRAGMENT = `
precision mediump float;
varying float vFade;
varying float vWarm;
varying float vPulse;
void main() {
  vec3 violet = vec3(0.45, 0.38, 0.95);
  vec3 ember = vec3(0.95, 0.45, 0.18);
  vec3 col = mix(violet, ember, vWarm);
  gl_FragColor = vec4(col, vFade * (0.22 + vPulse * 0.55));
}`;

type Mat = Float32Array;

function perspective(fov: number, aspect: number, near: number, far: number): Mat {
  const f = 1 / Math.tan(fov / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function multiply(a: Mat, b: Mat): Mat {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/** View matrix for a camera at (x, y, z) looking down -z, with a yaw, pitch and roll. */
function view(x: number, y: number, z: number, yaw: number, pitch: number, roll: number): Mat {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const rotY = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const rotX = new Float32Array([1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1]);
  const rotZ = new Float32Array([cr, sr, 0, 0, -sr, cr, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const move = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1]);
  return multiply(multiply(rotZ, multiply(rotX, rotY)), move);
}

/** A small seeded random generator, so the tunnel looks the same on every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTunnel() {
  const rand = seeded(20261127);
  const positions: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];
  for (let i = 0; i < NODES; i++) {
    const t = i / NODES;
    const turn = t * TAU * 6 + rand() * 0.9;
    const radius = 2.6 + rand() * 4.2;
    positions.push(Math.cos(turn) * radius, Math.sin(turn) * radius * 0.7, -t * LENGTH);
    sizes.push(10 + rand() * 20 + (i % 37 === 0 ? 26 : 0));
    seeds.push(rand());
  }
  // Join each node to the next two nodes along the tunnel, so the lines read as pipelines.
  const linePos: number[] = [];
  const lineSeed: number[] = [];
  for (let i = 0; i < NODES; i++) {
    for (const step of [1, 3]) {
      const j = i + step;
      if (j >= NODES) continue;
      if (step === 3 && i % 2 === 1) continue;
      for (const n of [i, j]) {
        linePos.push(positions[n * 3] ?? 0, positions[n * 3 + 1] ?? 0, positions[n * 3 + 2] ?? 0);
        lineSeed.push(seeds[n] ?? 0);
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    sizes: new Float32Array(sizes),
    seeds: new Float32Array(seeds),
    linePos: new Float32Array(linePos),
    lineSeed: new Float32Array(lineSeed),
  };
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function program(gl: WebGLRenderingContext, vertex: string, fragment: string) {
  const v = compile(gl, gl.VERTEX_SHADER, vertex);
  const f = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const p = gl.createProgram();
  if (!v || !f || !p) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

function buffer(gl: WebGLRenderingContext, data: Float32Array) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return b;
}

export function Scene3D() {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = el.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    } catch {
      gl = null;
    }
    if (!gl) {
      el.setAttribute("data-scene", "off");
      return;
    }
    const ctx = gl;
    const points = program(ctx, VERTEX, FRAGMENT);
    const lines = program(ctx, LINE_VERTEX, LINE_FRAGMENT);
    if (!points || !lines) {
      el.setAttribute("data-scene", "off");
      return;
    }
    const reduced = prefersReducedMotion();
    el.setAttribute("data-scene", reduced ? "still" : "live");

    const tunnel = buildTunnel();
    const posBuf = buffer(ctx, tunnel.positions);
    const sizeBuf = buffer(ctx, tunnel.sizes);
    const seedBuf = buffer(ctx, tunnel.seeds);
    const linePosBuf = buffer(ctx, tunnel.linePos);
    const lineSeedBuf = buffer(ctx, tunnel.lineSeed);

    const attr = (prog: WebGLProgram, name: string, buf: WebGLBuffer | null, size: number) => {
      const loc = ctx.getAttribLocation(prog, name);
      if (loc < 0) return;
      ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
      ctx.enableVertexAttribArray(loc);
      ctx.vertexAttribPointer(loc, size, ctx.FLOAT, false, 0, 0);
    };

    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, Math.floor(el.clientWidth * dpr));
      height = Math.max(1, Math.floor(el.clientHeight * dpr));
      el.width = width;
      el.height = height;
      ctx.viewport(0, 0, width, height);
    };
    resize();

    let target = 0;
    let smooth = 0;
    let pointerX = 0;
    let pointerY = 0;
    let smoothX = 0;
    let smoothY = 0;
    const readScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      target = Math.min(1, Math.max(0, window.scrollY / max));
    };

    const draw = (time: number) => {
      const p = smooth;
      const aspect = width / height;
      const proj = perspective(1.05, aspect, 0.1, 90);
      const camZ = 5 - p * (LENGTH - 14);
      const roll = p * 1.6 + Math.sin(time * 0.12) * 0.04;
      const mv = view(
        Math.sin(p * 5) * 0.9,
        Math.cos(p * 4) * 0.5,
        camZ,
        smoothX * 0.18,
        smoothY * 0.12,
        roll,
      );
      const mvp = multiply(proj, mv);
      const warm = Math.min(1, Math.max(0, (p - 0.55) / 0.4));
      ctx.clearColor(0, 0, 0, 0);
      ctx.clear(ctx.COLOR_BUFFER_BIT);
      ctx.enable(ctx.BLEND);
      ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE);

      ctx.useProgram(lines);
      attr(lines, "aPos", linePosBuf, 3);
      attr(lines, "aSeed", lineSeedBuf, 1);
      ctx.uniformMatrix4fv(ctx.getUniformLocation(lines, "uMvp"), false, mvp);
      ctx.uniform1f(ctx.getUniformLocation(lines, "uTime"), time);
      ctx.uniform1f(ctx.getUniformLocation(lines, "uWarm"), warm);
      ctx.drawArrays(ctx.LINES, 0, tunnel.linePos.length / 3);

      ctx.useProgram(points);
      attr(points, "aPos", posBuf, 3);
      attr(points, "aSize", sizeBuf, 1);
      attr(points, "aSeed", seedBuf, 1);
      ctx.uniformMatrix4fv(ctx.getUniformLocation(points, "uMvp"), false, mvp);
      ctx.uniform1f(ctx.getUniformLocation(points, "uTime"), time);
      ctx.uniform1f(ctx.getUniformLocation(points, "uPx"), dpr * 26);
      ctx.uniform1f(ctx.getUniformLocation(points, "uWarm"), warm);
      ctx.drawArrays(ctx.POINTS, 0, NODES);
    };

    let frame = 0;
    let running = true;
    const start = performance.now();
    const loop = () => {
      if (!running) return;
      smooth += (target - smooth) * 0.06;
      smoothX += (pointerX - smoothX) * 0.05;
      smoothY += (pointerY - smoothY) * 0.05;
      draw((performance.now() - start) / 1000);
      frame = requestAnimationFrame(loop);
    };

    const onScroll = () => {
      readScroll();
      if (reduced) {
        smooth = target;
        draw(2);
      }
    };
    const onPointer = (event: PointerEvent) => {
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;
    };
    const onResize = () => {
      resize();
      if (reduced) draw(2);
    };
    const onVisibility = () => {
      if (reduced) return;
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        frame = requestAnimationFrame(loop);
      }
    };

    readScroll();
    smooth = target;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    if (reduced) {
      draw(2);
    } else {
      window.addEventListener("pointermove", onPointer);
      document.addEventListener("visibilitychange", onVisibility);
      frame = requestAnimationFrame(loop);
    }

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvas} className="lp-scene" aria-hidden="true" data-scene="pending" />;
}
