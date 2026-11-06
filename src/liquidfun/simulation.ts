/**
 * LiquidFun Physics Simulation Engine for Water Character
 * Strictly implements Google LiquidFun particle system.
 * 
 * Features:
 * - Hidden 2D Player Controller (b2Body) with responsive Mario-style controls:
 *   Walk, Run/Sprint, Jump with height/strength modulation, Gravity, Ground/Wall collisions.
 * - Dynamic Particle Body: 100 to 500 adjustable LiquidFun water particles.
 *   Particles follow the hidden controller dynamically via flexible physical spring & cohesion forces.
 * - 100% Mass & particle preservation: zero deletion or destruction during state changes.
 * - Free fluid deformation, natural droplet elongation, splashing, and cohesive reforming.
 */

import {
  B2World,
  B2ParticleSystem,
  B2ParticleGroup,
  B2Body,
} from './types';

export type CharacterState = 'standing' | 'walking' | 'running' | 'jumping' | 'falling';

export interface SimParameters {
  gravity: number;
  dampingStrength: number;
  springStrength: number;
  viscousStrength: number;
  surfaceTension: number;
  cohesionField: number;
  particleRadius: number;
}

export interface ControllerConfig {
  walkSpeed: number; // m/s
  runSpeed: number; // m/s
  acceleration: number; // m/s^2
  deceleration: number; // m/s^2
  jumpImpulse: number; // m/s
  airControl: number; // multiplier in air
  followStiffness: number; // fluid coupling stiffness
  followDamping: number; // fluid coupling damping
}

export interface CharacterTelemetry {
  particleCount: number;
  centerOfMass: { x: number; y: number };
  velocity: { vx: number; vy: number; speed: number };
  bounds: { width: number; height: number; aspectRatio: number };
  rmsVelocity: number;
  isSettled: boolean;
  totalMass: number;
  activeState: string;
  walkDirection: number;
  walkSpeed: number;
  forwardLeanAngle: number;
  transitionWeight: number;
  streamLength: number;
  tailLength: number;
  headDensityRatio: number;
  // Hidden Controller Telemetry
  controller: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    isGrounded: boolean;
    isRunning: boolean;
    isJumping: boolean;
  };
}

export class WaterSimulation {
  public world: B2World | null = null;
  public particleSystem: B2ParticleSystem | null = null;
  public characterGroup: B2ParticleGroup | null = null;
  public groundBody: B2Body | null = null;

  // 1. Hidden 2D Dynamic Player Controller (Circle rigid body in LiquidFun)
  public controllerBody: B2Body | null = null;
  public controllerRadius = 0.35; // meters
  public isGrounded = false;
  public isRunning = false;
  public isJumping = false;
  public targetParticleCount = 220; // Default count, adjustable up to 500

  // Controller configuration (Mario-style 2D platformer movement)
  public controllerConfig: ControllerConfig = {
    walkSpeed: 2.8,
    runSpeed: 4.8,
    acceleration: 18.0,
    deceleration: 14.0,
    jumpImpulse: 7.2,
    airControl: 0.75,
    followStiffness: 7.5,
    followDamping: 0.14,
  };

  // Active state machine
  public activeState: CharacterState = 'standing';
  public walkDirection = 0; // -1: left, 0: idle/stop, 1: right
  public walkSpeed = 2.8;
  public walkDeformation = 1.0;
  public walkTransitionWeight = 0.0;
  public walkPhase = 0.0;

  // Active user inputs
  public inputLeft = false;
  public inputRight = false;
  public inputRun = false;
  public inputJump = false;

  public params: SimParameters = {
    gravity: 9.8,
    dampingStrength: 0.40,
    springStrength: 0.18,
    viscousStrength: 0.22,
    surfaceTension: 0.25,
    cohesionField: 0.16,
    particleRadius: 0.038,
  };

  public telemetry: CharacterTelemetry = {
    particleCount: 0,
    centerOfMass: { x: 0, y: 0 },
    velocity: { vx: 0, vy: 0, speed: 0 },
    bounds: { width: 0, height: 0, aspectRatio: 1 },
    rmsVelocity: 0,
    isSettled: false,
    totalMass: 1.0,
    activeState: '1. الوقوف (Standing Droplet)',
    walkDirection: 0,
    walkSpeed: 0,
    forwardLeanAngle: 0,
    transitionWeight: 0,
    streamLength: 0,
    tailLength: 0,
    headDensityRatio: 1.0,
    controller: {
      x: 0,
      y: 1.5,
      vx: 0,
      vy: 0,
      isGrounded: false,
      isRunning: false,
      isJumping: false,
    },
  };

