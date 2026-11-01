'use client';

/**
 * Three.js só é baixado quando existe algum objeto 3D na cena.
 * Antes ele entrava no pacote inicial do editor (~600 kB) e atrasava a abertura.
 */
type ThreeModule = typeof import('three');
let THREE: ThreeModule | null = null;
let pending: Promise<ThreeModule> | null = null;

/** Começa a carregar o Three.js em segundo plano. */
export function primeThree(): Promise<ThreeModule> {
  if (THREE) return Promise.resolve(THREE);
  if (!pending) {
    pending = import('three').then((mod) => {
      THREE = mod;
      pending = null;
      return mod;
    });
  }
  return pending;
}

export function threeReady() {
  return THREE !== null;
}

type Entry = {
  renderer: import('three').WebGLRenderer;
  scene: import('three').Scene;
  camera: import('three').PerspectiveCamera;
  mesh: import('three').Mesh;
  canvas: HTMLCanvasElement;
};

export class ThreePool {
  private entries = new Map<string, Entry>();

  get(shape: string, color: string): Entry | null {
    if (!THREE) {
      void primeThree();
      return null;
    }
    const key = `${shape}:${color}`;
    const existing = this.entries.get(key);
    if (existing) return existing;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(512, 512, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    let geometry: import('three').BufferGeometry;
    switch (shape) {
      case 'sphere':
        geometry = new THREE.SphereGeometry(1.2, 48, 48);
        break;
      case 'torus':
        geometry = new THREE.TorusGeometry(1.05, 0.4, 32, 96);
        break;
      case 'knot':
        geometry = new THREE.TorusKnotGeometry(0.95, 0.32, 128, 24);
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(2.2, 2.2);
        break;
      default:
        geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    }

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.45,
      roughness: 0.28,
      emissive: new THREE.Color(color).multiplyScalar(0.12),
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);
    const rim = new THREE.PointLight(0x6366f1, 22, 20);
    rim.position.set(-3, -2, 3);
    scene.add(rim);
    const fill = new THREE.PointLight(0x22d3ee, 14, 20);
    fill.position.set(3, -3, -2);
    scene.add(fill);

    const entry: Entry = { renderer, scene, camera, mesh, canvas };
    this.entries.set(key, entry);
    return entry;
  }

  render(shape: string, color: string, time: number, spin: number, rx: number, ry: number): HTMLCanvasElement | null {
    const entry = this.get(shape, color);
    if (!entry) return null;
    entry.mesh.rotation.x = rx + time * spin * 0.6;
    entry.mesh.rotation.y = ry + time * spin;
    entry.renderer.render(entry.scene, entry.camera);
    return entry.canvas;
  }

  dispose() {
    const module = THREE;
    this.entries.forEach((e) => {
      e.renderer.dispose();
      e.scene.traverse((o) => {
        if (module && o instanceof module.Mesh) {
          o.geometry.dispose();
          (o.material as import('three').Material).dispose();
        }
      });
    });
    this.entries.clear();
  }
}

export const threePool = new ThreePool();
