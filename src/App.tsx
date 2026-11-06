/**
 * LiquidFun Water Character Simulation Laboratory
 * Standalone physics sandbox powered by Google's LiquidFun 2D particle engine.
 * 
 * Features:
 * - 1. Hidden 2D Dynamic Player Controller (Mario-style kinematics):
 *   Walk, Run/Sprint, Jump with height/strength modulation, Gravity & Platforms collision.
 *   Completely invisible to the user.
 * - 2. Fluid Particle Body (Adjustable up to 500 particles):
 *   Particles follow the controller dynamically via viscoelastic attraction & surface tension.
 *   100% mass preservation, zero stray droplets, pure physical emergence (no sprites/meshes/splines).
 * - 3. Interactive Testing Deck:
 *   Keyboard controls (A/D/Arrows to walk, Shift to run, W/Up/Space to jump),
 *   Particle count slider (100 to 500) with Live Tuner, platform jumping obstacles.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  RotateCcw,
  Play,
  Pause,
  Eye,
  Sliders,
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Sparkles,
  Info,
  CheckCircle2,
  Footprints,
  Compass,
  Zap,
} from 'lucide-react';
import { WaterSimulation, CharacterState } from './liquidfun/simulation';
import { WaterRenderer, RenderMode } from './liquidfun/renderer';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<WaterSimulation | null>(null);
  const rendererRef = useRef<WaterRenderer | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Simulation running state
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Active state machine
  const [currentState, setCurrentState] = useState<CharacterState>('standing');
  const [walkSpeed, setWalkSpeed] = useState<number>(2.8);
  const [runSpeed, setRunSpeed] = useState<number>(4.8);
  const [jumpStrength, setJumpStrength] = useState<number>(7.2);
  const [particleCountSetting, setParticleCountSetting] = useState<number>(220);
  const [walkDeformation, setWalkDeformation] = useState<number>(1.0);
  const [followCamera, setFollowCamera] = useState<boolean>(true);

  // Keyboard input state tracker
  const [isMovingLeft, setIsMovingLeft] = useState(false);
  const [isMovingRight, setIsMovingRight] = useState(false);
  const [isRunningKey, setIsRunningKey] = useState(false);

  // Render options
  const [renderMode, setRenderMode] = useState<RenderMode>('fluid');
  const [showCenterOfMass, setShowCenterOfMass] = useState(true);
  const [showBoundingBox, setShowBoundingBox] = useState(true);
  const [showVelocityVectors, setShowVelocityVectors] = useState(false);

  // Live Telemetry state
  const [telemetry, setTelemetry] = useState({
    particleCount: 220,
    cmX: 0,
    cmY: 0,
    speed: 0,
    vx: 0,
    vy: 0,
    width: 0,
    height: 0,
    aspectRatio: 1,
    rmsVelocity: 0,
    isSettled: false,
    forwardLeanAngle: 0,
    transitionWeight: 0,
    streamLength: 0,
    tailLength: 0,
    headDensityRatio: 1.0,
    activeState: '1. الوقوف (Standing Droplet)',
    controller: {
      x: 0,
      y: 1.5,
      vx: 0,
      vy: 0,
      isGrounded: false,
      isRunning: false,
      isJumping: false,
    },
  });

  // Physical parameters
  const [params, setParams] = useState({
    gravity: 9.8,
    dampingStrength: 0.40,
    springStrength: 0.18,
    viscousStrength: 0.22,
    surfaceTension: 0.25,
    cohesionField: 0.16,
  });

  // Mouse interaction state
  const mouseStateRef = useRef<{
    isDown: boolean;
    worldX: number;
    worldY: number;
    lastWorldX: number;
    lastWorldY: number;
  }>({
    isDown: false,
    worldX: 0,
    worldY: 0,
    lastWorldX: 0,
    lastWorldY: 0,
  });

  // Initialize simulation and canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const checkLiquidFun = () => {
      if (typeof window !== 'undefined' && window.b2World) {
        try {
          const sim = new WaterSimulation();
          const ok = sim.init(1.6);
          if (ok) {
            simRef.current = sim;
            const renderer = new WaterRenderer(canvas);
            rendererRef.current = renderer;

            const rect = canvas.getBoundingClientRect();
            renderer.resize(rect.width, rect.height);

            setIsLoaded(true);
          } else {
            setLoadError('فشل تشغيل بيئة LiquidFun الفيزيائية');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setLoadError(`خطأ أثناء تهيئة LiquidFun: ${msg}`);
        }
      } else {
        setTimeout(checkLiquidFun, 100);
      }
    };

    checkLiquidFun();

    const handleResize = () => {
      if (canvasRef.current && rendererRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        rendererRef.current.resize(rect.width, rect.height);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Sync render settings with renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.renderMode = renderMode;
      rendererRef.current.showCenterOfMass = showCenterOfMass;
      rendererRef.current.showBoundingBox = showBoundingBox;
      rendererRef.current.showVelocityVectors = showVelocityVectors;
      rendererRef.current.followCharacter = followCamera;
    }
  }, [renderMode, showCenterOfMass, showBoundingBox, showVelocityVectors, followCamera]);

  // Sync simulation controller parameters
  useEffect(() => {
    if (simRef.current) {
      simRef.current.controllerConfig.walkSpeed = walkSpeed;
      simRef.current.controllerConfig.runSpeed = runSpeed;
      simRef.current.controllerConfig.jumpImpulse = jumpStrength;
      simRef.current.walkDeformation = walkDeformation;
    }
  }, [walkSpeed, runSpeed, jumpStrength, walkDeformation]);

  // Keyboard navigation for Mario-style 2D Controller (Arrows, WASD, Space, Shift)
  useEffect(() => {
    const activeKeys: Record<string, boolean> = {};

    const updateInputs = () => {
      if (!simRef.current) return;
      const left = !!(activeKeys['ArrowLeft'] || activeKeys['a'] || activeKeys['A']);
      const right = !!(activeKeys['ArrowRight'] || activeKeys['d'] || activeKeys['D']);
      const run = !!(activeKeys['Shift'] || activeKeys['ShiftLeft'] || activeKeys['ShiftRight']);
      const jump = !!(activeKeys['ArrowUp'] || activeKeys['w'] || activeKeys['W'] || activeKeys[' ']);

      setIsMovingLeft(left);
      setIsMovingRight(right);
      setIsRunningKey(run);

      simRef.current.setMovementInput(left, right, run, jump);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      activeKeys[e.key] = true;
      if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (simRef.current) {
          simRef.current.triggerJump();
        }
      }
      updateInputs();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      delete activeKeys[e.key];
      updateInputs();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Main simulation & render loop
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;

      const sim = simRef.current;
      const renderer = rendererRef.current;

      if (sim && renderer && isPlaying) {
        // Handle mouse interaction
        const m = mouseStateRef.current;
        if (m.isDown) {
          const forceX = (m.worldX - m.lastWorldX) * 20;
          const forceY = (m.worldY - m.lastWorldY) * 20;
          sim.applyLocalImpulse(m.worldX, m.worldY, forceX, forceY, 0.55);
          m.lastWorldX = m.worldX;
          m.lastWorldY = m.worldY;
        }

        // Advance LiquidFun physics step
        sim.step(1 / 60);

        // Update telemetry state
        const t = sim.telemetry;
        setTelemetry({
          particleCount: t.particleCount,
          cmX: t.centerOfMass.x,
          cmY: t.centerOfMass.y,
          speed: t.velocity.speed,
          vx: t.velocity.vx,
          vy: t.velocity.vy,
          width: t.bounds.width,
          height: t.bounds.height,
          aspectRatio: t.bounds.aspectRatio,
          rmsVelocity: t.rmsVelocity,
          isSettled: t.isSettled,
          forwardLeanAngle: t.forwardLeanAngle,
          transitionWeight: t.transitionWeight,
          streamLength: t.streamLength,
          tailLength: t.tailLength,
          headDensityRatio: t.headDensityRatio,
          activeState: t.activeState,
          controller: t.controller,
        });

        setCurrentState(sim.activeState);
      }

      if (sim && renderer) {
        const m = mouseStateRef.current;
        renderer.render(sim, {
          x: m.worldX,
          y: m.worldY,
          active: m.isDown,
        });
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  // Mouse handlers on canvas
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !rendererRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scrX = e.clientX - rect.left;
    const scrY = e.clientY - rect.top;
    const worldPos = rendererRef.current.screenToWorld(scrX, scrY);

    mouseStateRef.current = {
      isDown: true,
      worldX: worldPos.x,
      worldY: worldPos.y,
      lastWorldX: worldPos.x,
      lastWorldY: worldPos.y,
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mouseStateRef.current.isDown || !canvasRef.current || !rendererRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scrX = e.clientX - rect.left;
    const scrY = e.clientY - rect.top;
    const worldPos = rendererRef.current.screenToWorld(scrX, scrY);

    mouseStateRef.current.worldX = worldPos.x;
    mouseStateRef.current.worldY = worldPos.y;
  }, []);

  const handleMouseUp = useCallback(() => {
    mouseStateRef.current.isDown = false;
  }, []);

  // Reset character
  const handleResetDroplet = (height: number) => {
    if (simRef.current) {
      simRef.current.resetDroplet(height);
    }
  };

  // Live particle count change (100 to 500)
  const handleParticleCountChange = (count: number) => {
    setParticleCountSetting(count);
    if (simRef.current) {
      simRef.current.setParticleCount(count);
    }
  };

  // Live physical parameter tuning
  const handleParamChange = (key: keyof typeof params, value: number) => {
    const updated = { ...params, [key]: value };
    setParams(updated);
    if (simRef.current) {
      simRef.current.updateParameters(updated);
    }
  };

  // Jump trigger
  const handleJump = () => {
    if (simRef.current) {
      simRef.current.triggerJump();
    }
  };

  return (
    <div className="w-full h-screen flex flex-col bg-slate-950 text-slate-100 font-sans select-none overflow-hidden" dir="rtl">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-5 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <span>مختبر محاكاة الشخصية المائية</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                LiquidFun 2D SPH
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 leading-none">
              متحكم مخفي (Mario-style 2D Controller) مع جسيمات مائية ديناميكية تتبعه بمرونة فيزيائية
            </p>
          </div>
        </div>

        {/* Top Active State Pill */}
        <nav aria-label="شريط حالات المحاكاة" className="hidden md:flex items-center gap-3 px-4 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-xs">
          <span className="text-slate-400 font-mono text-[11px]">الحالة الحالية:</span>
          <span className="font-semibold text-cyan-300 font-mono">
            {telemetry.activeState}
          </span>
          <span className="text-slate-600">·</span>
          <span className={`font-mono text-[11px] ${telemetry.controller.isGrounded ? 'text-emerald-400' : 'text-amber-400'}`}>
            {telemetry.controller.isGrounded ? '● ملامس للأرض/المنصة' : '▲ في الهواء'}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400 whitespace-nowrap text-xs">
            {telemetry.particleCount} جسيم محفوظ (100%)
          </span>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            title={isPlaying ? 'إيقاف مؤقت' : 'متابعة المحاكاة'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-400" />
                <span>إيقاف مؤقت</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                <span>تشغيل</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleResetDroplet(1.8)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-sm transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة الإسقاط</span>
          </button>
        </div>
      </header>

      {/* Main Sandbox Layout: Left/Center Stage (65%) + Right Control Deck (35%) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Stage Zone: Visual Physics Canvas */}
        <div className="flex-1 flex flex-col relative bg-slate-950 border-b lg:border-b-0 lg:border-l border-slate-800/80">
          {/* Canvas Floating Top Controls */}
          <div className="absolute top-4 right-4 z-10 flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-xl backdrop-blur-md shadow-lg">
            {/* Visual Render Modes */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950/80 rounded-lg border border-slate-800 text-xs">
              <span className="text-[10px] text-slate-400 px-2 font-medium">الرؤية:</span>
              <button
                onClick={() => setRenderMode('fluid')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  renderMode === 'fluid'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                سائل متصل
              </button>
              <button
                onClick={() => setRenderMode('particles')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  renderMode === 'particles'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                جسيمات ونواقل
              </button>
              <button
                onClick={() => setRenderMode('pressure')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  renderMode === 'pressure'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                خريطة الضغط SPH
              </button>
            </div>

            {/* Quick Overlays */}
            <button
              onClick={() => setShowCenterOfMass(!showCenterOfMass)}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                showCenterOfMass
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="إظهار مركز الكتلة"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFollowCamera(!followCamera)}
              className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors cursor-pointer ${
                followCamera
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              كاميرا تتبع: {followCamera ? 'مفعلة' : 'معطلة'}
            </button>
          </div>

          {/* Interactive Canvas */}
          <div className="flex-1 w-full h-full relative cursor-crosshair">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="w-full h-full block"
            />

            {/* Controls Overlay Legend in Bottom of Canvas */}
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 px-3 py-1.5 bg-slate-900/85 border border-slate-800 rounded-lg text-[11px] text-slate-300 backdrop-blur-sm">
              <span className="font-semibold text-cyan-400">تحكم Mario:</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">A</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">D</kbd> أو الأسهم للسير</span>
              <span className="text-slate-600">·</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">Shift</kbd> للجري السريع</span>
              <span className="text-slate-600">·</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">Space</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">W</kbd> للقفز</span>
            </div>

            {/* Load error banner */}
            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6">
                <div className="max-w-md bg-rose-950/80 border border-rose-800 p-5 rounded-2xl text-rose-200 text-sm">
                  <h3 className="font-bold text-base mb-2">تنبيه المحاكاة</h3>
                  <p>{loadError}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar Control Deck (35% Width) */}
        <aside className="w-full lg:w-[410px] bg-slate-900/60 border-t lg:border-t-0 border-slate-800 p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Section 1: Mario-style Player Controller */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span>المتحكم المخفي (Player Controller)</span>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {telemetry.controller.isGrounded ? 'مستقر على سطح' : 'طيران وسقوط'}
              </span>
            </div>

            {/* Direct Movement D-Pad Buttons */}
            <div className="grid grid-cols-4 gap-2">
              <button
                onMouseDown={() => {
                  if (simRef.current) simRef.current.setMovementInput(true, false, isRunningKey, false);
                  setIsMovingLeft(true);
                }}
                onMouseUp={() => {
                  if (simRef.current) simRef.current.setMovementInput(false, false, isRunningKey, false);
                  setIsMovingLeft(false);
                }}
                className={`py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                  isMovingLeft
                    ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                    : 'bg-slate-950/60 hover:bg-slate-800 text-slate-200 border-slate-800'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>يسار</span>
              </button>

              <button
                onClick={handleJump}
                className="py-2 text-xs font-semibold rounded-lg border bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border-amber-500/40 transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>قفز (Jump)</span>
              </button>

              <button
                onClick={() => {
                  const next = !isRunningKey;
                  setIsRunningKey(next);
                  if (simRef.current) simRef.current.inputRun = next;
                }}
                className={`py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                  isRunningKey
                    ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                    : 'bg-slate-950/60 hover:bg-slate-800 text-slate-200 border-slate-800'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isRunningKey ? 'جري نشط' : 'جري (Run)'}</span>
              </button>

              <button
                onMouseDown={() => {
                  if (simRef.current) simRef.current.setMovementInput(false, true, isRunningKey, false);
                  setIsMovingRight(true);
                }}
                onMouseUp={() => {
                  if (simRef.current) simRef.current.setMovementInput(false, false, isRunningKey, false);
                  setIsMovingRight(false);
                }}
                className={`py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                  isMovingRight
                    ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                    : 'bg-slate-950/60 hover:bg-slate-800 text-slate-200 border-slate-800'
                }`}
              >
                <span>يمين</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Controller Speed & Jump Parameters */}
            <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-slate-300">
                  <span>سرعة المشي (Walk Speed)</span>
                  <span className="font-mono text-cyan-400">{walkSpeed.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="4.5"
                  step="0.1"
                  value={walkSpeed}
                  onChange={(e) => setWalkSpeed(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-slate-300">
                  <span>سرعة الجري السريع (Sprint Speed)</span>
                  <span className="font-mono text-purple-400">{runSpeed.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min="3.0"
                  max="7.5"
                  step="0.1"
                  value={runSpeed}
                  onChange={(e) => setRunSpeed(parseFloat(e.target.value))}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-slate-300">
                  <span>قوة وارتفاع القفزة (Jump Impulse)</span>
                  <span className="font-mono text-amber-400">{jumpStrength.toFixed(1)} m/s</span>
                </div>
                <input
                  type="range"
                  min="4.0"
                  max="11.0"
                  step="0.2"
                  value={jumpStrength}
                  onChange={(e) => setJumpStrength(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400">
                  تتيح القفز والوصول إلى المنصات العلوية بارتفاعات 1.0m و 1.6m و 2.4m
                </span>
              </div>
            </div>
          </section>

          {/* Section 2: Dynamic Particle Body (Adjustable up to 500) */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>الجسم المائي (Particle Body)</span>
              </div>
              <span className="text-xs font-mono font-bold text-cyan-400">
                {telemetry.particleCount} جسيم
              </span>
            </div>

            {/* Particle Count Slider (100 to 500) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">عدد جسيمات الشخصية (حتى 500)</span>
                <span className="font-mono text-cyan-400 font-semibold">{particleCountSetting} جسيم</span>
              </div>
              <input
                type="range"
                min="100"
                max="500"
                step="20"
                value={particleCountSetting}
                onChange={(e) => handleParticleCountChange(parseInt(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>100 (خفيف)</span>
                <span>220 (متوازن)</span>
                <span>350 (غني)</span>
                <span>500 (كثيف جداً)</span>
              </div>
            </div>

            {/* Fluid deformation / tail stretch */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">مرونة استطالة وتدفق المائع</span>
                <span className="font-mono text-cyan-400">{walkDeformation.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={walkDeformation}
                onChange={(e) => setWalkDeformation(parseFloat(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400">
                تتحكم بمدى تدفق واستطالة الذيل المائي خلف المتحكم أثناء الحركة والقفز
              </span>
            </div>
          </section>

          {/* Section 3: Real-time Physical Telemetry */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <h3 className="text-xs font-semibold text-slate-200">
                القياسات الفيزيائية اللحظية (Telemetry)
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {telemetry.activeState}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 flex flex-col gap-0.5">
                <span className="text-slate-400 text-[11px]">عدد الجسيمات (Mass)</span>
                <span className="font-mono text-base font-bold text-cyan-400 tabular-nums">
                  {telemetry.particleCount}
                </span>
                <span className="text-[10px] text-emerald-400">حفظ تام (صفر حذف)</span>
              </div>

              <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 flex flex-col gap-0.5">
                <span className="text-slate-400 text-[11px]">سرعة المتحكم Vx</span>
                <span className="font-mono text-base font-bold text-slate-100 tabular-nums">
                  {telemetry.controller.vx.toFixed(2)} m/s
                </span>
                <span className="text-[10px] text-slate-400">العمودية Vy: {telemetry.controller.vy.toFixed(2)}</span>
              </div>

              <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 flex flex-col gap-0.5">
                <span className="text-slate-400 text-[11px]">موقع المتحكم X, Y</span>
                <span className="font-mono text-xs font-semibold text-cyan-300 tabular-nums">
                  ({telemetry.controller.x.toFixed(2)}, {telemetry.controller.y.toFixed(2)})m
                </span>
                <span className="text-[10px] text-slate-400">مركز الكتلة: ({telemetry.cmX.toFixed(2)}, {telemetry.cmY.toFixed(2)})</span>
              </div>

              <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60 flex flex-col gap-0.5">
                <span className="text-slate-400 text-[11px]">امتداد السائل الكلي</span>
                <span className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                  {telemetry.streamLength.toFixed(2)}m
                </span>
                <span className="text-[10px] text-slate-400">معامل التشوه: {telemetry.aspectRatio.toFixed(2)}</span>
              </div>
            </div>
          </section>

          {/* Section 4: Physics Tuner */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>معاملات المحرك الفيزيائي (Live Tuner)</span>
              </div>
              <button
                onClick={() => {
                  const defaults = {
                    gravity: 9.8,
                    dampingStrength: 0.40,
                    springStrength: 0.18,
                    viscousStrength: 0.22,
                    surfaceTension: 0.25,
                    cohesionField: 0.16,
                  };
                  setParams(defaults);
                  if (simRef.current) simRef.current.updateParameters(defaults);
                }}
                className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
              >
                القيم الافتراضية
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              {/* Gravity */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-slate-300">
                  <span>الجاذبية الأرضية (Gravity)</span>
                  <span className="font-mono text-cyan-400">{params.gravity.toFixed(1)} m/s²</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="0.5"
                  value={params.gravity}
                  onChange={(e) => handleParamChange('gravity', parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              {/* Spring Cohesion */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-slate-300">
                  <span>تماسك النوابض البيني (Spring Strength)</span>
                  <span className="font-mono text-cyan-400">
                    {params.springStrength.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.6"
                  step="0.01"
                  value={params.springStrength}
                  onChange={(e) => handleParamChange('springStrength', parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              {/* Surface Tension */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-slate-300">
                  <span>التوتر السطحي (Surface Tension)</span>
                  <span className="font-mono text-cyan-400">
                    {params.surfaceTension.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.6"
                  step="0.02"
                  value={params.surfaceTension}
                  onChange={(e) => handleParamChange('surfaceTension', parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              {/* Viscous Strength */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-slate-300">
                  <span>اللزوجة السائلة (Viscous Shear)</span>
                  <span className="font-mono text-cyan-400">
                    {params.viscousStrength.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.6"
                  step="0.02"
                  value={params.viscousStrength}
                  onChange={(e) => handleParamChange('viscousStrength', parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>
            </div>
          </section>

          {/* Quick Drop Tests */}
          <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-300">اختبار الإسقاط السريع:</span>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleResetDroplet(1.2)}
                className="py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors text-center cursor-pointer"
              >
                1.2m منخفض
              </button>
              <button
                onClick={() => handleResetDroplet(2.2)}
                className="py-1.5 text-xs bg-cyan-900/40 hover:bg-cyan-900/60 text-cyan-200 rounded-lg border border-cyan-700/50 transition-colors text-center cursor-pointer"
              >
                2.2m متوسط
              </button>
              <button
                onClick={() => handleResetDroplet(3.5)}
                className="py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors text-center cursor-pointer"
              >
                3.5m مرتفع
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