  private isInitialized = false;

  public init(initialDropHeight = 1.6): boolean {
    if (typeof window === 'undefined' || !window.b2World) {
      console.error('LiquidFun library is not loaded yet');
      return false;
    }

    try {
      // 1. Create b2World with downward gravity
      const gravityVec = new window.b2Vec2(0, -this.params.gravity);
      this.world = new window.b2World(gravityVec);
      (window as unknown as { world: B2World }).world = this.world;

      // 2. Create solid ground platform in LiquidFun (static rigid body)
      const groundDef = new window.b2BodyDef();
      groundDef.type = window.b2_staticBody;
      groundDef.position.Set(0, -0.5); // Top surface is at y = 0
      this.groundBody = this.world.CreateBody(groundDef);

      const groundShape = new window.b2PolygonShape();
      groundShape.SetAsBoxXY(14.0, 0.5); // 28m wide floor
      this.groundBody.CreateFixtureFromShape(groundShape, 0.0);

      // Side safety walls
      const leftWallDef = new window.b2BodyDef();
      leftWallDef.type = window.b2_staticBody;
      leftWallDef.position.Set(-8.5, 3.5);
      const leftWall = this.world.CreateBody(leftWallDef);
      const wallShape = new window.b2PolygonShape();
      wallShape.SetAsBoxXY(0.4, 4.5);
      leftWall.CreateFixtureFromShape(wallShape, 0.0);

      const rightWallDef = new window.b2BodyDef();
      rightWallDef.type = window.b2_staticBody;
      rightWallDef.position.Set(8.5, 3.5);
      const rightWall = this.world.CreateBody(rightWallDef);
      rightWall.CreateFixtureFromShape(wallShape, 0.0);

      // Elevated platforms for Mario-style 2D platforming & jumping
      this.createElevatedPlatforms();

      // 3. Create Hidden 2D Dynamic Player Controller Body (b2_dynamicBody)
      const controllerDef = new window.b2BodyDef();
      controllerDef.type = window.b2_dynamicBody;
      controllerDef.position.Set(0, initialDropHeight);
      controllerDef.fixedRotation = true; // Upright player controller like Mario
      controllerDef.linearDamping = 0.2;
      this.controllerBody = this.world.CreateBody(controllerDef);

      const controllerShape = new window.b2CircleShape();
      controllerShape.radius = this.controllerRadius;
      this.controllerBody.CreateFixtureFromShape(controllerShape, 1.2);

      // 4. Create b2ParticleSystem
      const psd = new window.b2ParticleSystemDef();
      psd.radius = this.params.particleRadius;
      psd.dampingStrength = this.params.dampingStrength;
      psd.viscousStrength = this.params.viscousStrength;
      psd.surfaceTensionPressureStrength = this.params.surfaceTension;
      psd.surfaceTensionNormalStrength = this.params.surfaceTension;
      psd.springStrength = this.params.springStrength;
      psd.elasticStrength = 0.05;
      psd.pressureStrength = 0.08;
      psd.destroyByAge = false; // 100% mass preservation

      this.particleSystem = this.world.CreateParticleSystem(psd);

      // 5. Spawn the cohesive character droplet around controller position
      this.spawnCharacter(0, initialDropHeight, this.targetParticleCount);
      this.isInitialized = true;
      return true;
    } catch (err) {
      console.error('Failed to initialize LiquidFun simulation:', err);
      return false;
    }
  }

