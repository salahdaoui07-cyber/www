/**
 * LiquidFun TypeScript Declarations
 * Mapped directly to Google LiquidFun Emscripten bindings.
 */

export interface B2Vec2 {
  x: number;
  y: number;
  Set(x: number, y: number): void;
}

export interface B2ParticleColor {
  r: number;
  g: number;
  b: number;
  a: number;
  Set(r: number, g: number, b: number, a: number): void;
}

export interface B2CircleShape {
  radius: number;
  position: B2Vec2;
}

export interface B2PolygonShape {
  SetAsBoxXY(hx: number, hy: number): void;
  vertices: B2Vec2[];
}

export interface B2BodyDef {
  type: number;
  position: B2Vec2;
  fixedRotation?: boolean;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
}

export interface B2FixtureDef {
  density: number;
  friction: number;
  restitution: number;
  shape: unknown;
  isSensor?: boolean;
}

export interface B2Fixture {
  GetUserData(): unknown;
}

export interface B2Body {
  ptr: number;
  CreateFixtureFromShape(shape: unknown, density: number): B2Fixture;
  SetTransform(pos: B2Vec2, angle: number): void;
  GetPosition(): B2Vec2;
  GetLinearVelocity(): B2Vec2;
  SetLinearVelocity(v: B2Vec2): void;
  ApplyLinearImpulse?(impulse: B2Vec2, point: B2Vec2, wake?: boolean): void;
  ApplyForceToCenter?(force: B2Vec2, wake?: boolean): void;
  SetAwake?(flag: boolean): void;
}

export interface B2ParticleSystemDef {
  radius: number;
  dampingStrength: number;
  pressureStrength: number;
  viscousStrength: number;
  surfaceTensionPressureStrength: number;
  surfaceTensionNormalStrength: number;
  springStrength: number;
  elasticStrength: number;
  repulsiveStrength: number;
  powderStrength: number;
  ejectionStrength: number;
  staticPressureStrength: number;
  staticPressureRelaxation: number;
  staticPressureIterations: number;
  colorMixingStrength: number;
  destroyByAge: boolean;
  lifetimeGranularity: number;
}

export interface B2ParticleGroupDef {
  angle: number;
  angularVelocity: number;
  color: B2ParticleColor;
  flags: number;
  groupFlags: number;
  lifetime: number;
  linearVelocity: B2Vec2;
  position: B2Vec2;
  shape: unknown;
  strength: number;
  userData: unknown;
}

export interface B2ParticleGroup {
  ptr: number;
  GetParticleCount(): number;
  GetBufferIndex(): number;
  GetGroupFlags(): number;
  SetGroupFlags(flags: number): void;
  ApplyForce(force: B2Vec2): void;
  ApplyLinearImpulse(impulse: B2Vec2): void;
  DestroyParticles(flag?: number): void;
}

export interface B2ParticleSystem {
  ptr: number;
  radius: number;
  dampingStrength: number;
  density: number;
  gravityScale: number;
  CreateParticleGroup(pgd: B2ParticleGroupDef): B2ParticleGroup;
  GetParticleCount(): number;
  GetPositionBuffer(): Float32Array;
  GetVelocityBuffer(): Float32Array;
  GetColorBuffer(): Uint8Array;
  SetDamping(damping: number): void;
  SetDensity(density: number): void;
  SetRadius(radius: number): void;
  SetGravityScale(gravityScale: number): void;
}

export interface B2World {
  ptr: number;
  CreateBody(bodyDef: B2BodyDef): B2Body;
  CreateParticleSystem(psd: B2ParticleSystemDef): B2ParticleSystem;
  DestroyBody(body: B2Body): void;
  DestroyParticleSystem(ps: B2ParticleSystem): void;
  Step(timeStep: number, velocityIterations: number, positionIterations: number): void;
  SetGravity(gravity: B2Vec2): void;
}

export interface LiquidFunGlobal {
  b2Vec2: new (x?: number, y?: number) => B2Vec2;
  b2World: new (gravity: B2Vec2) => B2World;
  b2BodyDef: new () => B2BodyDef;
  b2FixtureDef: new () => B2FixtureDef;
  b2PolygonShape: new () => B2PolygonShape;
  b2CircleShape: new () => B2CircleShape;
  b2ParticleColor: new (r?: number, g?: number, b?: number, a?: number) => B2ParticleColor;
  b2ParticleSystemDef: new () => B2ParticleSystemDef;
  b2ParticleGroupDef: new () => B2ParticleGroupDef;

  // Particle Flags
  b2_waterParticle: number;
  b2_zombieParticle: number;
  b2_wallParticle: number;
  b2_springParticle: number;
  b2_elasticParticle: number;
  b2_viscousParticle: number;
  b2_powderParticle: number;
  b2_tensileParticle: number;
  b2_colorMixingParticle: number;
  b2_destructionListenerParticle: number;
  b2_barrierParticle: number;
  b2_staticPressureParticle: number;
  b2_reactiveParticle: number;
  b2_repulsiveParticle: number;

  // Group Flags
  b2_solidParticleGroup: number;
  b2_rigidParticleGroup: number;
  b2_particleGroupCanBeEmpty: number;

  // Body types
  b2_staticBody: number;
  b2_kinematicBody: number;
  b2_dynamicBody: number;
}

declare global {
  interface Window {
    world?: B2World;
    b2Vec2: LiquidFunGlobal['b2Vec2'];
    b2World: LiquidFunGlobal['b2World'];
    b2BodyDef: LiquidFunGlobal['b2BodyDef'];
    b2FixtureDef: LiquidFunGlobal['b2FixtureDef'];
    b2PolygonShape: LiquidFunGlobal['b2PolygonShape'];
    b2CircleShape: LiquidFunGlobal['b2CircleShape'];
    b2ParticleColor: LiquidFunGlobal['b2ParticleColor'];
    b2ParticleSystemDef: LiquidFunGlobal['b2ParticleSystemDef'];
    b2ParticleGroupDef: LiquidFunGlobal['b2ParticleGroupDef'];

    b2_waterParticle: number;
    b2_zombieParticle: number;
    b2_wallParticle: number;
    b2_springParticle: number;
    b2_elasticParticle: number;
    b2_viscousParticle: number;
    b2_powderParticle: number;
    b2_tensileParticle: number;
    b2_colorMixingParticle: number;
    b2_destructionListenerParticle: number;
    b2_barrierParticle: number;
    b2_staticPressureParticle: number;
    b2_reactiveParticle: number;
    b2_repulsiveParticle: number;

    b2_solidParticleGroup: number;
    b2_rigidParticleGroup: number;
    b2_particleGroupCanBeEmpty: number;

    b2_staticBody: number;
    b2_kinematicBody: number;
    b2_dynamicBody: number;
  }
}
