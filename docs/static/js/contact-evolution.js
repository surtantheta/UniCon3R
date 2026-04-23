import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const root = document.querySelector("[data-contact-evolution]");

if (root) {
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
    status: root.querySelector("[data-contact-status]"),
    slider: root.querySelector("[data-contact-slider]"),
    play: root.querySelector("[data-contact-play]"),
    output: root.querySelector("[data-contact-output]"),
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
    state.controls.autoRotate = true;
    state.controls.autoRotateSpeed = 0.7;
    state.controls.target.set(0, 0, 0);

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
  }

  function animate() {
    requestAnimationFrame(animate);
    state.controls?.update();
    state.renderer?.render(state.scene, state.camera);
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
    ui.slider.max = String(sequence.frames.length - 1);
    ui.slider.value = "0";
    buildTabs();
    applyContactFrame(0);
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

  function preloadFrameImages(sequences) {
    const preloaders = [];
    for (const sequence of sequences) {
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
    }
    return Promise.all(preloaders);
  }

  async function main() {
    try {
      const [meshText, ...sequences] = await Promise.all([
        fetch(config.meshPath).then((response) => response.text()),
        ...config.sequences.map((sequence) =>
          fetch(sequence.path).then((response) => response.json())
        ),
      ]);
      ui.status.textContent = "Preparing temporal contact playback...";
      await preloadFrameImages(sequences);
      state.sequences = sequences;
      setupViewer(parseObj(meshText));
      setupEvents();
      selectSequence(0);
      ui.play.disabled = false;
      ui.status.hidden = true;
    } catch (error) {
      console.error(error);
      ui.status.textContent = "Could not load temporal contact assets.";
    }
  }

  main();
}