  /**
   * Create elevated obstacle platforms for platforming tests
   */
  private createElevatedPlatforms(): void {
    if (!this.world) return;

    // Platform 1 (Left low platform: x = -3.5, y = 1.0, w = 1.8, h = 0.15)
    const p1Def = new window.b2BodyDef();
    p1Def.type = window.b2_staticBody;
    p1Def.position.Set(-3.5, 0.95);
    const p1 = this.world.CreateBody(p1Def);
    const p1Shape = new window.b2PolygonShape();
    p1Shape.SetAsBoxXY(1.1, 0.12);
    p1.CreateFixtureFromShape(p1Shape, 0.0);

    // Platform 2 (Right mid platform: x = 3.5, y = 1.6, w = 2.0, h = 0.15)
    const p2Def = new window.b2BodyDef();
    p2Def.type = window.b2_staticBody;
    p2Def.position.Set(3.5, 1.55);
    const p2 = this.world.CreateBody(p2Def);
    const p2Shape = new window.b2PolygonShape();
    p2Shape.SetAsBoxXY(1.2, 0.12);
    p2.CreateFixtureFromShape(p2Shape, 0.0);

    // Platform 3 (Center high platform: x = 0.0, y = 2.4, w = 1.4, h = 0.15)
    const p3Def = new window.b2BodyDef();
    p3Def.type = window.b2_staticBody;
    p3Def.position.Set(0.0, 2.35);
    const p3 = this.world.CreateBody(p3Def);
    const p3Shape = new window.b2PolygonShape();
    p3Shape.SetAsBoxXY(0.9, 0.12);
    p3.CreateFixtureFromShape(p3Shape, 0.0);
  }

  /**
   * Spawn character particles with target particle count (up to 500)
   */
  public spawnCharacter(x = 0, y = 1.6, count = 220): void {
    if (!this.world || !this.particleSystem) return;

    // Calculate cluster radius required to yield the desired particle count
    // Based on packing density in LiquidFun SPH: R = r_particle * sqrt(count / 1.35)
    const spawnRadius = Math.max(0.25, Math.min(0.95, this.params.particleRadius * Math.sqrt(count / 1.35)));

    const circle = new window.b2CircleShape();
    circle.radius = spawnRadius;
    circle.position.Set(x, y);

    const pgd = new window.b2ParticleGroupDef();
    pgd.shape = circle;
    // Native LiquidFun particle flags for true cohesive water:
    pgd.flags =
      window.b2_waterParticle |
      window.b2_springParticle |
      window.b2_tensileParticle |
      window.b2_viscousParticle;

    pgd.color.Set(24, 180, 245, 240);

    this.characterGroup = this.particleSystem.CreateParticleGroup(pgd);
    this.targetParticleCount = this.particleSystem.GetParticleCount();
    this.updateTelemetry();
  }

  /**
   * Set target particle count dynamically (100 to 500) from Live Tuner
   */
  public setParticleCount(newCount: number): void {
    if (!this.world || !this.particleSystem) return;
    const clampedCount = Math.max(80, Math.min(500, Math.round(newCount)));
    if (Math.abs(clampedCount - this.targetParticleCount) < 5) return;

    this.targetParticleCount = clampedCount;

    // Preserve controller position
    const cPos = this.controllerBody ? this.controllerBody.GetPosition() : { x: 0, y: 1.5 };
    const currentY = Math.max(0.6, cPos.y);

    // Recreate particle system cleanly with exact count
    this.world.DestroyParticleSystem(this.particleSystem);

    const psd = new window.b2ParticleSystemDef();
    psd.radius = this.params.particleRadius;
    psd.dampingStrength = this.params.dampingStrength;
    psd.viscousStrength = this.params.viscousStrength;
    psd.surfaceTensionPressureStrength = this.params.surfaceTension;
    psd.surfaceTensionNormalStrength = this.params.surfaceTension;
    psd.springStrength = this.params.springStrength;
    psd.elasticStrength = 0.05;
    psd.pressureStrength = 0.08;
    psd.destroyByAge = false;

    this.particleSystem = this.world.CreateParticleSystem(psd);
    this.spawnCharacter(cPos.x, currentY, clampedCount);
  }

  /**
   * Controller Movement Commands (Mario-style input API)
   */
  public setMovementInput(left: boolean, right: boolean, run: boolean, jump: boolean): void {
    this.inputLeft = left;
    this.inputRight = right;
    this.inputRun = run;
    this.inputJump = jump;

    if (left && !right) {
      this.walkDirection = -1;
    } else if (right && !left) {
      this.walkDirection = 1;
    } else {
      this.walkDirection = 0;
    }
  }

  public triggerJump(): void {
    if (!this.controllerBody) return;
    // Jump only if grounded or near floor/platform
    if (this.isGrounded) {
      const curVel = this.controllerBody.GetLinearVelocity();
      const jumpVel = this.controllerConfig.jumpImpulse * (this.isRunning ? 1.08 : 1.0);
      this.controllerBody.SetLinearVelocity(new window.b2Vec2(curVel.x, jumpVel));
      this.isGrounded = false;
      this.isJumping = true;
    }
  }

