/**
 * Scène de base : rendu WebGL (ombres, tonalité), caméra, contrôles orbitaux, lumières, sol et
 * environnement. Gère aussi le rendu à la demande : l'image n'est redessinée que si quelque chose a
 * changé (`touch`) ; les ombres, statiques, ne sont recalculées que si la scène a changé, pas pour la
 * seule mésange (`touchFrame`). Une scène immobile ne coûte plus de GPU.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { SCENE_BG } from '@/constants';

import { onTextureReady } from './books';

/** Événements du canvas après lesquels l'image est redessinée. */
const INPUT_EVENTS = ['pointermove', 'pointerdown', 'pointerup', 'wheel'];

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  readonly controls: OrbitControls;
  readonly aniso: number;
  readonly sun: THREE.DirectionalLight;
  private readonly resizeObserver: ResizeObserver;
  private readonly stopTextureWatch: () => void;
  /** Rendu à la demande : une image est à redessiner. */
  private dirty = true;
  /** Les ombres (statiques) sont à recalculer. */
  private shadowDirty = true;
  readonly invalidate = (): void => this.touch();

  /** `transparent` : fond et sol invisibles (seules les ombres restent), pour la poser sur un autre décor. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly transparent: boolean,
  ) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false; // recalculées à la demande (voir `shadowDirty`)
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.autoClear = false;
    this.renderer = renderer;
    this.aniso = renderer.capabilities.getMaxAnisotropy();

    this.scene.background = transparent ? null : new THREE.Color(SCENE_BG);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const controls = new OrbitControls(this.camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI - 0.05; // peut descendre sous sa cible ; le sol est géré par la boucle
    controls.minDistance = 1;
    controls.maxDistance = 60;
    controls.zoomToCursor = true; // la molette zoome vers le point sous le curseur, pas vers le centre de la vue
    // souris : molette enfoncée = tourner autour de la bibliothèque, clic droit = déplacer la vue, molette =
    // zoomer ; le clic gauche reste réservé aux caisses et aux livres. Tactile : un doigt déplace, deux
    // doigts zooment (pas de rotation).
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls = controls;
    controls.addEventListener('change', this.invalidate);
    this.stopTextureWatch = onTextureReady(this.invalidate);
    for (const type of INPUT_EVENTS)
      canvas.addEventListener(type, this.invalidate, { passive: true });
    window.addEventListener('keydown', this.invalidate);

    // couche 1 : livre sorti, rendu par-dessus la scène
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8fa3b5, 0.35);
    hemi.layers.enable(1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.layers.enable(1);
    sun.position.set(10, 16, 8);
    sun.castShadow = false; // le léger s'affiche d'abord
    this.sun = sun;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.scene.add(this.buildGround());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
  }

  /** Une image est à redessiner, ombres comprises. */
  touch(): void {
    this.dirty = true;
    this.shadowDirty = true;
  }

  /** Une image est à redessiner, mais pas les ombres (la mésange seule ne les change pas). */
  touchFrame(): void {
    this.dirty = true;
  }

  /** Sol plat, uni. */
  private buildGround(): THREE.Mesh {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      this.transparent
        ? new THREE.ShadowMaterial({ opacity: 0.25 })
        : new THREE.MeshStandardMaterial({ color: 0xa9c29a, roughness: 1, envMapIntensity: 0.3 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    return ground;
  }

  resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.touch();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Premier rendu : compile les shaders et envoie les textures au GPU, puis dessine une image.
   * `done` est appelé ensuite (jamais si `isDisposed` est vrai).
   */
  warmUp(isDisposed: () => boolean, done: () => void): void {
    void this.renderer
      .compileAsync(this.scene, this.camera)
      .catch(() => undefined)
      .then(() => {
        if (isDisposed()) return;
        this.renderer.shadowMap.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
        this.renderer.getContext().finish();
        done();
      });
  }

  /** Redessine si quelque chose a changé ; `overlay` ajoute la seconde passe (livre sorti, couche 1). */
  draw(overlay: boolean): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.shadowMap.needsUpdate = this.shadowDirty;
    this.shadowDirty = false;
    this.renderer.clear();
    this.camera.layers.set(0);
    this.renderer.render(this.scene, this.camera);
    if (!overlay) return;
    // seconde passe : le livre sorti par-dessus tout (sans fond ni brouillard, qui forceraient un clear)
    const bg = this.scene.background;
    const fog = this.scene.fog;
    this.scene.background = null;
    this.scene.fog = null;
    this.renderer.clearDepth();
    this.camera.layers.set(1);
    this.renderer.render(this.scene, this.camera);
    this.camera.layers.set(0);
    this.scene.background = bg;
    this.scene.fog = fog;
  }

  dispose(): void {
    this.stopTextureWatch();
    for (const type of INPUT_EVENTS) this.canvas.removeEventListener(type, this.invalidate);
    window.removeEventListener('keydown', this.invalidate);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
