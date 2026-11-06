/**
 * High-Performance Canvas Renderer for LiquidFun Water Character
 * Supports:
 * - Fluid Metaball / Surface Shader
 * - Particle Network & Velocity Vectors
 * - SPH Pressure & Velocity Heatmap
 */

import { WaterSimulation } from './simulation';

export type RenderMode = 'fluid' | 'particles' | 'pressure';

export interface CameraState {
  zoom: number; // Pixels per meter (default: ~100px = 1m)
  panX: number;
  panY: number;
}

export class WaterRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  public camera: CameraState = {
    zoom: 120, // 120 pixels = 1 meter
    panX: 0,
    panY: 0,
  };

  public renderMode: RenderMode = 'fluid';
  public showCenterOfMass = true;
  public showBoundingBox = true;
  public showVelocityVectors = false;
  public showGrid = true;
  public followCharacter = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    this.ctx = ctx;

    this.offscreenCanvas = document.createElement('canvas');
    const offCtx = this.offscreenCanvas.getContext('2d');
    if (!offCtx) throw new Error('Could not get offscreen canvas context');
    this.offscreenCtx = offCtx;
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.offscreenCanvas.width = width;
    this.offscreenCanvas.height = height;
  }

  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const originX = this.canvas.width / 2 + this.camera.panX;
    // Ground y=0 is placed around 75% down the viewport
    const originY = this.canvas.height * 0.75 + this.camera.panY;
    return {
      x: originX + worldX * this.camera.zoom,
      y: originY - worldY * this.camera.zoom, // y is flipped
    };
  }

  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const originX = this.canvas.width / 2 + this.camera.panX;
    const originY = this.canvas.height * 0.75 + this.camera.panY;
    return {
      x: (screenX - originX) / this.camera.zoom,
      y: (originY - screenY) / this.camera.zoom,
    };
  }

  public render(sim: WaterSimulation, mouseInteraction?: { x: number; y: number; active: boolean }): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Smooth camera tracking when following character
    if (this.followCharacter && sim.telemetry.particleCount > 0) {
      const targetPanX = -sim.telemetry.centerOfMass.x * this.camera.zoom;
      this.camera.panX += (targetPanX - this.camera.panX) * 0.08;
    }

    // Clear background: scientific lab aesthetic (slate-950)
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // 1. Draw Lab Coordinate Grid & Metric Ticks
    if (this.showGrid) {
      this.drawGrid(ctx, width, height);
    }

    // 2. Draw Physics Obstacles & Ground Platform
    this.drawGround(ctx);

    if (!sim.particleSystem) return;
    const particleCount = sim.particleSystem.GetParticleCount();
    if (particleCount === 0) return;

    const positions = sim.particleSystem.GetPositionBuffer();
    const velocities = sim.particleSystem.GetVelocityBuffer();

    // 3. Draw Water Droplet Character based on RenderMode
    if (this.renderMode === 'fluid') {
      this.renderFluidMetaballs(positions, particleCount, sim.params.particleRadius);
    } else if (this.renderMode === 'particles') {
      this.renderParticleNetwork(positions, velocities, particleCount, sim.params.particleRadius);
    } else if (this.renderMode === 'pressure') {
      this.renderPressureHeatmap(positions, velocities, particleCount, sim.params.particleRadius);
    }

    // 4. Draw Center of Mass Crosshair & Droplet Boundary
    const t = sim.telemetry;
    if (this.showBoundingBox && t.bounds.width > 0) {
      this.drawBoundingBox(ctx, positions, particleCount, t);
    }

    if (this.showCenterOfMass && t.particleCount > 0) {
      this.drawCenterOfMass(ctx, t.centerOfMass.x, t.centerOfMass.y, t.velocity);
    }

    // 5. Draw Mouse Interaction Ripple
    if (mouseInteraction?.active) {
      const scr = this.worldToScreen(mouseInteraction.x, mouseInteraction.y);
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(scr.x, scr.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const origin = this.worldToScreen(0, 0);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;

    const step = this.camera.zoom * 0.5; // 0.5 meter grid
    const startX = origin.x % step;
    for (let x = startX; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const startY = origin.y % step;
    for (let y = startY; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Metric markers on y-axis
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    for (let m = -1; m <= 6; m += 0.5) {
      if (m === 0) continue;
      const pt = this.worldToScreen(0, m);
      if (pt.y > 20 && pt.y < height - 20) {
        ctx.fillText(`${m > 0 ? '+' : ''}${m.toFixed(1)}m`, origin.x - 38, pt.y + 3);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.moveTo(origin.x - 6, pt.y);
        ctx.lineTo(origin.x + 6, pt.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    const p1 = this.worldToScreen(-14.0, 0);
    const p2 = this.worldToScreen(14.0, 0);
    const bottomP = this.worldToScreen(14.0, -1.0);

    ctx.save();

    // Ground platform body
    const groundHeight = bottomP.y - p1.y;
    const groundWidth = p2.x - p1.x;

    // Platform gradient
    const grad = ctx.createLinearGradient(p1.x, p1.y, p1.x, bottomP.y);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(0.3, '#0f172a');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(p1.x, p1.y, groundWidth, groundHeight);

    // Surface highlight line
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p1.y);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Side safety bumpers / walls (at x = ±8.5, width 0.8)
    const leftWallTop = this.worldToScreen(-8.9, 8.0);
    const leftWallBot = this.worldToScreen(-8.1, 0.0);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(leftWallTop.x, leftWallTop.y, leftWallBot.x - leftWallTop.x, leftWallBot.y - leftWallTop.y);
    ctx.strokeRect(leftWallTop.x, leftWallTop.y, leftWallBot.x - leftWallTop.x, leftWallBot.y - leftWallTop.y);

    const rightWallTop = this.worldToScreen(8.1, 8.0);
    const rightWallBot = this.worldToScreen(8.9, 0.0);
    ctx.fillRect(rightWallTop.x, rightWallTop.y, rightWallBot.x - rightWallTop.x, rightWallBot.y - rightWallTop.y);
    ctx.strokeRect(rightWallTop.x, rightWallTop.y, rightWallBot.x - rightWallTop.x, rightWallBot.y - rightWallTop.y);

    // Elevated Platforms (Mario-style 2D platforms)
    const drawPlatform = (x: number, y: number, hx: number, hy: number, label: string) => {
      const topLeft = this.worldToScreen(x - hx, y + hy);
      const botRight = this.worldToScreen(x + hx, y - hy);
      const pw = botRight.x - topLeft.x;
      const ph = botRight.y - topLeft.y;

      // Platform body
      const pGrad = ctx.createLinearGradient(topLeft.x, topLeft.y, topLeft.x, botRight.y);
      pGrad.addColorStop(0, '#334155');
      pGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = pGrad;
      ctx.fillRect(topLeft.x, topLeft.y, pw, ph);

      // Top edge glow
      ctx.beginPath();
      ctx.moveTo(topLeft.x, topLeft.y);
      ctx.lineTo(botRight.x, topLeft.y);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(topLeft.x, topLeft.y, pw, ph);

      // Subtle label
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '10px "Cairo", sans-serif';
      ctx.fillText(label, topLeft.x + 8, topLeft.y + ph - 4);
    };

    // Platform 1: Left (x: -3.5, y: 0.95, hx: 1.1, hy: 0.12)
    drawPlatform(-3.5, 0.95, 1.1, 0.12, 'منصة منخفضة 1.0m');

    // Platform 2: Right (x: 3.5, y: 1.55, hx: 1.2, hy: 0.12)
    drawPlatform(3.5, 1.55, 1.2, 0.12, 'منصة متوسطة 1.6m');

    // Platform 3: Center high (x: 0.0, y: 2.35, hx: 0.9, hy: 0.12)
    drawPlatform(0.0, 2.35, 0.9, 0.12, 'منصة علوية 2.4m');

    ctx.restore();
  }

  /**
   * Realistic Fluid Metaball rendering
   * Blends particle density in an offscreen alpha buffer, thresholds to sharp meniscus,
   * then adds surface tension Fresnel shine and water refraction.
   */
  private renderFluidMetaballs(positions: Float32Array, count: number, radiusMeters: number): void {
    const offCtx = this.offscreenCtx;
    const { width, height } = this.canvas;

    offCtx.clearRect(0, 0, width, height);

    // Draw particle radial blobs on offscreen canvas
    const pRadius = radiusMeters * this.camera.zoom * 1.8;

    for (let i = 0; i < count; i++) {
      const scr = this.worldToScreen(positions[i * 2], positions[i * 2 + 1]);
      const grad = offCtx.createRadialGradient(scr.x, scr.y, pRadius * 0.1, scr.x, scr.y, pRadius);
      grad.addColorStop(0, 'rgba(0, 200, 255, 1.0)');
      grad.addColorStop(0.4, 'rgba(0, 160, 240, 0.8)');
      grad.addColorStop(0.8, 'rgba(0, 100, 200, 0.2)');
      grad.addColorStop(1, 'rgba(0, 40, 160, 0)');

      offCtx.fillStyle = grad;
      offCtx.beginPath();
      offCtx.arc(scr.x, scr.y, pRadius, 0, Math.PI * 2);
      offCtx.fill();
    }

    // Transfer with smooth fluid alpha thresholding
    const imgData = offCtx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;

    // Fluid thresholding: creates clear liquid boundary
    for (let i = 3; i < len; i += 4) {
      const alpha = data[i];
      if (alpha > 80) {
        // Boost alpha to solid fluid core
        data[i] = Math.min(255, (alpha - 80) * 3.5);
      } else {
        data[i] = 0;
      }
    }
    offCtx.putImageData(imgData, 0, 0);

    // Render fluid body onto main canvas
    this.ctx.drawImage(this.offscreenCanvas, 0, 0);

    // Add specular surface tension highlight & fluid eye/sheen
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';

    // Soft water ground contact reflection
    for (let i = 0; i < count; i += 4) {
      const wx = positions[i * 2];
      const wy = positions[i * 2 + 1];
      if (wy < 0.15) {
        const scr = this.worldToScreen(wx, 0);
        this.ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        this.ctx.fillRect(scr.x - 6, scr.y, 12, 4);
      }
    }

    // Specular bubble highlights on upper particles
    for (let i = 0; i < count; i += 3) {
      const wx = positions[i * 2];
      const wy = positions[i * 2 + 1];
      const scr = this.worldToScreen(wx, wy);

      this.ctx.beginPath();
      this.ctx.arc(scr.x - pRadius * 0.2, scr.y - pRadius * 0.25, pRadius * 0.35, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  /**
   * Physics Particle Network mode:
   * Shows individual LiquidFun particles, spring connectivity, and velocity vectors.
   */
  private renderParticleNetwork(
    positions: Float32Array,
    velocities: Float32Array,
    count: number,
    radiusMeters: number
  ): void {
    const ctx = this.ctx;
    ctx.save();

    const pRadius = radiusMeters * this.camera.zoom * 0.85;

    // 1. Draw spring connection links between close particles
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const x1 = positions[i * 2];
      const y1 = positions[i * 2 + 1];
      const scr1 = this.worldToScreen(x1, y1);

      // Connect to a few nearby particles
      for (let j = i + 1; j < Math.min(count, i + 8); j++) {
        const x2 = positions[j * 2];
        const y2 = positions[j * 2 + 1];
        const dist = Math.hypot(x2 - x1, y2 - y1);
        if (dist < radiusMeters * 2.8) {
          const scr2 = this.worldToScreen(x2, y2);
          ctx.beginPath();
          ctx.moveTo(scr1.x, scr1.y);
          ctx.lineTo(scr2.x, scr2.y);
          ctx.stroke();
        }
      }
    }

    // 2. Draw particle nodes
    for (let i = 0; i < count; i++) {
      const wx = positions[i * 2];
      const wy = positions[i * 2 + 1];
      const scr = this.worldToScreen(wx, wy);

      ctx.beginPath();
      ctx.arc(scr.x, scr.y, pRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(14, 165, 233, 0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Velocity vector
      if (this.showVelocityVectors) {
        const vx = velocities[i * 2];
        const vy = velocities[i * 2 + 1];
        const vLen = Math.hypot(vx, vy);
        if (vLen > 0.05) {
          ctx.beginPath();
          ctx.moveTo(scr.x, scr.y);
          ctx.lineTo(scr.x + vx * 12, scr.y - vy * 12);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  /**
   * SPH Pressure & Velocity Heatmap:
   * Displays local fluid hydrostatic pressure and speed gradient.
   */
  private renderPressureHeatmap(
    positions: Float32Array,
    velocities: Float32Array,
    count: number,
    radiusMeters: number
  ): void {
    const ctx = this.ctx;
    ctx.save();
    const pRadius = radiusMeters * this.camera.zoom * 1.0;

    for (let i = 0; i < count; i++) {
      const wx = positions[i * 2];
      const wy = positions[i * 2 + 1];
      const vx = velocities[i * 2];
      const vy = velocities[i * 2 + 1];
      const speed = Math.hypot(vx, vy);

      const scr = this.worldToScreen(wx, wy);

      // Pressure gradient: higher closer to ground (y near 0)
      // Speed heatmap: higher speed shifts from Cyan to Amber/Coral
      const depthFactor = Math.max(0, Math.min(1, 1 - wy / 1.0));
      const speedFactor = Math.min(1, speed / 3.0);

      const r = Math.round(depthFactor * 180 + speedFactor * 75);
      const g = Math.round(140 + depthFactor * 40 - speedFactor * 80);
      const b = Math.round(250 - depthFactor * 120);

      ctx.beginPath();
      ctx.arc(scr.x, scr.y, pRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawBoundingBox(
    ctx: CanvasRenderingContext2D,
    positions: Float32Array,
    count: number,
    t: WaterSimulation['telemetry']
  ): void {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = positions[i * 2];
      const y = positions[i * 2 + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const topLeft = this.worldToScreen(minX, maxY);
    const botRight = this.worldToScreen(maxX, minY);

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(topLeft.x, topLeft.y, botRight.x - topLeft.x, botRight.y - topLeft.y);

    // Dimension labels
    ctx.setLineDash([]);
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`W: ${(maxX - minX).toFixed(2)}m`, (topLeft.x + botRight.x) / 2 - 24, botRight.y + 14);
    ctx.fillText(`H: ${(maxY - minY).toFixed(2)}m`, botRight.x + 6, (topLeft.y + botRight.y) / 2 + 3);

    ctx.restore();
  }

  private drawCenterOfMass(
    ctx: CanvasRenderingContext2D,
    cmX: number,
    cmY: number,
    vel: { vx: number; vy: number; speed: number }
  ): void {
    const scr = this.worldToScreen(cmX, cmY);
    ctx.save();

    // Crosshair
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(scr.x - 8, scr.y);
    ctx.lineTo(scr.x + 8, scr.y);
    ctx.moveTo(scr.x, scr.y - 8);
    ctx.lineTo(scr.x, scr.y + 8);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f43f5e';
    ctx.fill();

    // Velocity arrow
    if (vel.speed > 0.05) {
      ctx.beginPath();
      ctx.moveTo(scr.x, scr.y);
      ctx.lineTo(scr.x + vel.vx * 18, scr.y - vel.vy * 18);
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Label
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#f43f5e';
    ctx.fillText(`CM (${cmX.toFixed(2)}, ${cmY.toFixed(2)})`, scr.x + 10, scr.y - 8);

    ctx.restore();
  }
}
