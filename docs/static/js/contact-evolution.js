import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const root = document.querySelector("[data-contact-evolution]");

if (root) {
  const minimapConfigs = [
    {
      key: "feet",
      label: "Feet",
      offset: (radius) => new THREE.Vector3(0.0, radius * 0.18, radius * 2.2),
    },
    {
      key: "leftHand",
      label: "Left Hand",
      offset: (radius) => new THREE.Vector3(-radius * 1.1, radius * 0.1, radius * 1.75),
    },
    {
      key: "rightHand",
      label: "Right Hand",
      offset: (radius) => new THREE.Vector3(radius * 1.1, radius * 0.1, radius * 1.75),
    },
  ];

  const config = {
    meshPath: "static/contact/tpose_smpl_template.obj",
    sequences: [
      {
        id: "vid8",
        title: "Sequence 1",
        path: "static/contact/vid8/contact_sequence.json",
      },
      {
        id: "rich_localmesh_Gym_013_dips3",
        title: "Sequence 2",
        path: "static/contact/rich_localmesh_Gym_013_dips3/contact_sequence.json",
      },
      {
        id: "rich_localmesh_LectureHall_021_sidebalancerun1",
        title: "Sequence 3",
        path: "static/contact/rich_localmesh_LectureHall_021_sidebalancerun1/contact_sequence.json",
      },
      {
        id: "rich_plausibility1",
        title: "Sequence 4",
        path: "static/contact/rich_plausibility1/contact_sequence.json",
      },
      {
        id: "rich_plausibility2",
        title: "Sequence 5",
        path: "static/contact/rich_plausibility2/contact_sequence.json",
      },
      {
        id: "emdb_P4_35_indoor_walk",
        title: "Sequence 6",
        path: "static/contact/emdb_P4_35_indoor_walk/contact_sequence.json",
      },
      {
        id: "emdb_P9_77_outdoor_stairs_up",
        title: "Sequence 7",
        path: "static/contact/emdb_P9_77_outdoor_stairs_up/contact_sequence.json",
      },
      {
        id: "emdb_P3_30_outdoor_stairs_down",
        title: "Sequence 8",
        path: "static/contact/emdb_P3_30_outdoor_stairs_down/contact_sequence.json",
      },
    ],
  };

  const ui = {
    tabs: root.querySelector("[data-contact-tabs]"),
    image: root.querySelector("[data-contact-image]"),
    canvas: root.querySelector("[data-contact-canvas]"),
    minimapStack: root.querySelector("[data-contact-minimap-stack]"),
    status: root.querySelector("[data-contact-status]"),
    slider: root.querySelector("[data-contact-slider]"),
    play: root.querySelector("[data-contact-play]"),
    output: root.querySelector("[data-contact-output]"),
    minimaps: Object.fromEntries(
      minimapConfigs.map(({ key, label }) => [
        key,
        {
          label,
          element: root.querySelector(`[data-contact-minimap="${key}"]`),
          canvas: root.querySelector(`[data-contact-minimap-canvas="${key}"]`),
          caption: root.querySelector(`[data-contact-minimap-label="${key}"]`),
        },
      ])
    ),
  };

  const colors = {
    base: [0.79, 0.80, 0.80],
    current: [0.0, 0.82, 0.95],
  };

  ui.play.disabled = true;

  const state = {
    sequences: [],
    activeSequence: 0,
    activeFrame: 0,
    activePage: 0,
    pageSize: 5,
    playing: false,
    playTimer: 0,
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    mesh: null,
    colorBuffer: null,
    regions: null,
    minimaps: [],
  };

  function parseObj(text) {
    const vertices = [];
    const indices = [];

    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("v ")) {
        const parts = line.trim().split(/\s+/);
        vertices.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
      } else if (line.startsWith("f ")) {
        const face = line
          .trim()
          .split(/\s+/)
          .slice(1)
          .map((token) => Number(token.split("/")[0]) - 1)
          .filter((index) => Number.isInteger(index) && index >= 0);
        for (let i = 1; i + 1 < face.length; i += 1) {
          indices.push(face[0], face[i], face[i + 1]);
        }
      }
    }

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices),
      vertexCount: vertices.length / 3,
    };
  }

  function box3FromPositions(positions) {
    const box = new THREE.Box3();
    const vertex = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
      vertex.set(positions[i], positions[i + 1], positions[i + 2]);
      box.expandByPoint(vertex);
    }
    return box;
  }

  function buildRegionData(positions, predicate, fallbackBox) {
    const vertexCount = positions.length / 3;
    const mask = new Uint8Array(vertexCount);
    const box = new THREE.Box3();
    const vertex = new THREE.Vector3();
    let count = 0;

    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const offset = vertexIndex * 3;
      const x = positions[offset];
      const y = positions[offset + 1];
      const z = positions[offset + 2];
      if (!predicate(x, y, z)) continue;
      mask[vertexIndex] = 1;
      vertex.set(x, y, z);
      box.expandByPoint(vertex);
      count += 1;
    }

    const regionBox = count ? box : fallbackBox.clone();
    const size = regionBox.getSize(new THREE.Vector3());
    const center = regionBox.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.18);
    return { mask, center, radius };
  }

  function buildContactRegions(positions) {
    const overallBox = box3FromPositions(positions);
    const min = overallBox.min;
    const max = overallBox.max;
    const span = new THREE.Vector3().subVectors(max, min);
    const handYFloor = min.y + span.y * 0.32;
    const handInset = span.x * 0.12;
    const footCeiling = min.y + span.y * 0.18;

    return {
      feet: buildRegionData(positions, (_, y) => y <= footCeiling, overallBox),
      leftHand: buildRegionData(
        positions,
        (x, y) => x <= min.x + handInset && y >= handYFloor,
        overallBox
      ),
      rightHand: buildRegionData(
        positions,
        (x, y) => x >= max.x - handInset && y >= handYFloor,
        overallBox
      ),
    };
  }

  function createMinimaps(geometry) {
    state.minimaps = minimapConfigs
      .map((minimap) => {
        const uiEntry = ui.minimaps[minimap.key];
        if (!uiEntry?.canvas || !uiEntry.element || !uiEntry.caption) return null;
        const renderer = new THREE.WebGLRenderer({
          canvas: uiEntry.canvas,
          antialias: true,
          alpha: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0xffffff, 0);

        const scene = new THREE.Scene();
        const material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.58,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        scene.add(new THREE.HemisphereLight(0xffffff, 0xe6e8ec, 1.2));
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
        keyLight.position.set(1.2, 1.0, 2.0);
        scene.add(keyLight);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
        return {
          ...minimap,
          ...uiEntry,
          renderer,
          scene,
          mesh,
          camera,
        };
      })
      .filter(Boolean);
  }

  function resizeMinimap(minimap) {
    const rect = minimap.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width <= 1 || height <= 1) return;

    minimap.renderer.setSize(width, height, false);

    const region = state.regions?.[minimap.key];
    if (!region) return;
    const aspect = width / height;
    const halfHeight = region.radius * 0.82;
    const halfWidth = halfHeight * aspect;
    minimap.camera.left = -halfWidth;
    minimap.camera.right = halfWidth;
    minimap.camera.top = halfHeight;
    minimap.camera.bottom = -halfHeight;
    minimap.camera.near = 0.01;
    minimap.camera.far = Math.max(10, region.radius * 8.0);
    minimap.camera.position.copy(region.center).add(minimap.offset(region.radius));
    minimap.camera.up.set(0, 1, 0);
    minimap.camera.lookAt(region.center);
    minimap.camera.updateProjectionMatrix();
  }

  function resizeMinimaps() {
    state.minimaps.forEach((minimap) => {
      if (minimap.element.hidden) return;
      resizeMinimap(minimap);
    });
  }

  function renderMinimaps() {
    state.minimaps.forEach((minimap) => {
      if (minimap.element.hidden) return;
      minimap.renderer.render(minimap.scene, minimap.camera);
    });
  }

  function getRegionContactCounts(contactIndices) {
    const counts = Object.fromEntries(minimapConfigs.map(({ key }) => [key, 0]));
    if (!state.regions) return counts;
    for (const vertexIndex of contactIndices) {
      for (const { key } of minimapConfigs) {
        if (state.regions[key]?.mask[vertexIndex]) {
          counts[key] += 1;
        }
      }
    }
    return counts;
  }

  function ensureSequenceMinimapActivity(sequence) {
    if (sequence.visibleMinimapKeys) return;
    const totals = getRegionContactCounts(
      sequence.frames.flatMap((frame) => frame.contactIndices)
    );
    sequence.visibleMinimapKeys = minimapConfigs
      .map(({ key }) => key)
      .filter((key) => totals[key] > 0);
    if (!sequence.visibleMinimapKeys.length) {
      sequence.visibleMinimapKeys = ["feet"];
    }
  }

  function updateMinimapVisibility(sequence) {
    ensureSequenceMinimapActivity(sequence);
    const visibleKeys = new Set(sequence.visibleMinimapKeys);
    let visibleCount = 0;
    state.minimaps.forEach((minimap) => {
      const visible = visibleKeys.has(minimap.key);
      minimap.element.hidden = !visible;
      if (visible) {
        visibleCount += 1;
        minimap.caption.textContent = minimap.label;
        resizeMinimap(minimap);
      }
    });
    if (ui.minimapStack) {
      ui.minimapStack.hidden = visibleCount === 0;
    }
  }

  function updateMinimapState(frame, sequence) {
    ensureSequenceMinimapActivity(sequence);
    const visibleKeys = new Set(sequence.visibleMinimapKeys);
    const counts = getRegionContactCounts(frame.contactIndices);
    state.minimaps.forEach((minimap) => {
      if (!visibleKeys.has(minimap.key)) return;
      const count = counts[minimap.key];
      minimap.element.classList.toggle("is-active", count > 0);
      minimap.caption.textContent = count > 0 ? `${minimap.label} · ${count}` : minimap.label;
    });
  }

  function setupViewer(meshData) {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0xffffff);

    state.renderer = new THREE.WebGLRenderer({
      canvas: ui.canvas,
      antialias: true,
      alpha: false,
    });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;

    state.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(meshData.vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    state.regions = buildContactRegions(geometry.attributes.position.array);

    state.colorBuffer = new Float32Array(meshData.vertexCount * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(state.colorBuffer, 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    state.mesh = new THREE.Mesh(geometry, material);
    state.scene.add(state.mesh);

    const radius = geometry.boundingSphere?.radius || 1.2;
    const distance = Math.max(4.2, radius * 4.0);
    state.camera.position.set(0, 0.08, distance);
    state.camera.lookAt(0, 0, 0);

    state.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d8, 1.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(0.2, 0.8, 2.0);
    state.scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.45);
    rimLight.position.set(-1.8, 0.4, -1.4);
    state.scene.add(rimLight);

    state.controls = new OrbitControls(state.camera, ui.canvas);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.08;
    state.controls.enablePan = false;
    state.controls.zoomSpeed = 2.6;
    if ("zoomToCursor" in state.controls) {
      state.controls.zoomToCursor = true;
    }
    state.controls.autoRotate = true;
    state.controls.autoRotateSpeed = 1.4;
    state.controls.target.set(0, 0, 0);

    createMinimaps(geometry);
    window.addEventListener("resize", resizeViewer);
    resizeViewer();
    animate();
  }

  function resizeViewer() {
    if (!state.renderer || !state.camera) return;
    const box = ui.canvas.parentElement.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height, false);
    resizeMinimaps();
  }

  function animate() {
    requestAnimationFrame(animate);
    state.controls?.update();
    state.renderer?.render(state.scene, state.camera);
    renderMinimaps();
  }

  function setVertexColor(vertexIndex, color, alpha = 1) {
    const offset = vertexIndex * 3;
    if (offset < 0 || offset + 2 >= state.colorBuffer.length) return;
    const base = colors.base;
    state.colorBuffer[offset] = base[0] * (1 - alpha) + color[0] * alpha;
    state.colorBuffer[offset + 1] = base[1] * (1 - alpha) + color[1] * alpha;
    state.colorBuffer[offset + 2] = base[2] * (1 - alpha) + color[2] * alpha;
  }

  function applyContactFrame(frameIndex) {
    if (!state.mesh || !state.colorBuffer) return;
    const sequence = state.sequences[state.activeSequence];
    const frames = sequence.frames;
    const clampedIndex = Math.max(0, Math.min(frameIndex, frames.length - 1));
    state.activeFrame = clampedIndex;

    for (let i = 0; i < state.colorBuffer.length; i += 3) {
      state.colorBuffer[i] = colors.base[0];
      state.colorBuffer[i + 1] = colors.base[1];
      state.colorBuffer[i + 2] = colors.base[2];
    }

    const frame = frames[clampedIndex];
    for (const vertexIndex of frame.contactIndices) {
      setVertexColor(vertexIndex, colors.current, 1);
    }
    state.mesh.geometry.attributes.color.needsUpdate = true;
    updateMinimapState(frame, sequence);
    updateUi(frame, clampedIndex);
  }

  function updateUi(frame, frameIndex) {
    const sequence = state.sequences[state.activeSequence];
    ui.image.src = frame.imageElement?.src || frame.image;
    ui.image.alt = `${sequence.title} input frame ${frame.sourceFrame}`;
    ui.slider.value = String(frameIndex);
    ui.output.textContent = `Frame ${frameIndex + 1}/${sequence.frames.length} | ${frame.contactCount} contact vertices`;
  }

  function buildTabs() {
    ui.tabs.replaceChildren();

    const maxPage = Math.max(0, Math.ceil(state.sequences.length / state.pageSize) - 1);
    state.activePage = Math.max(
      0,
      Math.min(Math.floor(state.activeSequence / state.pageSize), maxPage)
    );
    const start = state.activePage * state.pageSize;
    const end = Math.min(start + state.pageSize, state.sequences.length);

    const previousPageButton = document.createElement("button");
    previousPageButton.type = "button";
    previousPageButton.className = "contact-page-arrow";
    previousPageButton.textContent = "‹";
    previousPageButton.disabled = state.activePage === 0;
    previousPageButton.setAttribute("aria-label", "Show previous contact sequence group");
    previousPageButton.addEventListener("click", () => {
      const page = Math.max(0, state.activePage - 1);
      selectSequence(page * state.pageSize);
    });

    const tabPage = document.createElement("div");
    tabPage.className = "contact-tab-page";

    const nextPageButton = document.createElement("button");
    nextPageButton.type = "button";
    nextPageButton.className = "contact-page-arrow";
    nextPageButton.textContent = "›";
    nextPageButton.disabled = state.activePage >= maxPage;
    nextPageButton.setAttribute("aria-label", "Show next contact sequence group");
    nextPageButton.addEventListener("click", () => {
      const page = Math.min(maxPage, state.activePage + 1);
      selectSequence(page * state.pageSize);
    });

    for (let index = start; index < end; index += 1) {
      const sequence = state.sequences[index];
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = sequence.title;
      button.className = index === state.activeSequence ? "is-active" : "";
      button.addEventListener("click", () => selectSequence(index));
      tabPage.append(button);
    }

    ui.tabs.append(previousPageButton, tabPage, nextPageButton);
  }

  function selectSequence(index) {
    stopPlayback();
    state.activeSequence = index;
    state.activeFrame = 0;
    const sequence = state.sequences[index];
    ui.play.disabled = true;
    ui.status.hidden = false;
    ui.status.textContent = `Loading ${sequence.title} contact frames...`;
    ui.slider.max = String(sequence.frames.length - 1);
    ui.slider.value = "0";
    buildTabs();
    updateMinimapVisibility(sequence);
    applyContactFrame(0);
    preloadFrameImages(sequence).then(() => {
      if (state.sequences[state.activeSequence] !== sequence) return;
      ui.play.disabled = false;
      ui.status.hidden = true;
    });
  }

  function stopPlayback() {
    state.playing = false;
    ui.play.textContent = "Play";
    if (state.playTimer) {
      window.clearInterval(state.playTimer);
      state.playTimer = 0;
    }
  }

  function startPlayback() {
    if (state.playing) return;
    state.playing = true;
    ui.play.textContent = "Pause";
    const sequence = state.sequences[state.activeSequence];
    applyContactFrame((state.activeFrame + 1) % sequence.frames.length);
    state.playTimer = window.setInterval(() => {
      const nextFrame = (state.activeFrame + 1) % sequence.frames.length;
      applyContactFrame(nextFrame);
    }, 180);
  }

  function setupEvents() {
    ui.slider.addEventListener("input", () => {
      stopPlayback();
      applyContactFrame(Number(ui.slider.value));
    });

    ui.play.addEventListener("click", () => {
      if (state.playing) {
        stopPlayback();
      } else {
        startPlayback();
      }
    });
  }

  function preloadFrameImages(sequence) {
    if (sequence.preloadPromise) return sequence.preloadPromise;
    const preloaders = [];
    for (const frame of sequence.frames) {
      const image = new Image();
      image.decoding = "async";
      image.src = frame.image;
      frame.imageElement = image;
      if (image.decode) {
        preloaders.push(image.decode().catch(() => undefined));
      } else {
        preloaders.push(
          new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          })
        );
      }
    }
    sequence.preloadPromise = Promise.all(preloaders);
    return sequence.preloadPromise;
  }

  async function main() {
    try {
      const [meshText, ...sequences] = await Promise.all([
        fetch(config.meshPath).then((response) => response.text()),
        ...config.sequences.map((sequence) =>
          fetch(sequence.path).then((response) => response.json())
        ),
      ]);
      state.sequences = sequences;
      setupViewer(parseObj(meshText));
      setupEvents();
      selectSequence(0);
    } catch (error) {
      console.error(error);
      ui.status.textContent = "Could not load temporal contact assets.";
    }
  }

  main();
}