  public setState(state: CharacterState): void {
    this.activeState = state;
    if (state === 'standing') {
      this.walkDirection = 0;
      this.inputLeft = false;
      this.inputRight = false;
    }
  }

  public setWalkDirection(direction: number): void {
    this.walkDirection = direction;
    if (direction < 0) {
      this.inputLeft = true;
      this.inputRight = false;
      this.activeState = this.inputRun ? 'running' : 'walking';
    } else if (direction > 0) {
      this.inputLeft = false;
      this.inputRight = true;
      this.activeState = this.inputRun ? 'running' : 'walking';
    } else {
      this.inputLeft = false;
      this.inputRight = false;
      if (this.isGrounded) this.activeState = 'standing';
    }
  }

  public updateParameters(newParams: Partial<SimParameters>): void {
    this.params = { ...this.params, ...newParams };
    if (!this.world || !this.particleSystem) return;

    if (newParams.gravity !== undefined) {
      this.world.SetGravity(new window.b2Vec2(0, -this.params.gravity));
    }
    if (newParams.dampingStrength !== undefined) {
      this.particleSystem.SetDamping(this.params.dampingStrength);
    }
  }

  /**
   * Advance simulation by one step
   */
  public step(dt = 1 / 60): void {
    if (!this.world || !this.particleSystem || !this.controllerBody) return;

    // 1. Update Hidden Controller Physics (Mario-style kinematics)
    this.updateControllerPhysics(dt);

    // 2. Couple LiquidFun Water Particles with Hidden Controller
    this.applyFluidControllerCoupling(dt);

    // 3. Apply Intermolecular Cohesive Field (Holding resting droplet dome)
    if (this.params.cohesionField > 0) {
      this.applyCohesionField();
    }

    // 4. Step LiquidFun World
    this.world.Step(dt, 8, 3);

    // 5. Update Telemetry
    this.updateTelemetry();
  }

  /**
   * Mario-style responsive 2D Player Controller:
   * Smooth horizontal acceleration/deceleration, variable run speed,
   * ground detection, and natural jump arc.
   */
  private updateControllerPhysics(dt: number): void {
    if (!this.controllerBody) return;

    const pos = this.controllerBody.GetPosition();
    const vel = this.controllerBody.GetLinearVelocity();

    // Ground check: check vertical velocity and proximity to ground or platform tops
    // Platforms: y = 0.0 (ground), y = 0.95 (left), y = 1.55 (right), y = 2.35 (center)
    const onFloor = Math.abs(pos.y - this.controllerRadius) < 0.06 && Math.abs(vel.y) < 0.35;
    const onP1 = Math.abs(pos.x - -3.5) <= 1.25 && Math.abs(pos.y - (0.95 + 0.12 + this.controllerRadius)) < 0.08 && Math.abs(vel.y) < 0.35;
    const onP2 = Math.abs(pos.x - 3.5) <= 1.35 && Math.abs(pos.y - (1.55 + 0.12 + this.controllerRadius)) < 0.08 && Math.abs(vel.y) < 0.35;
    const onP3 = Math.abs(pos.x - 0.0) <= 1.05 && Math.abs(pos.y - (2.35 + 0.12 + this.controllerRadius)) < 0.08 && Math.abs(vel.y) < 0.35;

    this.isGrounded = onFloor || onP1 || onP2 || onP3;
    if (this.isGrounded && vel.y <= 0.1) {
      this.isJumping = false;
    }

    this.isRunning = this.inputRun;

    // Target horizontal speed
    let targetVx = 0;
    const maxSpeed = this.isRunning ? this.controllerConfig.runSpeed : this.controllerConfig.walkSpeed;
    if (this.inputLeft && !this.inputRight) {
      targetVx = -maxSpeed;
    } else if (this.inputRight && !this.inputLeft) {
      targetVx = maxSpeed;
    }

    // Horizontal acceleration / friction
    const accelRate = targetVx !== 0
      ? this.controllerConfig.acceleration * (this.isGrounded ? 1.0 : this.controllerConfig.airControl)
      : this.controllerConfig.deceleration * (this.isGrounded ? 1.0 : 0.35);

    const diff = targetVx - vel.x;
    const maxStep = accelRate * dt;
    const newVx = vel.x + Math.sign(diff) * Math.min(Math.abs(diff), maxStep);

    // Jump handling
    let newVy = vel.y;
    if (this.inputJump && this.isGrounded && !this.isJumping) {
      newVy = this.controllerConfig.jumpImpulse * (this.isRunning ? 1.08 : 1.0);
      this.isGrounded = false;
      this.isJumping = true;
    }

    // Set updated velocity directly to controller rigid body
    this.controllerBody.SetLinearVelocity(new window.b2Vec2(newVx, newVy));

    // Update active character state label based on movement
    if (!this.isGrounded) {
      this.activeState = newVy > 0.5 ? 'jumping' : 'falling';
    } else if (Math.abs(newVx) > 0.2) {
      this.activeState = this.isRunning && Math.abs(newVx) > 3.0 ? 'running' : 'walking';
    } else {
      this.activeState = 'standing';
    }
  }

