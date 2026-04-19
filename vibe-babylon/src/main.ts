
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
  PointerEventTypes,
  KeyboardEventTypes,
  StandardMaterial,
} from "@babylonjs/core";

function createScene(engine: Engine, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);

  // Sunset background: lighter warm orange.
  scene.clearColor = new Color4(0.92, 0.5, 0.28, 1.0);

  // Light fog so distant ruins fade into atmosphere.
  scene.fogMode = Scene.FOGMODE_EXP;
  scene.fogColor = new Color3(0.64, 0.3, 0.2);
  scene.fogDensity = 0.012;

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

  // Warm sunset lighting.
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.45;
  hemi.groundColor = new Color3(0.2, 0.07, 0.05);

  const sun = new DirectionalLight("sun", new Vector3(-0.8, -1.3, -0.3), scene);
  sun.position = new Vector3(30, 35, 20);
  sun.intensity = 1.35;
  sun.diffuse = new Color3(1.0, 0.62, 0.35);

  // Ground
  const ground = MeshBuilder.CreateGround("ground", { width: 140, height: 140 }, scene);
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new Color3(0.18, 0.14, 0.12);
  groundMat.specularColor = Color3.Black();
  ground.material = groundMat;

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

  const createCar = (name: string, position: Vector3, rotationY: number) => {
    const carRoot = new Mesh(name, scene);
    carRoot.position = position;
    carRoot.rotation.y = rotationY;
    carRoot.isPickable = false;
    cars.push(carRoot);

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
  while (treesCreated < 24 && treeAttempts < 320) {
    treeAttempts++;
    const angle = Math.random() * Math.PI * 2;
    const radius = 44 + Math.random() * 24;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isOnRoad(x, z, 3.5)) {
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

  const zombies: Mesh[] = [];
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

  const hud = document.createElement("div");
  hud.style.position = "fixed";
  hud.style.top = "12px";
  hud.style.left = "12px";
  hud.style.color = "#d6ffd6";
  hud.style.fontFamily = "monospace";
  hud.style.fontSize = "18px";
  hud.style.textShadow = "1px 1px 2px #000";
  hud.style.pointerEvents = "none";
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
  crosshair.textContent = "+";
  document.body.appendChild(crosshair);

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
    const angle = Math.random() * Math.PI * 2;
    const distance = 15 + Math.random() * 10;
    const spawnPosition = new Vector3(
      camera.position.x + Math.cos(angle) * distance,
      0.9,
      camera.position.z + Math.sin(angle) * distance
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

    const zombieRoot = new Mesh(`zombieRoot_${variant}_${Date.now()}_${Math.floor(Math.random() * 1000)}`, scene);
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

    zombies.push(zombieRoot);
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
      velocity: forward.scale(30),
      life: 1.2,
    });
  };

  const getPlanarDistance = (a: Vector3, b: Vector3) => {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  };

  scene.onPointerObservable.add((pointerInfo) => {
    if (isGameOver) {
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
        const hitDistance = Vector3.Distance(bullet.mesh.position, zombies[j].position);
        if (hitDistance <= 0.75) {
          hitZombieIndex = j;
          break;
        }
      }

      if (hitZombieIndex !== -1) {
        const zombie = zombies[hitZombieIndex];
        const hitPosition = zombie.position.clone();
        zombie.dispose();
        zombies.splice(hitZombieIndex, 1);
        bullet.mesh.dispose();
        bullets.splice(i, 1);
        spawnHitBurst(hitPosition);
        playHitSound();
        score += 1;
        updateHud();
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

    if (isGameOver) {
      return;
    }

    survivalTime += dt;
    spawnTimer += dt;
    medSpawnTimer += dt;
    ammoSpawnTimer += dt;

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
        playerHealth = Math.min(100, playerHealth + 15);
        playPickupSound();
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

    for (const zombie of zombies) {
      const toPlayer = camera.position.subtract(zombie.position);
      toPlayer.y = 0;
      const distance = toPlayer.length();

      // Zombies can only see/chase player if within vision range
      const ZOMBIE_VISION_RANGE = 35;
      const canSeePlayer = distance <= ZOMBIE_VISION_RANGE;

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
          // Position zombie on the ladder
          const ladderOffsetX = 0.9;
          const ladderOffsetZ = 0.9;
          zombie.position.x = tower.x + ladderOffsetX;
          zombie.position.z = tower.z + ladderOffsetZ;
        }
      }

      if (!isClimbing && distance > 0.01 && canSeePlayer) {
        const zombieSpeedFactor = 1.8 + survivalTime * 0.08;
        const move = toPlayer.scale((1 / distance) * dt * zombieSpeedFactor);
        zombie.position.addInPlace(move);

        // Make zombie face the player with smooth rotation
        const targetRotationY = Math.atan2(toPlayer.x, toPlayer.z);
        const maxTurnSpeed = dt * 2.5;
        const rotationDiff = targetRotationY - zombie.rotation.y;

        // Normalize angle difference to [-PI, PI]
        let normalizedDiff = rotationDiff;
        while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
        while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;

        // Apply limited rotation
        if (Math.abs(normalizedDiff) > maxTurnSpeed) {
          zombie.rotation.y += Math.sign(normalizedDiff) * maxTurnSpeed;
        } else {
          zombie.rotation.y = targetRotationY;
        }
      }

      // Zombie-to-zombie collision to prevent stacking
      const ZOMBIE_SEPARATION_RADIUS = 0.6;
      for (let j = 0; j < zombies.length; j++) {
        if (j === zombies.indexOf(zombie)) continue;
        const otherZombie = zombies[j];
        const separation = zombie.position.subtract(otherZombie.position);
        const sepDist = separation.length();
        
        if (sepDist < ZOMBIE_SEPARATION_RADIUS && sepDist > 0.01) {
          const pushForce = (ZOMBIE_SEPARATION_RADIUS - sepDist) * 0.5;
          const pushDirection = separation.scale(1 / sepDist);
          zombie.position.addInPlace(pushDirection.scale(pushForce * dt));
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
