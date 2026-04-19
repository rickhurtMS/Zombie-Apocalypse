
import "./style.css";

import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  UniversalCamera,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  Mesh,
  AbstractMesh,
  AnimationGroup,
  ImageProcessingConfiguration,
  PointerEventTypes,
  KeyboardEventTypes,
  SceneLoader,
  ShadowGenerator,
  StandardMaterial,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

function createScene(engine: Engine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);

  // Sunset background: lighter warm orange.
  scene.clearColor = new Color4(0.92, 0.5, 0.28, 1.0);

  // Light fog so distant ruins fade into atmosphere.
  scene.fogMode = Scene.FOGMODE_EXP;
  scene.fogColor = new Color3(0.64, 0.3, 0.2);
  scene.fogDensity = 0.012;

  // Subtle game-like image processing to improve contrast and reduce flat lighting.
  const imageFx = scene.imageProcessingConfiguration;
  imageFx.toneMappingEnabled = true;
  imageFx.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  imageFx.exposure = 1.18;
  imageFx.contrast = 1.12;
  imageFx.vignetteEnabled = true;
  imageFx.vignetteWeight = 0.14;
  imageFx.vignetteStretch = 0.08;
  imageFx.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
  imageFx.vignetteColor = new Color4(0, 0, 0, 0);

  // First-person camera with WASD movement.
  const PLAYER_EYE_HEIGHT = 1.8;
  const WALK_SPEED = 0.6;
  const SPRINT_SPEED = 1.7;
  const JUMP_IMPULSE = 15 ;
  const GRAVITY = 36;
  const MAX_FALL_SPEED = 45;
  const MAP_BOUNDARY = 67;
  const PICKUP_SPAWN_MARGIN = 3;
  const camera = new UniversalCamera("playerCamera", new Vector3(0, PLAYER_EYE_HEIGHT, -8), scene);
  camera.setTarget(new Vector3(0, PLAYER_EYE_HEIGHT, 0));
  camera.speed = WALK_SPEED;
  camera.inertia = 0.65;
  camera.angularSensibility = 1000;
  camera.minZ = 0.1;
  camera.keysUp = [87];
  camera.keysDown = [83];
  camera.keysLeft = [65];
  camera.keysRight = [68];
  canvas.tabIndex = 1;
  camera.attachControl(canvas, true);

  // Click canvas to lock pointer for mouse-look.
  canvas.addEventListener("click", () => {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
    canvas.focus();
  });

  let isSprinting = false;
  let isClimbingUp = false;
  let isClimbingDown = false;
  let isOnTowerClimbing = false;
  scene.onKeyboardObservable.add((kbInfo) => {
    const code = kbInfo.event.code;
    if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
      if (code === "ShiftLeft" || code === "ShiftRight") {
        isSprinting = true;
      }
      if (code === "KeyX") {
        // Exit tower and drop to ground away from tower
        if (isOnTowerClimbing) {
          const tower = towers[onTowerIndex];
          // Place player outside tower at ground level
          const exitDistance = 3.5;
          const exitAngle = Math.random() * Math.PI * 2;
          camera.position.x = tower.x + Math.cos(exitAngle) * exitDistance;
          camera.position.z = tower.z + Math.sin(exitAngle) * exitDistance;
          camera.position.y = PLAYER_EYE_HEIGHT;
          
          isOnTowerClimbing = false;
          isClimbingUp = false;
          isClimbingDown = false;
          towerClimbHeight = 0;
          verticalVelocity = 0;
        }
      }
      if (code === "KeyT") {
        // Teleport to top of nearest tower
        if (onTowerIndex >= 0) {
          const tower = towers[onTowerIndex];
          camera.position.x = tower.x;
          camera.position.z = tower.z;
          camera.position.y = 18;
          isOnTowerClimbing = true;
          towerClimbHeight = 16;
        }
      }
      if (code === "Space" || code === "Spacebar") {
        if (onTowerIndex >= 0 && !isOnTowerClimbing) {
          isOnTowerClimbing = true;
          isClimbingUp = true;
        } else if (!isOnTowerClimbing && isGrounded) {
          kbInfo.event.preventDefault();
          verticalVelocity = JUMP_IMPULSE;
          isGrounded = false;
        }
      }
      if (code === "ControlLeft" || code === "ControlRight") {
        if (isOnTowerClimbing) {
          isClimbingDown = true;
        }
      }
      if (code === "KeyR") {
        // Toggle scope sight
        if (hasSniperRifle) {
          isScopeActive = !isScopeActive;
          if (isScopeActive) {
            scopeReticle.style.display = "block";
            crosshair.style.display = "none";
          } else {
            scopeReticle.style.display = "none";
            crosshair.style.display = "block";
          }
        }
      }
    }

    if (kbInfo.type === KeyboardEventTypes.KEYUP) {
      if (code === "ShiftLeft" || code === "ShiftRight") {
        isSprinting = false;
      }
      if (code === "Space" || code === "Spacebar") {
        isClimbingUp = false;
      }
      if (code === "ControlLeft" || code === "ControlRight") {
        isClimbingDown = false;
      }
    }
  });

  // Simple debug body for the player, positioned slightly behind camera.
  const playerBody = MeshBuilder.CreateCapsule(
    "playerDebugBody",
    { radius: 0.32, height: 1.7 },
    scene
  );
  const playerBodyMat = new StandardMaterial("playerBodyMat", scene);
  playerBodyMat.diffuseColor = new Color3(0.15, 0.35, 1.0);
  playerBodyMat.specularColor = Color3.Black();
  playerBody.material = playerBodyMat;
  playerBody.isPickable = false;
  playerBody.parent = camera;
  playerBody.position = new Vector3(0, -2.2, -1.6);
  playerBody.isVisible = false;

  // First-person view model.
  const weaponRoot = new Mesh("weaponRoot", scene);
  weaponRoot.parent = camera;
  weaponRoot.position = new Vector3(0.36, -0.34, 0.82);
  weaponRoot.rotation = new Vector3(0.12, -0.22, 0.02);

  const weaponMetalMat = new StandardMaterial("weaponMetalMat", scene);
  weaponMetalMat.diffuseColor = new Color3(0.18, 0.2, 0.24);
  weaponMetalMat.emissiveColor = new Color3(0.03, 0.03, 0.04);
  weaponMetalMat.specularColor = new Color3(0.12, 0.12, 0.12);

  const weaponGripMat = new StandardMaterial("weaponGripMat", scene);
  weaponGripMat.diffuseColor = new Color3(0.1, 0.11, 0.13);
  weaponGripMat.specularColor = Color3.Black();

  const weaponAccentMat = new StandardMaterial("weaponAccentMat", scene);
  weaponAccentMat.diffuseColor = new Color3(0.18, 0.42, 1.0);
  weaponAccentMat.emissiveColor = new Color3(0.03, 0.06, 0.14);
  weaponAccentMat.specularColor = Color3.Black();

  // Sniper rifle materials
  const sniperScopeMat = new StandardMaterial("sniperScopeMat", scene);
  sniperScopeMat.diffuseColor = new Color3(0.1, 0.35, 0.1);
  sniperScopeMat.emissiveColor = new Color3(0.05, 0.15, 0.05);
  sniperScopeMat.specularColor = Color3.Black();

  const sniperStockMat = new StandardMaterial("sniperStockMat", scene);
  sniperStockMat.diffuseColor = new Color3(0.3, 0.22, 0.16);
  sniperStockMat.emissiveColor = new Color3(0.03, 0.02, 0.01);
  sniperStockMat.specularColor = Color3.Black();

  const weaponBody = MeshBuilder.CreateBox(
    "weaponBody",
    { width: 0.24, height: 0.18, depth: 0.64 },
    scene
  );
  weaponBody.parent = weaponRoot;
  weaponBody.position = new Vector3(0, 0, 0.02);
  weaponBody.material = weaponMetalMat;
  weaponBody.isPickable = false;

  const weaponRear = MeshBuilder.CreateBox(
    "weaponRear",
    { width: 0.2, height: 0.15, depth: 0.22 },
    scene
  );
  weaponRear.parent = weaponRoot;
  weaponRear.position = new Vector3(0, 0.03, -0.26);
  weaponRear.material = weaponMetalMat;
  weaponRear.isPickable = false;

  const weaponBarrel = MeshBuilder.CreateCylinder(
    "weaponBarrel",
    { height: 0.48, diameter: 0.08, tessellation: 10 },
    scene
  );
  weaponBarrel.parent = weaponRoot;
  weaponBarrel.rotation.x = Math.PI / 2;
  weaponBarrel.position = new Vector3(0.01, -0.02, 0.42);
  weaponBarrel.material = weaponMetalMat;
  weaponBarrel.isPickable = false;

  const weaponMuzzle = MeshBuilder.CreateCylinder(
    "weaponMuzzle",
    { height: 0.08, diameter: 0.11, tessellation: 10 },
    scene
  );
  weaponMuzzle.parent = weaponRoot;
  weaponMuzzle.rotation.x = Math.PI / 2;
  weaponMuzzle.position = new Vector3(0.01, -0.02, 0.66);
  weaponMuzzle.material = weaponGripMat;
  weaponMuzzle.isPickable = false;

  const weaponGrip = MeshBuilder.CreateBox(
    "weaponGrip",
    { width: 0.14, height: 0.28, depth: 0.16 },
    scene
  );
  weaponGrip.parent = weaponRoot;
  weaponGrip.position = new Vector3(0, -0.2, -0.08);
  weaponGrip.rotation.x = 0.2;
  weaponGrip.material = weaponGripMat;
  weaponGrip.isPickable = false;

  const weaponTopRail = MeshBuilder.CreateBox(
    "weaponTopRail",
    { width: 0.12, height: 0.05, depth: 0.34 },
    scene
  );
  weaponTopRail.parent = weaponRoot;
  weaponTopRail.position = new Vector3(0, 0.11, 0.02);
  weaponTopRail.material = weaponGripMat;
  weaponTopRail.isPickable = false;

  const weaponSight = MeshBuilder.CreateBox(
    "weaponSight",
    { width: 0.08, height: 0.08, depth: 0.06 },
    scene
  );
  weaponSight.parent = weaponRoot;
  weaponSight.position = new Vector3(0, 0.13, 0.24);
  weaponSight.material = weaponAccentMat;
  weaponSight.isPickable = false;

  const weaponArm = MeshBuilder.CreateBox(
    "weaponArm",
    { width: 0.18, height: 0.2, depth: 0.5 },
    scene
  );
  weaponArm.parent = weaponRoot;
  weaponArm.position = new Vector3(0.12, -0.13, -0.02);
  weaponArm.rotation = new Vector3(0.18, -0.3, 0.22);
  weaponArm.material = weaponAccentMat;
  weaponArm.isPickable = false;

  // Sniper rifle in first-person view
  const sniperRoot = new Mesh("sniperRoot", scene);
  sniperRoot.parent = camera;
  sniperRoot.position = new Vector3(0.28, -0.42, 0.78);
  sniperRoot.rotation = new Vector3(0.08, -0.18, 0.01);
  sniperRoot.isVisible = false;

  // Sniper barrel
  const sniperBarrel = MeshBuilder.CreateCylinder(
    "sniperBarrel",
    { height: 0.92, diameter: 0.06, tessellation: 10 },
    scene
  );
  sniperBarrel.parent = sniperRoot;
  sniperBarrel.rotation.x = Math.PI / 2;
  sniperBarrel.position = new Vector3(0, 0.04, 0.52);
  sniperBarrel.material = weaponMetalMat;
  sniperBarrel.isPickable = false;

  // Sniper stock
  const sniperStock = MeshBuilder.CreateBox(
    "sniperStock",
    { width: 0.12, height: 0.16, depth: 0.48 },
    scene
  );
  sniperStock.parent = sniperRoot;
  sniperStock.position = new Vector3(-0.04, -0.08, -0.18);
  sniperStock.material = weaponGripMat;
  sniperStock.isPickable = false;

  // Sniper receiver
  const sniperReceiver = MeshBuilder.CreateBox(
    "sniperReceiver",
    { width: 0.08, height: 0.12, depth: 0.28 },
    scene
  );
  sniperReceiver.parent = sniperRoot;
  sniperReceiver.position = new Vector3(0, 0.02, 0.1);
  sniperReceiver.material = weaponMetalMat;
  sniperReceiver.isPickable = false;

  // Sniper bolt
  const sniperBolt = MeshBuilder.CreateBox(
    "sniperBolt",
    { width: 0.06, height: 0.06, depth: 0.12 },
    scene
  );
  sniperBolt.parent = sniperRoot;
  sniperBolt.position = new Vector3(0.08, 0.04, 0.06);
  sniperBolt.material = weaponGripMat;
  sniperBolt.isPickable = false;

  // Sniper scope
  const sniperScopeBody = MeshBuilder.CreateCylinder(
    "sniperScopeBody",
    { height: 0.38, diameter: 0.04, tessellation: 8 },
    scene
  );
  sniperScopeBody.parent = sniperRoot;
  sniperScopeBody.position = new Vector3(0, 0.14, 0.12);
  sniperScopeBody.material = weaponMetalMat;
  sniperScopeBody.isPickable = false;

  const sniperScopeObjective = MeshBuilder.CreateCylinder(
    "sniperScopeObjective",
    { height: 0.06, diameter: 0.048, tessellation: 8 },
    scene
  );
  sniperScopeObjective.parent = sniperRoot;
  sniperScopeObjective.position = new Vector3(0, 0.14, 0.31);
  sniperScopeObjective.material = sniperScopeMat;
  sniperScopeObjective.isPickable = false;

  const sniperScopeEyepiece = MeshBuilder.CreateCylinder(
    "sniperScopeEyepiece",
    { height: 0.08, diameter: 0.038, tessellation: 8 },
    scene
  );
  sniperScopeEyepiece.parent = sniperRoot;
  sniperScopeEyepiece.position = new Vector3(0, 0.14, -0.1);
  sniperScopeEyepiece.material = sniperScopeMat;
  sniperScopeEyepiece.isPickable = false;

  // Scope mounts
  const scopeMount1 = MeshBuilder.CreateBox(
    "scopeMount1",
    { width: 0.04, height: 0.06, depth: 0.08 },
    scene
  );
  scopeMount1.parent = sniperRoot;
  scopeMount1.position = new Vector3(-0.06, 0.08, 0.08);
  scopeMount1.material = weaponMetalMat;
  scopeMount1.isPickable = false;

  const scopeMount2 = MeshBuilder.CreateBox(
    "scopeMount2",
    { width: 0.04, height: 0.06, depth: 0.08 },
    scene
  );
  scopeMount2.parent = sniperRoot;
  scopeMount2.position = new Vector3(-0.06, 0.08, 0.18);
  scopeMount2.material = weaponMetalMat;
  scopeMount2.isPickable = false;

  // Sniper grip
  const sniperGrip = MeshBuilder.CreateBox(
    "sniperGrip",
    { width: 0.1, height: 0.22, depth: 0.14 },
    scene
  );
  sniperGrip.parent = sniperRoot;
  sniperGrip.position = new Vector3(0.02, -0.16, -0.02);
  sniperGrip.rotation.x = 0.15;
  sniperGrip.material = weaponGripMat;
  sniperGrip.isPickable = false;

  // Cinematic sunset rig: warm key light + cool ambient fill.
  const SUN_INTENSITY = 1.28;
  const AMBIENT_INTENSITY = 0.42;

  const sun = new DirectionalLight("sun", new Vector3(-0.92, -0.36, -0.18), scene);
  sun.position = new Vector3(72, 28, 36);
  sun.intensity = SUN_INTENSITY;
  sun.diffuse = new Color3(1.0, 0.54, 0.27);
  sun.specular = new Color3(0.35, 0.2, 0.12);

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = AMBIENT_INTENSITY;
  hemi.diffuse = new Color3(0.38, 0.44, 0.68);
  hemi.groundColor = new Color3(0.16, 0.11, 0.24);
  hemi.specular = Color3.Black();

  // Subtle rim light from behind to separate silhouettes from the background.
  const rim = new DirectionalLight("rim", new Vector3(0.64, -0.22, 0.74), scene);
  rim.position = new Vector3(-64, 18, -72);
  rim.intensity = 0.18;
  rim.diffuse = new Color3(0.42, 0.5, 0.76);
  rim.specular = new Color3(0.08, 0.1, 0.14);

  // Shadow toggles and performance controls.
  const SHADOWS_ENABLED = true;
  const ZOMBIES_CAST_SHADOWS = true;
  const PROPS_CAST_SHADOWS = true;
  const GROUND_RECEIVES_SHADOWS = true;
  const MAX_PROP_SHADOW_CASTERS = 5;

  const nav = navigator as Navigator & { deviceMemory?: number };
  const isLowPerfDevice =
    (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) ||
    (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4);
  const SHADOW_MAP_SIZE = isLowPerfDevice ? 1024 : 2048;

  let shadowRefreshTimer = 0;
  const SHADOW_REFRESH_INTERVAL = 0.2;

  const shadowGenerator = SHADOWS_ENABLED ? new ShadowGenerator(SHADOW_MAP_SIZE, sun) : null;
  if (shadowGenerator) {
    shadowGenerator.bias = 0.0008;
    shadowGenerator.normalBias = 0.02;
    shadowGenerator.usePoissonSampling = true;
  }

  // Ground
  const ground = MeshBuilder.CreateGround("ground", { width: 140, height: 140 }, scene);
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new Color3(0.18, 0.14, 0.12);
  groundMat.specularColor = Color3.Black();
  ground.material = groundMat;
  ground.receiveShadows = !!shadowGenerator && GROUND_RECEIVES_SHADOWS;

  // Streets (main cross + a few side streets).
  const roadMat = new StandardMaterial("roadMat", scene);
  roadMat.diffuseColor = new Color3(0.13, 0.13, 0.14);
  roadMat.specularColor = Color3.Black();

  const lineMat = new StandardMaterial("lineMat", scene);
  lineMat.diffuseColor = new Color3(0.85, 0.72, 0.35);
  lineMat.emissiveColor = new Color3(0.1, 0.08, 0.03);
  lineMat.specularColor = Color3.Black();

  const ROAD_SPAN = 140;
  const ROAD_HALF_SPAN = ROAD_SPAN / 2;
  const isOnRoad = (x: number, z: number, padding = 0) => {
    const onMainX = Math.abs(z) <= 4 + padding && Math.abs(x) <= ROAD_HALF_SPAN + padding;
    const onMainZ = Math.abs(x) <= 4 + padding && Math.abs(z) <= ROAD_HALF_SPAN + padding;
    const onSideXPos = Math.abs(z - 18) <= 2.5 + padding && Math.abs(x) <= ROAD_HALF_SPAN + padding;
    const onSideXNeg = Math.abs(z + 18) <= 2.5 + padding && Math.abs(x) <= ROAD_HALF_SPAN + padding;
    const onSideZNeg = Math.abs(x + 18) <= 2.5 + padding && Math.abs(z) <= ROAD_HALF_SPAN + padding;
    const onSideZPos = Math.abs(x - 18) <= 2.5 + padding && Math.abs(z) <= ROAD_HALF_SPAN + padding;
    return onMainX || onMainZ || onSideXPos || onSideXNeg || onSideZNeg || onSideZPos;
  };

  const mainRoadX = MeshBuilder.CreateGround("mainRoadX", { width: ROAD_SPAN, height: 8 }, scene);
  mainRoadX.position.y = 0.02;
  mainRoadX.material = roadMat;

  const mainRoadZ = MeshBuilder.CreateGround("mainRoadZ", { width: 8, height: ROAD_SPAN }, scene);
  mainRoadZ.position.y = 0.02;
  mainRoadZ.material = roadMat;

  const sideRoad1 = MeshBuilder.CreateGround("sideRoad1", { width: ROAD_SPAN, height: 5 }, scene);
  sideRoad1.position = new Vector3(0, 0.02, 18);
  sideRoad1.material = roadMat;

  const sideRoad2 = MeshBuilder.CreateGround("sideRoad2", { width: 5, height: ROAD_SPAN }, scene);
  sideRoad2.position = new Vector3(-18, 0.02, 0);
  sideRoad2.material = roadMat;

  const sideRoad3 = MeshBuilder.CreateGround("sideRoad3", { width: ROAD_SPAN, height: 5 }, scene);
  sideRoad3.position = new Vector3(0, 0.02, -18);
  sideRoad3.material = roadMat;

  const sideRoad4 = MeshBuilder.CreateGround("sideRoad4", { width: 5, height: ROAD_SPAN }, scene);
  sideRoad4.position = new Vector3(18, 0.02, 0);
  sideRoad4.material = roadMat;

  const centerLineX = MeshBuilder.CreateGround("centerLineX", { width: ROAD_SPAN, height: 0.25 }, scene);
  centerLineX.position.y = 0.03;
  centerLineX.material = lineMat;

  const centerLineZ = MeshBuilder.CreateGround("centerLineZ", { width: 0.25, height: ROAD_SPAN }, scene);
  centerLineZ.position.y = 0.03;
  centerLineZ.material = lineMat;

  const carBodyMat = new StandardMaterial("carBodyMat", scene);
  carBodyMat.diffuseColor = new Color3(0.62, 0.13, 0.1);
  carBodyMat.specularColor = new Color3(0.06, 0.06, 0.06);

  const carCabinMat = new StandardMaterial("carCabinMat", scene);
  carCabinMat.diffuseColor = new Color3(0.18, 0.24, 0.3);
  carCabinMat.emissiveColor = new Color3(0.03, 0.05, 0.07);
  carCabinMat.specularColor = Color3.Black();

  const wheelMat = new StandardMaterial("wheelMat", scene);
  wheelMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
  wheelMat.specularColor = Color3.Black();

  const cars: Mesh[] = [];
  const shadowCandidateProps: Mesh[] = [];

  const createCar = (name: string, position: Vector3, rotationY: number) => {
    const carRoot = new Mesh(name, scene);
    carRoot.position = position;
    carRoot.rotation.y = rotationY;
    carRoot.isPickable = false;
    cars.push(carRoot);
    shadowCandidateProps.push(carRoot);

    const chassis = MeshBuilder.CreateBox(`${name}_chassis`, { width: 1.95, height: 0.36, depth: 3.35 }, scene);
    chassis.parent = carRoot;
    chassis.position.y = 0.46;
    chassis.material = carBodyMat;
    chassis.isPickable = false;

    const cabin = MeshBuilder.CreateBox(`${name}_cabin`, { width: 1.55, height: 0.38, depth: 1.6 }, scene);
    cabin.parent = carRoot;
    cabin.position = new Vector3(0, 0.81, -0.2);
    cabin.material = carCabinMat;
    cabin.isPickable = false;

    const wheelOffsets = [
      new Vector3(-0.86, 0.22, 1.06),
      new Vector3(0.86, 0.22, 1.06),
      new Vector3(-0.86, 0.22, -1.06),
      new Vector3(0.86, 0.22, -1.06),
    ];
    wheelOffsets.forEach((offset, index) => {
      const wheel = MeshBuilder.CreateCylinder(
        `${name}_wheel_${index}`,
        { height: 0.24, diameter: 0.46, tessellation: 12 },
        scene
      );
      wheel.parent = carRoot;
      wheel.position = offset;
      wheel.rotation.z = Math.PI / 2;
      wheel.material = wheelMat;
      wheel.isPickable = false;
    });
  };

  const carLayout = [
    { x: -1.9, z: -58, r: 0 },
    { x: 1.9, z: -44, r: Math.PI },
    { x: -1.9, z: -28, r: 0 },
    { x: 1.9, z: -12, r: Math.PI },
    { x: -1.9, z: 8, r: 0 },
    { x: 1.9, z: 24, r: Math.PI },
    { x: -1.9, z: 40, r: 0 },
    { x: 1.9, z: 56, r: Math.PI },
    { x: -18.3, z: -52, r: 0 },
    { x: 18.3, z: -36, r: Math.PI },
    { x: -18.3, z: 18, r: 0 },
    { x: 18.3, z: 48, r: Math.PI },
  ];
  carLayout.forEach((car, i) => {
    createCar(`car_${i}`, new Vector3(car.x, 0, car.z), car.r);
  });

  // Ruined box buildings.
  const buildingColor = new Color3(0.38, 0.3, 0.26);
  const doorMat = new StandardMaterial("doorMat", scene);
  doorMat.diffuseColor = new Color3(0.16, 0.1, 0.07);
  doorMat.specularColor = Color3.Black();

  const windowMat = new StandardMaterial("windowMat", scene);
  windowMat.diffuseColor = new Color3(0.4, 0.5, 0.6);
  windowMat.emissiveColor = new Color3(0.08, 0.1, 0.14);
  windowMat.specularColor = Color3.Black();

  const buildingPositions: Array<[number, number, number]> = [
    [12, 0, 10],
    [-14, 0, 8],
    [8, 0, -14],
    [-10, 0, -12],
    [22, 0, -5],
    [-22, 0, 8],
    [16, 0, 20],
    [-8, 0, 22],
    [30, 0, 14],
    [-28, 0, -18],
    [42, 0, 6],
    [46, 0, -10],
    [40, 0, 24],
    [-42, 0, 12],
    [-46, 0, -8],
    [-38, 0, -26],
    [8, 0, 44],
    [-10, 0, 48],
    [24, 0, 46],
    [-30, 0, 42],
    [12, 0, -46],
    [-14, 0, -44],
    [34, 0, -40],
    [-36, 0, -42],
    [56, 0, 20],
    [58, 0, -22],
    [-56, 0, 18],
    [-58, 0, -20],
    [20, 0, 58],
    [-22, 0, 56],
    [18, 0, -58],
    [-20, 0, -56],
    [32, 0, 28],
    [-32, 0, 30],
    [28, 0, -32],
    [-28, 0, -34],
    [44, 0, -28],
    [-44, 0, 26],
    [52, 0, 38],
    [-50, 0, 40],
    [38, 0, 50],
    [-40, 0, 52],
    [6, 0, 32],
    [-12, 0, 36],
    [14, 0, -30],
    [-16, 0, -32],
    [26, 0, 12],
    [-24, 0, 14],
    [36, 0, -16],
    [-34, 0, -18],
    [48, 0, 8],
    [-46, 0, 10],
    [10, 0, -42],
    [-12, 0, -40],
    [54, 0, -32],
    [-52, 0, -30],
    [42, 0, 34],
    [-40, 0, 36],
    [30, 0, -48],
    [-32, 0, -50],
    [60, 0, 12],
    [-60, 0, 14],
    [16, 0, 56],
    [-18, 0, 54],
    [24, 0, -54],
    [-26, 0, -56],
    [50, 0, -44],
    [-48, 0, -46],
    [14, 0, 2],
    [-12, 0, -4],
    [20, 0, 26],
    [-18, 0, 28],
    [44, 0, 16],
    [-42, 0, 18],
    [36, 0, 40],
    [-38, 0, 42],
    [10, 0, -8],
    [-8, 0, -6],
  ];
  const activeBuildingPositions = buildingPositions.filter(([x, _, z]) => !isOnRoad(x, z, 3.2));
  activeBuildingPositions.forEach(([x, y, z], i) => {
    const height = 3 + Math.random() * 7;
    const width = 2 + Math.random() * 4;
    const depth = 2 + Math.random() * 4;

    const b = MeshBuilder.CreateBox(
      `ruin_${i}`,
      { width, height, depth },
      scene
    );
    b.position = new Vector3(x, y + height / 2, z);

    const mat = new StandardMaterial(`ruinMat_${i}`, scene);
    mat.diffuseColor = buildingColor;
    mat.specularColor = Color3.Black();
    b.material = mat;
    shadowCandidateProps.push(b);

    const door = MeshBuilder.CreateBox(
      `door_${i}`,
      {
        width: Math.max(0.9, width * 0.26),
        height: Math.min(2.1, height * 0.36),
        depth: 0.08,
      },
      scene
    );
    door.parent = b;
    door.position = new Vector3(0, -height / 2 + door.scaling.y, depth / 2 + 0.045);
    door.material = doorMat;

    const windowRows = height > 6 ? 2 : 1;
    const windowCols = width > 4 ? 2 : 1;
    const windowWidth = Math.max(0.45, width * 0.2);
    const windowHeight = Math.max(0.45, height * 0.12);

    for (let row = 0; row < windowRows; row++) {
      for (let col = 0; col < windowCols; col++) {
        const windowMesh = MeshBuilder.CreateBox(
          `window_${i}_${row}_${col}`,
          { width: windowWidth, height: windowHeight, depth: 0.06 },
          scene
        );
        windowMesh.parent = b;

        const yStart = -height / 2 + door.scaling.y * 2 + 0.7;
        const yOffset = row * (windowHeight + 0.75);
        const xOffset = windowCols === 1 ? 0 : col === 0 ? -width * 0.22 : width * 0.22;

        windowMesh.position = new Vector3(xOffset, yStart + yOffset, depth / 2 + 0.04);
        windowMesh.material = windowMat;
      }
    }
  });

  // Background hills and trees around the outer edges.
  const hillMat = new StandardMaterial("hillMat", scene);
  hillMat.diffuseColor = new Color3(0.22, 0.2, 0.14);
  hillMat.specularColor = Color3.Black();

  const trunkMat = new StandardMaterial("trunkMat", scene);
  trunkMat.diffuseColor = new Color3(0.26, 0.16, 0.1);
  trunkMat.specularColor = Color3.Black();

  const leavesMat = new StandardMaterial("leavesMat", scene);
  leavesMat.diffuseColor = new Color3(0.17, 0.34, 0.16);
  leavesMat.specularColor = Color3.Black();

  let hillsCreated = 0;
  let hillAttempts = 0;
  while (hillsCreated < 9 && hillAttempts < 90) {
    hillAttempts++;
    const angle = (Math.PI * 2 * hillsCreated) / 9 + Math.random() * 0.35;
    const radius = 52 + Math.random() * 16;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isOnRoad(x, z, 6)) {
      continue;
    }

    const hillSize = 6 + Math.random() * 8;
    const hill = MeshBuilder.CreateSphere(
      `hill_${hillsCreated}`,
      { diameter: hillSize, segments: 10 },
      scene
    );
    hill.scaling.y = 0.35 + Math.random() * 0.35;
    const hillTopHeight = (hillSize * hill.scaling.y) / 2;
    const hillBurialDepth = 1.2 + Math.random() * 1.1;
    hill.position = new Vector3(x, hillTopHeight - hillBurialDepth, z);
    hill.material = hillMat;
    hillsCreated++;
  }

  let treesCreated = 0;
  let treeAttempts = 0;
  const treePositions: Vector3[] = [];
  while (treesCreated < 60 && treeAttempts < 800) {
    treeAttempts++;
    const angle = Math.random() * Math.PI * 2;
    const radius = 44 + Math.random() * 24;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isOnRoad(x, z, 3.5)) {
      continue;
    }

    // Check collision with existing trees
    let tooClose = false;
    const minTreeDistance = 3.5;
    for (const treePos of treePositions) {
      const dist = Math.sqrt((x - treePos.x) ** 2 + (z - treePos.z) ** 2);
      if (dist < minTreeDistance) {
        tooClose = true;
        break;
      }
    }
    
    // Check collision with buildings
    if (!tooClose) {
      const minBuildingDistance = 5.5;
      for (const [bx, _, bz] of activeBuildingPositions) {
        const dist = Math.sqrt((x - bx) ** 2 + (z - bz) ** 2);
        if (dist < minBuildingDistance) {
          tooClose = true;
          break;
        }
      }
    }
    
    if (tooClose) {
      continue;
    }

    const trunkHeight = 1.6 + Math.random() * 1.5;
    const trunk = MeshBuilder.CreateCylinder(
      `tree_trunk_${treesCreated}`,
      { height: trunkHeight, diameter: 0.34 + Math.random() * 0.12 },
      scene
    );
    trunk.position = new Vector3(x, trunkHeight / 2, z);
    trunk.material = trunkMat;

    const crown = MeshBuilder.CreateSphere(
      `tree_crown_${treesCreated}`,
      { diameter: 1.8 + Math.random() * 1.4, segments: 8 },
      scene
    );
    crown.position = new Vector3(x, trunkHeight + 0.9, z);
    crown.material = leavesMat;
    shadowCandidateProps.push(crown);
    
    treePositions.push(new Vector3(x, 0, z));
    treesCreated++;
  }

  // Sniper towers scattered around the map
  const towerMat = new StandardMaterial("towerMat", scene);
  towerMat.diffuseColor = new Color3(0.3, 0.32, 0.35);
  towerMat.specularColor = Color3.Black();

  const platformMat = new StandardMaterial("platformMat", scene);
  platformMat.diffuseColor = new Color3(0.42, 0.44, 0.48);
  platformMat.specularColor = new Color3(0.08, 0.08, 0.08);

  const railMat = new StandardMaterial("railMat", scene);
  railMat.diffuseColor = new Color3(0.25, 0.27, 0.3);
  railMat.specularColor = Color3.Black();

  const towerPositions: Array<[number, number]> = [
    [50, -50],
    [-50, 50],
  ];

  towerPositions.forEach((pos, i) => {
    const [x, z] = pos;
    if (isOnRoad(x, z, 4)) {
      return;
    }

    // Tower column
    const column = MeshBuilder.CreateCylinder(
      `tower_column_${i}`,
      { height: 10, diameter: 1.2, tessellation: 16 },
      scene
    );
    column.position = new Vector3(x, 5, z);
    column.material = towerMat;
    column.isPickable = false;

    // Tower base (wider foundation)
    const base = MeshBuilder.CreateCylinder(
      `tower_base_${i}`,
      { height: 0.6, diameter: 2.2, tessellation: 16 },
      scene
    );
    base.position = new Vector3(x, 0.3, z);
    base.material = towerMat;
    base.isPickable = false;

    // Platform
    const platform = MeshBuilder.CreateBox(
      `tower_platform_${i}`,
      { width: 3.5, height: 0.35, depth: 3.5 },
      scene
    );
    platform.position = new Vector3(x, 10.2, z);
    platform.material = platformMat;
    platform.isPickable = false;

    // Sniper nest (elevated shooting position)
    const nest = MeshBuilder.CreateBox(
      `tower_nest_${i}`,
      { width: 2, height: 1.2, depth: 2 },
      scene
    );
    nest.position = new Vector3(x, 11.5, z);
    nest.material = towerMat;
    nest.isPickable = false;

    // Guard rails around platform
    const railPositions = [
      new Vector3(x + 1.8, 10.4, z),
      new Vector3(x - 1.8, 10.4, z),
      new Vector3(x, 10.4, z + 1.8),
      new Vector3(x, 10.4, z - 1.8),
    ];

    railPositions.forEach((railPos, j) => {
      const rail = MeshBuilder.CreateBox(
        `tower_rail_${i}_${j}`,
        { width: 0.15, height: 0.8, depth: 0.15 },
        scene
      );
      rail.position = railPos;
      rail.material = railMat;
      rail.isPickable = false;
    });

    // Ladder details on column - extended all the way to top
    for (let rung = 1; rung < 16; rung++) {
      const ladderRung = MeshBuilder.CreateBox(
        `tower_ladder_${i}_${rung}`,
        { width: 1.6, height: 0.12, depth: 0.12 },
        scene
      );
      ladderRung.position = new Vector3(x, 1 + rung * 0.95, z);
      ladderRung.material = railMat;
      ladderRung.isPickable = false;
    }
  });

  // Tower climbing system
  const towers = towerPositions.map(([x, z]) => ({ x, z, platformHeight: 10.2 }));
  let onTowerIndex = -1;
  let towerClimbHeight = 0;

  // Basic zombie system.
  const zombieMat = new StandardMaterial("zombieMat", scene);
  zombieMat.diffuseColor = new Color3(0.2, 0.65, 0.25);
  zombieMat.specularColor = Color3.Black();

  const ZOMBIE_MODEL_ROOT_URL = "/assets/quaternius/Zombie/";
  const ZOMBIE_MODEL_FILE = "Zombie_Basic.gltf";
  const MAX_ACTIVE_ZOMBIES = 18;
  let zombieModelFactory:
    | ((variantTag: string) => { root: Mesh; animationGroups: AnimationGroup[] })
    | null = null;

  void SceneLoader.LoadAssetContainerAsync(
    ZOMBIE_MODEL_ROOT_URL,
    ZOMBIE_MODEL_FILE,
    scene
  )
    .then((container) => {
      container.removeAllFromScene();
      zombieModelFactory = (variantTag: string) => {
        const stamp = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const instance = container.instantiateModelsToScene(
          (name) => `zombieModel_${variantTag}_${name}_${stamp}`,
          false
        );
        const zombieRoot = new Mesh(`zombieRoot_${variantTag}_${stamp}`, scene);
        zombieRoot.isPickable = false;

        for (const rootNode of instance.rootNodes) {
          rootNode.parent = zombieRoot;
        }
        zombieRoot.getChildMeshes().forEach((child) => {
          child.isPickable = false;
        });
        instance.animationGroups.forEach((group) => {
          group.stop();
          group.speedRatio = 0.82;
        });

        return {
          root: zombieRoot,
          animationGroups: instance.animationGroups,
        };
      };
    })
    .catch((error: unknown) => {
      console.warn("Zombie model failed to load, using fallback meshes.", error);
    });

  const medBoxMat = new StandardMaterial("medBoxMat", scene);
  medBoxMat.diffuseColor = new Color3(0.92, 0.92, 0.95);
  medBoxMat.specularColor = Color3.Black();

  const medCrossMat = new StandardMaterial("medCrossMat", scene);
  medCrossMat.diffuseColor = new Color3(0.78, 0.1, 0.12);
  medCrossMat.emissiveColor = new Color3(0.12, 0.02, 0.02);
  medCrossMat.specularColor = Color3.Black();

  const ammoBoxMat = new StandardMaterial("ammoBoxMat", scene);
  ammoBoxMat.diffuseColor = new Color3(0.72, 0.58, 0.18);
  ammoBoxMat.specularColor = Color3.Black();

  const ammoStripeMat = new StandardMaterial("ammoStripeMat", scene);
  ammoStripeMat.diffuseColor = new Color3(0.12, 0.12, 0.14);
  ammoStripeMat.specularColor = Color3.Black();

  // Sniper rifle system
  const sniperBoxMat = new StandardMaterial("sniperBoxMat", scene);
  sniperBoxMat.diffuseColor = new Color3(0.15, 0.15, 0.18);
  sniperBoxMat.specularColor = Color3.Black();

  const zombies: Mesh[] = [];
  const zombieVelocities: Array<{ y: number }> = [];
  const zombieAnimationGroups: AnimationGroup[][] = [];
  const zombieGroundHeights: number[] = [];
  const zombieHitPoints: number[] = [];
  const zombieHitRadii: number[] = [];
  const zombieHitHeights: number[] = [];
  const medBoxes: Mesh[] = [];
  const ammoBoxes: Mesh[] = [];
  const bullets: Array<{ mesh: Mesh; velocity: Vector3; life: number }> = [];
  const hitParticles: Array<{ mesh: Mesh; velocity: Vector3; life: number }> = [];
  let spawnTimer = 0;
  let medSpawnTimer = 0;
  let ammoSpawnTimer = 0;
  let survivalTime = 0;
  let playerHealth = 100;
  let ammo = 25;
  let damageFlash = 0;
  let score = 0;
  let isGameOver = false;
  let audioContext: AudioContext | null = null;
  let verticalVelocity = 0;
  let isGrounded = true;
  let gameStarted = false;
  let hasSniperRifle = false;
  let isScopeActive = false;
  let sniperPickupSpawned = false;

  // Title sequence overlay
  const titleOverlay = document.createElement("div");
  titleOverlay.style.position = "fixed";
  titleOverlay.style.inset = "0";
  titleOverlay.style.display = "flex";
  titleOverlay.style.alignItems = "center";
  titleOverlay.style.justifyContent = "center";
  titleOverlay.style.flexDirection = "column";
  titleOverlay.style.gap = "20px";
  titleOverlay.style.background = "rgba(0, 0, 0, 1)";
  titleOverlay.style.color = "#ffffff";
  titleOverlay.style.fontFamily = "monospace";
  titleOverlay.style.zIndex = "25";
  titleOverlay.style.opacity = "1";
  titleOverlay.style.transition = "opacity 0.8s ease-out";

  const titleText = document.createElement("div");
  titleText.textContent = "THE UPRISING OF THE UNDEAD";
  titleText.style.fontSize = "56px";
  titleText.style.fontWeight = "700";
  titleText.style.textShadow = "0 0 20px #ff3030, 2px 2px 4px #000";
  titleText.style.letterSpacing = "4px";

  const subtitleText = document.createElement("div");
  subtitleText.textContent = "SURVIVAL HORROR";
  subtitleText.style.fontSize = "24px";
  subtitleText.style.fontWeight = "300";
  subtitleText.style.textShadow = "1px 1px 2px #000";
  subtitleText.style.letterSpacing = "2px";
  subtitleText.style.color = "#aaaaaa";

  const pressText = document.createElement("div");
  pressText.textContent = "CLICK TO START";
  pressText.style.fontSize = "16px";
  pressText.style.marginTop = "40px";
  pressText.style.textShadow = "1px 1px 2px #000";
  pressText.style.opacity = "0";
  pressText.style.animation = "pulse 1.5s infinite";

  const style = document.createElement("style");
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  titleOverlay.appendChild(titleText);
  titleOverlay.appendChild(subtitleText);
  titleOverlay.appendChild(pressText);
  document.body.appendChild(titleOverlay);

  const startGameFromTitle = () => {
    if (!gameStarted) {
      gameStarted = true;
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      titleOverlay.style.opacity = "0";
      hud.style.display = "block";
      crosshair.style.display = "block";
      canvas.focus();
      setTimeout(() => {
        titleOverlay.remove();
      }, 800);
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    }
  };

  // Auto-start title fade and click to continue
  setTimeout(() => {
    pressText.style.opacity = "1";
  }, 1200);

  titleOverlay.addEventListener("click", startGameFromTitle);
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      startGameFromTitle();
    }
  });

  const hud = document.createElement("div");
  hud.style.position = "fixed";
  hud.style.top = "12px";
  hud.style.left = "12px";
  hud.style.color = "#d6ffd6";
  hud.style.fontFamily = "monospace";
  hud.style.fontSize = "18px";
  hud.style.textShadow = "1px 1px 2px #000";
  hud.style.pointerEvents = "none";
  hud.style.display = "none";
  document.body.appendChild(hud);

  const crosshair = document.createElement("div");
  crosshair.style.position = "fixed";
  crosshair.style.left = "50%";
  crosshair.style.top = "50%";
  crosshair.style.transform = "translate(-50%, -50%)";
  crosshair.style.color = "#ffffff";
  crosshair.style.fontFamily = "monospace";
  crosshair.style.fontSize = "24px";
  crosshair.style.textShadow = "1px 1px 2px #000";
  crosshair.style.pointerEvents = "none";
  crosshair.style.display = "none";
  crosshair.textContent = "+";
  document.body.appendChild(crosshair);

  // Scope reticle overlay
  const scopeReticle = document.createElement("div");
  scopeReticle.style.position = "fixed";
  scopeReticle.style.left = "50%";
  scopeReticle.style.top = "50%";
  scopeReticle.style.transform = "translate(-50%, -50%)";
  scopeReticle.style.width = "400px";
  scopeReticle.style.height = "400px";
  scopeReticle.style.border = "3px solid #00ff00";
  scopeReticle.style.borderRadius = "50%";
  scopeReticle.style.boxShadow = "0 0 15px #00aa00, inset 0 0 15px #00aa00";
  scopeReticle.style.pointerEvents = "none";
  scopeReticle.style.display = "none";
  scopeReticle.style.zIndex = "15";

  // Scope crosshair center
  const scopeCrosshair = document.createElement("div");
  scopeCrosshair.style.position = "absolute";
  scopeCrosshair.style.left = "50%";
  scopeCrosshair.style.top = "50%";
  scopeCrosshair.style.transform = "translate(-50%, -50%)";
  scopeCrosshair.style.width = "20px";
  scopeCrosshair.style.height = "20px";
  scopeCrosshair.style.borderLeft = "2px solid #00ff00";
  scopeCrosshair.style.borderRight = "2px solid #00ff00";
  scopeCrosshair.style.borderTop = "2px solid #00ff00";
  scopeCrosshair.style.borderBottom = "2px solid #00ff00";
  scopeCrosshair.style.boxSizing = "border-box";
  scopeReticle.appendChild(scopeCrosshair);

  // Scope distance markers
  for (let i = 1; i <= 3; i++) {
    const marker = document.createElement("div");
    marker.style.position = "absolute";
    marker.style.width = "40px";
    marker.style.height = "2px";
    marker.style.background = "#00ff00";
    marker.style.left = "50%";
    marker.style.top = `calc(50% - ${i * 40}px)`;
    marker.style.transform = "translateX(-50%)";
    scopeReticle.appendChild(marker);

    const markerBottom = document.createElement("div");
    markerBottom.style.position = "absolute";
    markerBottom.style.width = "40px";
    markerBottom.style.height = "2px";
    markerBottom.style.background = "#00ff00";
    markerBottom.style.left = "50%";
    markerBottom.style.top = `calc(50% + ${i * 40}px)`;
    markerBottom.style.transform = "translateX(-50%)";
    scopeReticle.appendChild(markerBottom);
  }

  document.body.appendChild(scopeReticle);

  const damageOverlay = document.createElement("div");
  damageOverlay.style.position = "fixed";
  damageOverlay.style.inset = "0";
  damageOverlay.style.pointerEvents = "none";
  damageOverlay.style.background = "rgba(255, 35, 35, 1)";
  damageOverlay.style.opacity = "0";
  damageOverlay.style.zIndex = "12";
  document.body.appendChild(damageOverlay);

  const gameOverOverlay = document.createElement("div");
  gameOverOverlay.style.position = "fixed";
  gameOverOverlay.style.inset = "0";
  gameOverOverlay.style.display = "none";
  gameOverOverlay.style.alignItems = "center";
  gameOverOverlay.style.justifyContent = "center";
  gameOverOverlay.style.flexDirection = "column";
  gameOverOverlay.style.gap = "14px";
  gameOverOverlay.style.background = "rgba(0, 0, 0, 0.75)";
  gameOverOverlay.style.color = "#ffffff";
  gameOverOverlay.style.fontFamily = "monospace";
  gameOverOverlay.style.zIndex = "20";

  const gameOverTitle = document.createElement("div");
  gameOverTitle.textContent = "GAME OVER";
  gameOverTitle.style.fontSize = "42px";
  gameOverTitle.style.fontWeight = "700";

  const gameOverScore = document.createElement("div");
  gameOverScore.style.fontSize = "22px";

  const restartButton = document.createElement("button");
  restartButton.textContent = "Restart";
  restartButton.style.fontSize = "18px";
  restartButton.style.padding = "10px 18px";
  restartButton.style.cursor = "pointer";
  restartButton.addEventListener("click", () => {
    window.location.reload();
  });

  gameOverOverlay.appendChild(gameOverTitle);
  gameOverOverlay.appendChild(gameOverScore);
  gameOverOverlay.appendChild(restartButton);
  document.body.appendChild(gameOverOverlay);

  const showGameOver = () => {
    isGameOver = true;
    gameOverScore.textContent = `Final Score: ${score}`;
    gameOverOverlay.style.display = "flex";
    crosshair.style.display = "none";
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };

  const updateHud = () => {
    hud.textContent = `Score: ${score}   Health: ${playerHealth.toFixed(0)}   Ammo: ${ammo}`;
  };
  updateHud();

  const getAudioContext = () => {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    return audioContext;
  };

  const playNoiseBurst = (
    duration: number,
    volume: number,
    decayEnd: number,
    highpassFrequency: number
  ) => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    noise.buffer = noiseBuffer;
    filter.type = "highpass";
    filter.frequency.setValueAtTime(highpassFrequency, now);
    noiseGain.gain.setValueAtTime(volume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + decayEnd);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);
  };

  const playShootSound = () => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc2.type = "square";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.12);
    osc2.frequency.setValueAtTime(110, now);
    osc2.frequency.exponentialRampToValueAtTime(70, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.38, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.13);
    osc2.stop(now + 0.13);

    playNoiseBurst(0.08, 0.22, 0.08, 700);
  };

  const playDryFireSound = () => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.035);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  };

  const playHitSound = () => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  };

  const playPickupSound = () => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  };

  const spawnZombie = () => {
    if (zombies.length >= MAX_ACTIVE_ZOMBIES) {
      return;
    }

    const ZOMBIE_FEET_Y = 0.03;

    const spawnPosition = new Vector3(
      (Math.random() - 0.5) * MAP_BOUNDARY * 2,
      ZOMBIE_FEET_Y,
      (Math.random() - 0.5) * MAP_BOUNDARY * 2
    );

    const zombieVariant = Math.floor(Math.random() * 4);
    let scale = 1;
    let color = new Color3(0.2, 0.6, 0.2);
    let variant = "normal";

    if (zombieVariant === 1) {
      // Bloated Zombie - larger, pale
      scale = 1.35;
      color = new Color3(0.75, 0.72, 0.7);
      variant = "bloated";
    } else if (zombieVariant === 2) {
      // Decayed Zombie - smaller, grayish
      scale = 0.75;
      color = new Color3(0.35, 0.38, 0.35);
      variant = "decayed";
    } else if (zombieVariant === 3) {
      // Tough Zombie - large, dark reddish
      scale = 1.25;
      color = new Color3(0.5, 0.15, 0.1);
      variant = "tough";
    }

    if (zombieModelFactory) {
      const { root: zombieRoot, animationGroups } = zombieModelFactory(variant);
      const modelScale = scale * 1.25;
      zombieRoot.position = spawnPosition;
      zombieRoot.scaling = new Vector3(modelScale, modelScale, modelScale);

      const bounds = zombieRoot.getHierarchyBoundingVectors();
      const desiredFootY = ZOMBIE_FEET_Y;
      zombieRoot.position.y += desiredFootY - bounds.min.y;

      zombies.push(zombieRoot);
      zombieVelocities.push({ y: 0 });
      zombieAnimationGroups.push(animationGroups);
      zombieGroundHeights.push(zombieRoot.position.y);
      zombieHitPoints.push(variant === "bloated" || variant === "tough" ? 2 : 1);
      zombieHitRadii.push(Math.max(0.8, 0.75 * modelScale));
      zombieHitHeights.push(Math.max(0.9, 0.95 * modelScale));
      return;
    }

    const zombieRoot = new Mesh(
      `zombieRoot_${variant}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      scene
    );
    zombieRoot.position = spawnPosition;
    zombieRoot.scaling = new Vector3(scale, scale, scale);

    const variantMat = new StandardMaterial(`zombieMat_${variant}_${Date.now()}`, scene);
    variantMat.diffuseColor = color;
    variantMat.specularColor = Color3.Black();

    // Head
    const head = MeshBuilder.CreateSphere(
      `zombieHead_${Date.now()}`,
      { diameter: 0.32, segments: 8 },
      scene
    );
    head.position.y = 0.8;
    head.parent = zombieRoot;
    head.material = variantMat;
    head.isPickable = false;

    // Torso
    const torso = MeshBuilder.CreateBox(
      `zombieTorso_${Date.now()}`,
      { width: 0.36, height: 0.7, depth: 0.24 },
      scene
    );
    torso.position.y = 0.35;
    torso.parent = zombieRoot;
    torso.material = variantMat;
    torso.isPickable = false;

    // Left arm
    const armLeft = MeshBuilder.CreateBox(
      `zombieArmL_${Date.now()}`,
      { width: 0.15, height: 0.62, depth: 0.12 },
      scene
    );
    armLeft.position = new Vector3(-0.28, 0.46, 0);
    armLeft.parent = zombieRoot;
    armLeft.material = variantMat;
    armLeft.isPickable = false;

    // Right arm
    const armRight = MeshBuilder.CreateBox(
      `zombieArmR_${Date.now()}`,
      { width: 0.15, height: 0.62, depth: 0.12 },
      scene
    );
    armRight.position = new Vector3(0.28, 0.46, 0);
    armRight.parent = zombieRoot;
    armRight.material = variantMat;
    armRight.isPickable = false;

    // Left leg
    const legLeft = MeshBuilder.CreateBox(
      `zombieLegL_${Date.now()}`,
      { width: 0.16, height: 0.64, depth: 0.12 },
      scene
    );
    legLeft.position = new Vector3(-0.12, -0.32, 0);
    legLeft.parent = zombieRoot;
    legLeft.material = variantMat;
    legLeft.isPickable = false;

    // Right leg
    const legRight = MeshBuilder.CreateBox(
      `zombieLegR_${Date.now()}`,
      { width: 0.16, height: 0.64, depth: 0.12 },
      scene
    );
    legRight.position = new Vector3(0.12, -0.32, 0);
    legRight.parent = zombieRoot;
    legRight.material = variantMat;
    legRight.isPickable = false;

    const fallbackBounds = zombieRoot.getHierarchyBoundingVectors();
    zombieRoot.position.y += ZOMBIE_FEET_Y - fallbackBounds.min.y;

    zombies.push(zombieRoot);
    zombieVelocities.push({ y: 0 });
    zombieAnimationGroups.push([]);
    zombieGroundHeights.push(zombieRoot.position.y);
    zombieHitPoints.push(variant === "bloated" || variant === "tough" ? 2 : 1);
    zombieHitRadii.push(Math.max(0.6, 0.62 * scale));
    zombieHitHeights.push(Math.max(0.7, 0.85 * scale));
  };

  const spawnMedBox = () => {
    if (medBoxes.length >= 4) {
      return;
    }

    const angle = Math.random() * Math.PI * 2;
    const distance = 10 + Math.random() * 20;
    const basePosition = new Vector3(
      camera.position.x + Math.cos(angle) * distance,
      0.35,
      camera.position.z + Math.sin(angle) * distance
    );
    basePosition.x = Math.max(
      -MAP_BOUNDARY + PICKUP_SPAWN_MARGIN,
      Math.min(MAP_BOUNDARY - PICKUP_SPAWN_MARGIN, basePosition.x)
    );
    basePosition.z = Math.max(
      -MAP_BOUNDARY + PICKUP_SPAWN_MARGIN,
      Math.min(MAP_BOUNDARY - PICKUP_SPAWN_MARGIN, basePosition.z)
    );

    const medBox = MeshBuilder.CreateBox(
      `med_box_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      { width: 0.7, height: 0.5, depth: 0.7 },
      scene
    );
    medBox.position = basePosition;
    medBox.material = medBoxMat;
    medBox.isPickable = false;

    const crossVertical = MeshBuilder.CreateBox(
      `med_cross_v_${Date.now()}`,
      { width: 0.12, height: 0.34, depth: 0.06 },
      scene
    );
    crossVertical.parent = medBox;
    crossVertical.position = new Vector3(0, 0, 0.38);
    crossVertical.material = medCrossMat;
    crossVertical.isPickable = false;

    const crossHorizontal = MeshBuilder.CreateBox(
      `med_cross_h_${Date.now()}`,
      { width: 0.34, height: 0.12, depth: 0.06 },
      scene
    );
    crossHorizontal.parent = medBox;
    crossHorizontal.position = new Vector3(0, 0, 0.38);
    crossHorizontal.material = medCrossMat;
    crossHorizontal.isPickable = false;

    medBoxes.push(medBox);
  };

  const spawnAmmoBox = () => {
    if (ammoBoxes.length >= 4) {
      return;
    }

    const angle = Math.random() * Math.PI * 2;
    const distance = 10 + Math.random() * 20;
    const basePosition = new Vector3(
      camera.position.x + Math.cos(angle) * distance,
      0.28,
      camera.position.z + Math.sin(angle) * distance
    );
    basePosition.x = Math.max(
      -MAP_BOUNDARY + PICKUP_SPAWN_MARGIN,
      Math.min(MAP_BOUNDARY - PICKUP_SPAWN_MARGIN, basePosition.x)
    );
    basePosition.z = Math.max(
      -MAP_BOUNDARY + PICKUP_SPAWN_MARGIN,
      Math.min(MAP_BOUNDARY - PICKUP_SPAWN_MARGIN, basePosition.z)
    );

    const ammoBox = MeshBuilder.CreateBox(
      `ammo_box_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      { width: 0.8, height: 0.4, depth: 0.55 },
      scene
    );
    ammoBox.position = basePosition;
    ammoBox.material = ammoBoxMat;
    ammoBox.isPickable = false;

    const stripe = MeshBuilder.CreateBox(
      `ammo_stripe_${Date.now()}`,
      { width: 0.58, height: 0.08, depth: 0.05 },
      scene
    );
    stripe.parent = ammoBox;
    stripe.position = new Vector3(0, 0, 0.3);
    stripe.material = ammoStripeMat;
    stripe.isPickable = false;

    ammoBoxes.push(ammoBox);
  };

  const spawnSniperPickup = () => {
    if (sniperPickupSpawned || hasSniperRifle) {
      return;
    }

    // Hidden deep in a ruined building interior - only spawn once
    const sniperPosition = new Vector3(56, 3.2, 20); // Very hidden spot - deep inside a ruined building

    const sniperPickup = new Mesh(`sniper_pickup_${Date.now()}`, scene);
    sniperPickup.position = sniperPosition;
    sniperPickup.rotation = new Vector3(0.18, Math.PI * 0.2, -0.12);
    sniperPickup.isPickable = false;

    const pickupStock = MeshBuilder.CreateBox(
      `sniper_pickup_stock_${Date.now()}`,
      { width: 0.16, height: 0.18, depth: 0.72 },
      scene
    );
    pickupStock.parent = sniperPickup;
    pickupStock.position = new Vector3(-0.16, 0.02, -0.08);
    pickupStock.rotation = new Vector3(0.08, -0.06, 0);
    pickupStock.material = sniperStockMat;
    pickupStock.isPickable = false;

    const pickupReceiver = MeshBuilder.CreateBox(
      `sniper_pickup_receiver_${Date.now()}`,
      { width: 0.14, height: 0.16, depth: 0.38 },
      scene
    );
    pickupReceiver.parent = sniperPickup;
    pickupReceiver.position = new Vector3(0, 0.06, 0.26);
    pickupReceiver.material = weaponMetalMat;
    pickupReceiver.isPickable = false;

    const pickupBarrel = MeshBuilder.CreateCylinder(
      `sniper_pickup_barrel_${Date.now()}`,
      { height: 1.28, diameter: 0.08, tessellation: 12 },
      scene
    );
    pickupBarrel.parent = sniperPickup;
    pickupBarrel.rotation.x = Math.PI / 2;
    pickupBarrel.position = new Vector3(0, 0.08, 0.94);
    pickupBarrel.material = weaponMetalMat;
    pickupBarrel.isPickable = false;

    const pickupMuzzle = MeshBuilder.CreateCylinder(
      `sniper_pickup_muzzle_${Date.now()}`,
      { height: 0.16, diameter: 0.11, tessellation: 12 },
      scene
    );
    pickupMuzzle.parent = sniperPickup;
    pickupMuzzle.rotation.x = Math.PI / 2;
    pickupMuzzle.position = new Vector3(0, 0.08, 1.64);
    pickupMuzzle.material = weaponGripMat;
    pickupMuzzle.isPickable = false;

    const pickupScopeBody = MeshBuilder.CreateCylinder(
      `sniper_pickup_scope_${Date.now()}`,
      { height: 0.52, diameter: 0.09, tessellation: 10 },
      scene
    );
    pickupScopeBody.parent = sniperPickup;
    pickupScopeBody.rotation.x = Math.PI / 2;
    pickupScopeBody.position = new Vector3(0, 0.22, 0.3);
    pickupScopeBody.material = weaponGripMat;
    pickupScopeBody.isPickable = false;

    const pickupScopeLens = MeshBuilder.CreateCylinder(
      `sniper_pickup_scope_lens_${Date.now()}`,
      { height: 0.1, diameter: 0.11, tessellation: 10 },
      scene
    );
    pickupScopeLens.parent = sniperPickup;
    pickupScopeLens.rotation.x = Math.PI / 2;
    pickupScopeLens.position = new Vector3(0, 0.22, 0.58);
    pickupScopeLens.material = sniperScopeMat;
    pickupScopeLens.isPickable = false;

    const pickupGrip = MeshBuilder.CreateBox(
      `sniper_pickup_grip_${Date.now()}`,
      { width: 0.12, height: 0.3, depth: 0.16 },
      scene
    );
    pickupGrip.parent = sniperPickup;
    pickupGrip.position = new Vector3(0, -0.14, 0.08);
    pickupGrip.rotation.x = 0.24;
    pickupGrip.material = weaponGripMat;
    pickupGrip.isPickable = false;

    const pickupMagazine = MeshBuilder.CreateBox(
      `sniper_pickup_mag_${Date.now()}`,
      { width: 0.11, height: 0.2, depth: 0.12 },
      scene
    );
    pickupMagazine.parent = sniperPickup;
    pickupMagazine.position = new Vector3(0, -0.08, 0.28);
    pickupMagazine.rotation.x = -0.1;
    pickupMagazine.material = sniperBoxMat;
    pickupMagazine.isPickable = false;

    // Store reference for pickup detection
    (sniperPickup as any).isSniperPickup = true;
    medBoxes.push(sniperPickup); // Add to medBoxes for collision detection (reuse existing system)
    sniperPickupSpawned = true;
  };

  const hitParticleMat = new StandardMaterial("hitParticleMat", scene);
  hitParticleMat.diffuseColor = new Color3(0.9, 0.95, 0.4);
  hitParticleMat.emissiveColor = new Color3(0.25, 0.3, 0.08);
  hitParticleMat.specularColor = Color3.Black();

  const bulletMat = new StandardMaterial("bulletMat", scene);
  bulletMat.diffuseColor = new Color3(0.55, 0.8, 1.0);
  bulletMat.emissiveColor = new Color3(0.1, 0.22, 0.35);
  bulletMat.specularColor = Color3.Black();

  const spawnHitBurst = (position: Vector3) => {
    for (let i = 0; i < 14; i++) {
      const particle = MeshBuilder.CreateSphere(
        `hit_particle_${Date.now()}_${i}`,
        { diameter: 0.08 + Math.random() * 0.06, segments: 4 },
        scene
      );
      particle.position.copyFrom(position);
      particle.material = hitParticleMat;
      particle.isPickable = false;

      const velocity = new Vector3(
        (Math.random() - 0.5) * 4.5,
        1.2 + Math.random() * 2.2,
        (Math.random() - 0.5) * 4.5
      );

      hitParticles.push({
        mesh: particle,
        velocity,
        life: 0.25 + Math.random() * 0.2,
      });
    }
  };

  const spawnBullet = () => {
    const spawnPosition = camera.position
      .add(camera.getDirection(new Vector3(0.32, -0.18, 0.95)));
    const forward = camera.getForwardRay().direction.normalize();

    const bullet = MeshBuilder.CreateSphere(
      `bullet_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      { diameter: 0.12, segments: 6 },
      scene
    );
    bullet.position.copyFrom(spawnPosition);
    bullet.material = bulletMat;
    bullet.isPickable = false;

    bullets.push({
      mesh: bullet,
      velocity: forward.scale(40),
      life: 4.0,
    });
  };

  const getPlanarDistance = (a: Vector3, b: Vector3) => {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  };

  const collectCasterMeshes = (root: Mesh): AbstractMesh[] => {
    const children = root.getChildMeshes();
    if (children.length === 0) {
      return [root];
    }
    return children;
  };

  const updateShadowCasters = () => {
    if (!shadowGenerator) {
      return;
    }

    const shadowMap = shadowGenerator.getShadowMap();
    if (!shadowMap) {
      return;
    }

    const casterSet = new Set<AbstractMesh>();

    if (ZOMBIES_CAST_SHADOWS) {
      for (const zombie of zombies) {
        if (zombie.isDisposed()) {
          continue;
        }
        for (const mesh of collectCasterMeshes(zombie)) {
          casterSet.add(mesh);
        }
      }
    }

    if (PROPS_CAST_SHADOWS) {
      const nearestProps = shadowCandidateProps
        .filter((prop) => !prop.isDisposed())
        .sort(
          (a, b) =>
            Vector3.DistanceSquared(a.position, camera.position) -
            Vector3.DistanceSquared(b.position, camera.position)
        )
        .slice(0, MAX_PROP_SHADOW_CASTERS);

      for (const prop of nearestProps) {
        for (const mesh of collectCasterMeshes(prop)) {
          casterSet.add(mesh);
        }
      }
    }

    shadowMap.renderList = Array.from(casterSet);
  };

  scene.onPointerObservable.add((pointerInfo) => {
    if (isGameOver || !gameStarted) {
      return;
    }

    if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) {
      return;
    }

    const event = pointerInfo.event as PointerEvent;
    if (event.button !== 0) {
      return;
    }

    if (document.pointerLockElement !== canvas) {
      return;
    }

    if (ammo <= 0) {
      playDryFireSound();
      return;
    }

    ammo -= 1;
    playShootSound();
    spawnBullet();
    updateHud();
  });

  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.033, engine.getDeltaTime() / 1000);

    shadowRefreshTimer += dt;
    if (shadowRefreshTimer >= SHADOW_REFRESH_INTERVAL) {
      shadowRefreshTimer = 0;
      updateShadowCasters();
    }

    // Handle scope zoom
    if (isScopeActive) {
      camera.fov = 0.35; // Zoomed in for sniper scope
      camera.angularSensibility = 2000; // More sensitive/precise aiming
      weaponRoot.isVisible = false;
      sniperRoot.isVisible = true;
    } else {
      camera.fov = 0.8; // Normal view
      camera.angularSensibility = 1000; // Normal sensitivity
      if (hasSniperRifle) {
        weaponRoot.isVisible = false;
        sniperRoot.isVisible = true;
      } else {
        weaponRoot.isVisible = true;
        sniperRoot.isVisible = false;
      }
    }

    // Check if player is near a tower
    onTowerIndex = -1;
    for (let i = 0; i < towers.length; i++) {
      const tower = towers[i];
      const dx = camera.position.x - tower.x;
      const dz = camera.position.z - tower.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const detectionRange = isOnTowerClimbing ? 5 : 3.5; // Larger range while climbing
      if (dist <= detectionRange) {
        onTowerIndex = i;
        break;
      }
    }

    // Exit climbing if player moves away from tower
    if (onTowerIndex < 0 && isOnTowerClimbing) {
      isOnTowerClimbing = false;
      isClimbingUp = false;
      isClimbingDown = false;
      towerClimbHeight = 0;
    }

    // Handle tower climbing
    if (isOnTowerClimbing && onTowerIndex >= 0) {
      const tower = towers[onTowerIndex];
      const maxClimbHeight = 16; // Top of the sniper nest + extra height
      if (isClimbingUp) {
        towerClimbHeight = Math.min(maxClimbHeight, towerClimbHeight + dt * 8);
      }
      if (isClimbingDown) {
        towerClimbHeight = Math.max(0, towerClimbHeight - dt * 8);
        if (towerClimbHeight <= 0) {
          isOnTowerClimbing = false;
        }
      }
      
      // Position player on the ladder
      const ladderOffsetX = 0.9;
      const ladderOffsetZ = 0.9;
      camera.position.x = tower.x + ladderOffsetX;
      camera.position.z = tower.z + ladderOffsetZ;
      camera.position.y = 1.8 + towerClimbHeight;
      
      // Once at top, position on platform for sniping
      if (towerClimbHeight >= 10.2) {
        camera.position.x = tower.x;
        camera.position.z = tower.z;
        camera.position.y = 1.8 + towerClimbHeight;
      }
      
      verticalVelocity = 0;
      isGrounded = true;
    } else if (!isOnTowerClimbing) {
      towerClimbHeight = 0;
      // Apply gravity and jump
      verticalVelocity -= GRAVITY * dt;
      verticalVelocity = Math.max(-MAX_FALL_SPEED, verticalVelocity);
      camera.position.y += verticalVelocity * dt;
      if (camera.position.y <= PLAYER_EYE_HEIGHT) {
        camera.position.y = PLAYER_EYE_HEIGHT;
        verticalVelocity = 0;
        isGrounded = true;
      } else {
        isGrounded = false;
      }
    }

    // Disable movement while climbing, apply sprint speed otherwise
    if (isOnTowerClimbing) {
      camera.angularSensibility = 1000;
      camera.speed = 0;
    } else {
      camera.speed = isSprinting ? SPRINT_SPEED : WALK_SPEED;
    }

    // Tower collision (prevent walking into tower column when not climbing)
    if (!isOnTowerClimbing) {
      const TOWER_COLLISION_RADIUS = 1.5;
      for (const tower of towers) {
        const dx = camera.position.x - tower.x;
        const dz = camera.position.z - tower.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < TOWER_COLLISION_RADIUS && dist > 0.01) {
          const overlap = TOWER_COLLISION_RADIUS - dist;
          const safeDist = Math.max(0.0001, dist);
          camera.position.x += (dx / safeDist) * overlap;
          camera.position.z += (dz / safeDist) * overlap;
        }
      }
    }

    // Building collision detection
    const BUILDING_COLLISION_RADIUS = 4;
    for (const [x, _, z] of activeBuildingPositions) {
      const dx = camera.position.x - x;
      const dz = camera.position.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < BUILDING_COLLISION_RADIUS) {
        const overlap = BUILDING_COLLISION_RADIUS - dist;
        const safeDist = Math.max(0.0001, dist);
        camera.position.x += (dx / safeDist) * overlap;
        camera.position.z += (dz / safeDist) * overlap;
      }
    }

    // Car collision: player cannot pass through parked cars.
    const CAR_COLLISION_RADIUS = 2.0;
    for (const car of cars) {
      const dx = camera.position.x - car.position.x;
      const dz = camera.position.z - car.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < CAR_COLLISION_RADIUS) {
        const overlap = CAR_COLLISION_RADIUS - dist;
        const safeDist = Math.max(0.0001, dist);
        camera.position.x += (dx / safeDist) * overlap;
        camera.position.z += (dz / safeDist) * overlap;
      }
    }

    // Zombie collision: player cannot move through zombies.
    const ZOMBIE_COLLISION_RADIUS = 1.1;
    for (const zombie of zombies) {
      const dx = camera.position.x - zombie.position.x;
      const dz = camera.position.z - zombie.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < ZOMBIE_COLLISION_RADIUS) {
        const overlap = ZOMBIE_COLLISION_RADIUS - dist;
        const safeDist = Math.max(0.0001, dist);
        camera.position.x += (dx / safeDist) * overlap;
        camera.position.z += (dz / safeDist) * overlap;
      }
    }

    // Keep the player inside map limits.
    camera.position.x = Math.max(-MAP_BOUNDARY, Math.min(MAP_BOUNDARY, camera.position.x));
    camera.position.z = Math.max(-MAP_BOUNDARY, Math.min(MAP_BOUNDARY, camera.position.z));

    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      bullet.life -= dt;
      bullet.mesh.position.addInPlace(bullet.velocity.scale(dt));

      let hitZombieIndex = -1;
      for (let j = 0; j < zombies.length; j++) {
        const zombie = zombies[j];
        const hitTarget = zombie.position.clone();
        hitTarget.y += zombieHitHeights[j] ?? 0.9;
        const hitDistance = Vector3.Distance(bullet.mesh.position, hitTarget);
        if (hitDistance <= (zombieHitRadii[j] ?? 0.75)) {
          hitZombieIndex = j;
          break;
        }
      }

      if (hitZombieIndex !== -1) {
        const zombie = zombies[hitZombieIndex];
        const hitPosition = zombie.position.clone();
        bullet.mesh.dispose();
        bullets.splice(i, 1);
        spawnHitBurst(hitPosition);
        playHitSound();

        zombieHitPoints[hitZombieIndex] -= 1;
        if (zombieHitPoints[hitZombieIndex] <= 0) {
          const animGroups = zombieAnimationGroups[hitZombieIndex];
          animGroups?.forEach((group) => {
            group.stop();
            group.dispose();
          });
          zombie.dispose();
          zombies.splice(hitZombieIndex, 1);
          zombieVelocities.splice(hitZombieIndex, 1);
          zombieAnimationGroups.splice(hitZombieIndex, 1);
          zombieGroundHeights.splice(hitZombieIndex, 1);
          zombieHitPoints.splice(hitZombieIndex, 1);
          zombieHitRadii.splice(hitZombieIndex, 1);
          zombieHitHeights.splice(hitZombieIndex, 1);
          score += 1;
          updateHud();
        }
        continue;
      }

      if (bullet.life <= 0) {
        bullet.mesh.dispose();
        bullets.splice(i, 1);
      }
    }

    for (let i = hitParticles.length - 1; i >= 0; i--) {
      const particle = hitParticles[i];
      particle.life -= dt;
      particle.velocity.y -= 6.5 * dt;
      particle.mesh.position.addInPlace(particle.velocity.scale(dt));

      if (particle.life <= 0) {
        particle.mesh.dispose();
        hitParticles.splice(i, 1);
      }
    }

    if (isGameOver || !gameStarted) {
      return;
    }

    survivalTime += dt;
    spawnTimer += dt;
    medSpawnTimer += dt;
    ammoSpawnTimer += dt;

    // Spawn sniper rifle once at the start of the game
    if (survivalTime > 2.5 && !sniperPickupSpawned) {
      spawnSniperPickup();
    }

    const zombieSpawnInterval = Math.max(1.25, 3 - survivalTime * 0.015);
    const zombiesPerWave = Math.min(5, 1 + Math.floor(survivalTime / 25));

    if (spawnTimer >= zombieSpawnInterval) {
      spawnTimer = 0;
      for (let i = 0; i < zombiesPerWave; i++) {
        spawnZombie();
      }
    }
    if (medSpawnTimer >= 8) {
      medSpawnTimer = 0;
      spawnMedBox();
    }
    if (ammoSpawnTimer >= 10) {
      ammoSpawnTimer = 0;
      spawnAmmoBox();
    }

    for (let i = medBoxes.length - 1; i >= 0; i--) {
      const medBox = medBoxes[i];
      medBox.rotation.y += dt * 1.5;

      const pickupDistance = getPlanarDistance(camera.position, medBox.position);
      if (pickupDistance <= 1.5) {
        // Check if this is a sniper pickup
        if ((medBox as any).isSniperPickup) {
          hasSniperRifle = true;
          isScopeActive = false;
          weaponRoot.isVisible = false;
          sniperRoot.isVisible = true;
          crosshair.style.display = "block";
          playPickupSound();
          updateHud();
        } else {
          playerHealth = Math.min(100, playerHealth + 15);
          playPickupSound();
        }
        medBox.dispose();
        medBoxes.splice(i, 1);
      }
    }

    for (let i = ammoBoxes.length - 1; i >= 0; i--) {
      const ammoBox = ammoBoxes[i];
      ammoBox.rotation.y += dt * 1.25;

      const pickupDistance = getPlanarDistance(camera.position, ammoBox.position);
      if (pickupDistance <= 1.5) {
        ammo += 10;
        playPickupSound();
        ammoBox.dispose();
        ammoBoxes.splice(i, 1);
      }
    }

    const ZOMBIE_VISION_RANGE = 35;
    const ZOMBIE_GRAVITY = 36;
    const ZOMBIE_SEPARATION_RADIUS = 0.6;
    const ZOMBIE_BUILDING_COLLISION_RADIUS = 3.5;
    const ZOMBIE_CAR_COLLISION_RADIUS = 1.8;
    const ZOMBIE_ANIMATION_RANGE = 22;
    const ZOMBIE_BASE_SPEED = 1.42;
    const ZOMBIE_SPEED_RAMP = 0.055;

    for (let zombieIndex = 0; zombieIndex < zombies.length; zombieIndex++) {
      const zombie = zombies[zombieIndex];
      const toPlayer = camera.position.subtract(zombie.position);
      toPlayer.y = 0;
      const distance = toPlayer.length();
      const zombieSpeedFactor = ZOMBIE_BASE_SPEED + survivalTime * ZOMBIE_SPEED_RAMP;

      // Compute turn intent before movement so we can reduce sideways gliding.
      const targetRotationY = Math.atan2(toPlayer.x, toPlayer.z);
      const rotationDiff = targetRotationY - zombie.rotation.y;
      let normalizedDiff = rotationDiff;
      while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
      while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;
      const facingFactor = Math.max(0.4, 1 - Math.abs(normalizedDiff) / (Math.PI * 0.9));
      const approachFactor = Math.min(1, Math.max(0.55, distance / 4.2));

      // Zombies can only see/chase player if within vision range
      const canSeePlayer = distance <= ZOMBIE_VISION_RANGE;

      const animGroups = zombieAnimationGroups[zombieIndex] ?? [];
      if (animGroups.length > 0) {
        const shouldAnimate = canSeePlayer && distance <= ZOMBIE_ANIMATION_RANGE;
        const animSpeed = Math.min(1.08, 0.82 + zombieSpeedFactor * 0.11);
        for (const group of animGroups) {
          group.speedRatio = animSpeed;
          if (shouldAnimate) {
            if (!group.isPlaying) {
              group.start(true, animSpeed, group.from, group.to, false);
            }
          } else if (group.isPlaying) {
            group.pause();
          }
        }
      }

      // Apply gravity to zombies
      zombieVelocities[zombieIndex].y -= ZOMBIE_GRAVITY * dt;
      zombieVelocities[zombieIndex].y = Math.max(-45, zombieVelocities[zombieIndex].y);
      
      zombie.position.y += zombieVelocities[zombieIndex].y * dt;
      
      // Ground collision
      const zombieGroundY = zombieGroundHeights[zombieIndex] ?? 0.03;
      if (zombie.position.y <= zombieGroundY) {
        zombie.position.y = zombieGroundY;
        zombieVelocities[zombieIndex].y = 0;
      }

      // Check if zombie is near a tower and player is actively climbing on tower
      let isClimbing = false;
      if (isOnTowerClimbing && onTowerIndex >= 0 && canSeePlayer) {
        const tower = towers[onTowerIndex];
        const zDist = Math.sqrt((zombie.position.x - tower.x) ** 2 + (zombie.position.z - tower.z) ** 2);
        if (zDist <= 3.5) {
          isClimbing = true;
          // Make zombie slowly climb tower toward player
          const climbSpeed = dt * 1.5;
          const maxZombieHeight = 16; // Zombies can climb as high as the tower goes
          if (zombie.position.y < Math.min(camera.position.y, 1.8 + maxZombieHeight)) {
            zombie.position.y += climbSpeed;
          }
          // Position zombie around the ladder with slight variation to prevent stacking
          const ladderOffsetX = 0.9;
          const ladderOffsetZ = 0.9;
          const spreadRadius = 1.2;
          
          // Use zombie's unique ID to create a consistent spread angle
          const zombieId = zombieIndex;
          const spreadAngle = (zombieId * Math.PI * 2) / Math.max(1, zombies.length);
          const spreadDist = Math.min(spreadRadius, 0.3 + (zombieId * 0.15) % 0.9);
          
          zombie.position.x = tower.x + ladderOffsetX + Math.cos(spreadAngle) * spreadDist;
          zombie.position.z = tower.z + ladderOffsetZ + Math.sin(spreadAngle) * spreadDist;
          
          // Cancel vertical velocity while climbing
          zombieVelocities[zombieIndex].y = 0;
        }
      }

      if (!isClimbing && distance > 0.01 && canSeePlayer) {
        const moveSpeed = zombieSpeedFactor * facingFactor * approachFactor;
        const move = toPlayer.scale((1 / distance) * dt * moveSpeed);
        zombie.position.addInPlace(move);

        // Make zombie face the player with smooth rotation
        const maxTurnSpeed = dt * 2.5;

        // Apply limited rotation
        if (Math.abs(normalizedDiff) > maxTurnSpeed) {
          zombie.rotation.y += Math.sign(normalizedDiff) * maxTurnSpeed;
        } else {
          zombie.rotation.y = targetRotationY;
        }
      }

      // Zombie-to-zombie collision to prevent stacking
      for (let j = 0; j < zombies.length; j++) {
        if (j === zombieIndex) continue;
        const otherZombie = zombies[j];
        const separation = zombie.position.subtract(otherZombie.position);
        const sepDist = separation.length();
        
        if (sepDist < ZOMBIE_SEPARATION_RADIUS && sepDist > 0.01) {
          const pushForce = (ZOMBIE_SEPARATION_RADIUS - sepDist) * 0.5;
          const pushDirection = separation.scale(1 / sepDist);
          zombie.position.addInPlace(pushDirection.scale(pushForce * dt));
        }
      }

      // Zombie collision with buildings
      for (const [x, _, z] of activeBuildingPositions) {
        const dx = zombie.position.x - x;
        const dz = zombie.position.z - z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < ZOMBIE_BUILDING_COLLISION_RADIUS && dist > 0.01) {
          const overlap = ZOMBIE_BUILDING_COLLISION_RADIUS - dist;
          const safeDist = Math.max(0.0001, dist);
          zombie.position.x += (dx / safeDist) * overlap;
          zombie.position.z += (dz / safeDist) * overlap;
        }
      }

      // Zombie collision with cars
      for (const car of cars) {
        const dx = zombie.position.x - car.position.x;
        const dz = zombie.position.z - car.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < ZOMBIE_CAR_COLLISION_RADIUS && dist > 0.01) {
          const overlap = ZOMBIE_CAR_COLLISION_RADIUS - dist;
          const safeDist = Math.max(0.0001, dist);
          zombie.position.x += (dx / safeDist) * overlap;
          zombie.position.z += (dz / safeDist) * overlap;
        }
      }

      if (distance <= 1.5 && canSeePlayer) {
        // Only take damage if zombie is also within reasonable vertical distance
        const verticalDistance = Math.abs(camera.position.y - zombie.position.y);
        if (verticalDistance <= 2.5) {
          playerHealth = Math.max(0, playerHealth - 7 * dt);
          damageFlash = Math.min(1, Math.max(damageFlash, 0.45));
        }
        if (playerHealth <= 0) {
          showGameOver();
          break;
        }
      }
    }

    damageFlash = Math.max(0, damageFlash - dt * 2.4);
    damageOverlay.style.opacity = (damageFlash * 0.55).toFixed(3);

    updateHud();
  });

  return scene;
}

// Bootstrapping.
const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #renderCanvas not found");

const engine = new Engine(canvas, true);
const scene = createScene(engine, canvas);

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