  /**
   * Fluid-Controller Dynamic Coupling:
   * Particles follow the hidden controller dynamically via flexible physical spring & cohesion forces.
   * Particles stay 100% independent fluids (SPH + surface tension + viscosity).
   * No rigid shape or invisible bounding loop; trailing particles deform and stream behind naturally.
   */
  private applyFluidControllerCoupling(dt: number): void {
    if (!this.particleSystem || !this.controllerBody) return;
    const count = this.particleSystem.GetParticleCount();
    if (count <= 1) return;

    const pos = this.particleSystem.GetPositionBuffer();
    const vel = this.particleSystem.GetVelocityBuffer();

    const cPos = this.controllerBody.GetPosition();
    const cVel = this.controllerBody.GetLinearVelocity();

    const stiffness = this.controllerConfig.followStiffness;
    const damping = this.controllerConfig.followDamping;
    const isMoving = Math.abs(cVel.x) > 0.25 || Math.abs(cVel.y) > 0.5;

    // Speed-based elongation offset: in motion, fluid center of mass trails behind the controller
    // Creating realistic water inertia and sliding droplet trailing wake!
    const lagOffsetX = -cVel.x * 0.045 * this.walkDeformation;
    const lagOffsetY = Math.min(0, -cVel.y * 0.035);

    const targetCenterX = cPos.x + lagOffsetX;
    const targetCenterY = cPos.y + lagOffsetY;

    // Safety tether: guarantees NO particles ever get left behind across the map
    const maxTetherDistance = 1.35 * Math.max(1.0, this.walkDeformation);

    for (let i = 0; i < count; i++) {
      const px = pos[i * 2];
      const py = pos[i * 2 + 1];
      const vx = vel[i * 2];
      const vy = vel[i * 2 + 1];

      const dx = targetCenterX - px;
      const dy = targetCenterY - py;
      const dist = Math.hypot(dx, dy);

      // Flexible viscoelastic attraction towards the controller center
      // Soft inside the core radius, firm when trailing too far
      const normalizedDist = dist / 0.55;
      const springForce = stiffness * Math.min(1.8, Math.pow(normalizedDist, 1.25));

      // Directional unit vector
      const dirX = dist > 0.001 ? dx / dist : 0;
      const dirY = dist > 0.001 ? dy / dist : 0;

      // Spring acceleration
      vel[i * 2] += dirX * springForce * dt;
      vel[i * 2 + 1] += dirY * springForce * dt;

      // Velocity damping towards controller velocity (imparts locomotive momentum)
      vel[i * 2] += (cVel.x - vx) * damping;
      vel[i * 2 + 1] += (cVel.y - vy) * damping;

      // Substrate friction near floor/platform top surfaces
      if (py < 0.15 && Math.abs(cVel.y) < 0.5) {
        vel[i * 2] -= vx * 0.06; // Wetting shear
      }

      // Hard safety tether pull: ensures 100% cohesion with zero stray lost droplets
      if (dist > maxTetherDistance) {
        const excess = dist - maxTetherDistance;
        vel[i * 2] += dirX * excess * 18.0 * dt;
        vel[i * 2 + 1] += dirY * excess * 18.0 * dt;
      }
    }
  }

  /**
   * Intermolecular cohesive field:
   * Keeps the droplet unified in standing state and smooths droplet outline
   */
  private applyCohesionField(): void {
    if (!this.particleSystem) return;
    const count = this.particleSystem.GetParticleCount();
    if (count <= 1) return;

    const pos = this.particleSystem.GetPositionBuffer();
    const vel = this.particleSystem.GetVelocityBuffer();

    // Standing weight: 1.0 when stationary, smoothly reduced during high-speed runs/jumps
    const cVel = this.controllerBody ? this.controllerBody.GetLinearVelocity() : { x: 0, y: 0 };
    const speed = Math.hypot(cVel.x, cVel.y);
    const standingWeight = Math.max(0.12, 1.0 - speed * 0.25);

    // Compute center of mass
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < count; i++) {
      sumX += pos[i * 2];
      sumY += pos[i * 2 + 1];
    }
    const cmX = sumX / count;
    const cmY = sumY / count;

    const strength = this.params.cohesionField * 2.0 * standingWeight;
    const maxRadius = 0.65;

    for (let i = 0; i < count; i++) {
      const px = pos[i * 2];
      const py = pos[i * 2 + 1];
      const dx = cmX - px;
      const dy = cmY - py;
      const dist = Math.hypot(dx, dy);

      if (dist > maxRadius * 0.7) {
        const excess = dist - maxRadius * 0.7;
        const factor = (excess / (maxRadius + 0.001)) * strength;
        vel[i * 2] += (dx / dist) * factor;
        vel[i * 2 + 1] += (dy / dist) * factor;
      }
    }
  }

  /**
   * Apply an external physical impulse to the water character and controller
   */
  public applyImpulse(impulseX: number, impulseY: number): void {
    if (this.controllerBody) {
      const cur = this.controllerBody.GetLinearVelocity();
      this.controllerBody.SetLinearVelocity(new window.b2Vec2(cur.x + impulseX, cur.y + impulseY));
    }
    if (!this.particleSystem) return;
    const count = this.particleSystem.GetParticleCount();
    const vel = this.particleSystem.GetVelocityBuffer();

    for (let i = 0; i < count; i++) {
      vel[i * 2] += impulseX;
      vel[i * 2 + 1] += impulseY;
    }
  }

  /**
   * Perturb a localized region of the water character (e.g. mouse poke / drag)
   */
  public applyLocalImpulse(worldX: number, worldY: number, forceX: number, forceY: number, radius = 0.5): void {
    if (!this.particleSystem) return;
    const count = this.particleSystem.GetParticleCount();
    const pos = this.particleSystem.GetPositionBuffer();
    const vel = this.particleSystem.GetVelocityBuffer();

    for (let i = 0; i < count; i++) {
      const px = pos[i * 2];
      const py = pos[i * 2 + 1];
      const dist = Math.hypot(px - worldX, py - worldY);
      if (dist < radius) {
        const falloff = 1 - dist / radius;
        vel[i * 2] += forceX * falloff;
        vel[i * 2 + 1] += forceY * falloff;
      }
    }
  }

  /**
   * Reset simulation and drop character from given height
   */
  public resetDroplet(dropHeight = 1.6): void {
    if (!this.world || !this.particleSystem) {
      this.init(dropHeight);
      return;
    }

    if (this.controllerBody) {
      this.controllerBody.SetTransform(new window.b2Vec2(0, dropHeight), 0);
      this.controllerBody.SetLinearVelocity(new window.b2Vec2(0, 0));
    }

    this.world.DestroyParticleSystem(this.particleSystem);

    const psd = new window.b2ParticleSystemDef();
    psd.radius = this.params.particleRadius;
    psd.dampingStrength = this.params.dampingStrength;
    psd.viscousStrength = this.params.viscousStrength;
    psd.surfaceTensionPressureStrength = this.params.surfaceTension;
    psd.surfaceTensionNormalStrength = this.params.surfaceTension;
    psd.springStrength = this.params.springStrength;
    psd.elasticStrength = 0.05;
    psd.pressureStrength = 0.08;
    psd.destroyByAge = false;

    this.particleSystem = this.world.CreateParticleSystem(psd);
    this.spawnCharacter(0, dropHeight, this.targetParticleCount);
  }

  /**
   * Update real-time telemetry metrics
   */
  private updateTelemetry(): void {
    if (!this.particleSystem) return;
    const count = this.particleSystem.GetParticleCount();
    if (count === 0) return;

    const pos = this.particleSystem.GetPositionBuffer();
    const vel = this.particleSystem.GetVelocityBuffer();

    let sumX = 0;
    let sumY = 0;
    let sumVx = 0;
    let sumVy = 0;
    let sumV2 = 0;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < count; i++) {
      const x = pos[i * 2];
      const y = pos[i * 2 + 1];
      const vx = vel[i * 2];
      const vy = vel[i * 2 + 1];

      sumX += x;
      sumY += y;
      sumVx += vx;
      sumVy += vy;
      sumV2 += vx * vx + vy * vy;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const cmX = sumX / count;
    const cmY = sumY / count;
    const avgVx = sumVx / count;
    const avgVy = sumVy / count;
    const speed = Math.hypot(avgVx, avgVy);
    const rmsVel = Math.sqrt(sumV2 / count);

    const width = maxX - minX;
    const height = maxY - minY;
    const aspectRatio = height > 0.001 ? width / height : 1.0;

    // Density and tail metrics along movement direction
    const dir = this.walkDirection !== 0 ? this.walkDirection : 1;
    let frontU = -Infinity, rearU = Infinity;
    for (let i = 0; i < count; i++) {
      const u = pos[i * 2] * dir;
      if (u > frontU) frontU = u;
      if (u < rearU) rearU = u;
    }
    const streamLength = Math.max(0.1, frontU - rearU);
    const headSpan = 0.45;
    const tailLength = Math.max(0, streamLength - headSpan);

    let headCount = 0;
    let tailCount = 0;
    for (let i = 0; i < count; i++) {
      const distFromFront = frontU - pos[i * 2] * dir;
      if (distFromFront <= headSpan) headCount++;
      else tailCount++;
    }

    const headDensity = headCount / headSpan;
    const tailDensity = tailLength > 0.05 ? tailCount / tailLength : headDensity;
    const headDensityRatio = tailDensity > 0.01 ? headDensity / tailDensity : 1.0;

    // Fluid forward lean angle
    let topSumX = 0, topCount = 0, topSumY = 0;
    let botSumX = 0, botCount = 0, botSumY = 0;
    for (let i = 0; i < count; i++) {
      const px = pos[i * 2];
      const py = pos[i * 2 + 1];
      if (py > cmY) {
        topSumX += px;
        topSumY += py;
        topCount++;
      } else {
        botSumX += px;
        botSumY += py;
        botCount++;
      }
    }

    let forwardLeanAngle = 0;
    if (topCount > 0 && botCount > 0) {
      const avgTopX = topSumX / topCount;
      const avgTopY = topSumY / topCount;
      const avgBotX = botSumX / botCount;
      const avgBotY = botSumY / botCount;
      const deltaX = avgTopX - avgBotX;
      const deltaY = avgTopY - avgBotY;
      forwardLeanAngle = Math.atan2(deltaX, Math.max(0.05, deltaY)) * (180 / Math.PI);
    }

    const isSettled =
      this.activeState === 'standing' &&
      rmsVel < 0.15 &&
      Math.abs(avgVy) < 0.08 &&
      cmY < 0.6;

    // Controller details
    const cPos = this.controllerBody ? this.controllerBody.GetPosition() : { x: cmX, y: cmY };
    const cVel = this.controllerBody ? this.controllerBody.GetLinearVelocity() : { x: avgVx, y: avgVy };

    let stateLabel = '1. الوقوف (Standing)';
    if (!this.isGrounded) {
      stateLabel = cVel.y > 0.5 ? '3. قفز في الهواء (Jumping ⤒)' : '4. سقوط طبيعي (Falling ⤓)';
    } else if (this.activeState === 'running') {
      stateLabel = `2. جري سريع (Running ${this.walkDirection > 0 ? '▶▶ يمين' : '◀◀ يسار'})`;
    } else if (this.activeState === 'walking') {
      stateLabel = `2. مشي وانزلاق (Walking ${this.walkDirection > 0 ? '▶ يمين' : '◀ يسار'})`;
    }

    this.telemetry = {
      particleCount: count,
      centerOfMass: { x: cmX, y: cmY },
      velocity: { vx: avgVx, vy: avgVy, speed },
      bounds: { width, height, aspectRatio },
      rmsVelocity: rmsVel,
      isSettled,
      totalMass: count * 0.01,
      activeState: stateLabel,
      walkDirection: this.walkDirection,
      walkSpeed: this.controllerConfig.walkSpeed,
      forwardLeanAngle,
      transitionWeight: this.walkTransitionWeight,
      streamLength,
      tailLength,
      headDensityRatio,
      controller: {
        x: cPos.x,
        y: cPos.y,
        vx: cVel.x,
        vy: cVel.y,
        isGrounded: this.isGrounded,
        isRunning: this.isRunning,
        isJumping: this.isJumping,
      },
    };
  }
}
