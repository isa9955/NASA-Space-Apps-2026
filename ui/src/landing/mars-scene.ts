import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  CircleGeometry,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'

export interface MarsSceneOptions {
  textureUrl: string
  /** Grayscale relief map; gives craters and canyons depth under the sunlight. */
  bumpUrl: string
  /** Direction the sunlight travels *from*, in camera space. */
  lightDirection: [number, number, number]
  /** Longitude (°E) initially facing the camera. */
  startLongitude: number
  /** Tilt of the north pole toward the camera, in degrees. */
  viewTilt: number
  /** Rotation speed in degrees per second. */
  degreesPerSecond: number
  marker?: { latitude: number; longitude: number }
}

export interface MarsScene {
  render: (deltaSeconds: number) => void
  resize: (width: number, height: number) => void
  dispose: () => void
}

const MARS_AXIAL_TILT = MathUtils.degToRad(25.19)
const CAMERA_DISTANCE = 6.3
const TERRACOTTA = 0xc86b4e

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosphereFragment = /* glsl */ `
  uniform vec3 uSun;
  varying vec3 vNormal;
  void main() {
    float rim = pow(max(0.0, 0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.2);
    float lit = smoothstep(-0.25, 0.65, dot(vNormal, uSun));
    vec3 dust = vec3(0.86, 0.62, 0.47);
    gl_FragColor = vec4(dust, rim * lit * 0.55);
  }
`

function latLonToDirection(latitude: number, longitude: number) {
  const lat = MathUtils.degToRad(latitude)
  const lon = MathUtils.degToRad(longitude)
  // Matches three.js SphereGeometry's equirectangular UV layout (lon 0 at +x).
  return new Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.sin(lon),
  ).normalize()
}

function createMarker(latitude: number, longitude: number) {
  const group = new Group()
  const material = new MeshBasicMaterial({
    color: TERRACOTTA,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  })
  const faint = material.clone()
  faint.opacity = 0.4

  group.add(new Mesh(new CircleGeometry(0.01, 24), material))
  group.add(new Mesh(new RingGeometry(0.045, 0.051, 64), material))
  group.add(new Mesh(new RingGeometry(0.095, 0.098, 64), faint))

  const direction = latLonToDirection(latitude, longitude)
  group.position.copy(direction).multiplyScalar(1.004)
  group.quaternion.copy(
    new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), direction),
  )
  return group
}

export async function createMarsScene(
  canvas: HTMLCanvasElement,
  options: MarsSceneOptions,
): Promise<MarsScene> {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0x000000, 0)

  const loader = new TextureLoader()
  const textures = await Promise.allSettled([
    loader.loadAsync(options.textureUrl),
    loader.loadAsync(options.bumpUrl),
  ])
  const [colorResult, bumpResult] = textures
  if (colorResult.status === 'rejected' || bumpResult.status === 'rejected') {
    for (const result of textures) {
      if (result.status === 'fulfilled') result.value.dispose()
    }
    renderer.dispose()
    throw new Error('Mars textures could not be loaded')
  }
  const texture = colorResult.value
  const bumpTexture = bumpResult.value
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy())
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = anisotropy
  bumpTexture.anisotropy = anisotropy

  const scene = new Scene()
  const camera = new PerspectiveCamera(20, 1, 0.1, 50)
  camera.position.set(0, 0, CAMERA_DISTANCE)

  const sun = new Vector3(...options.lightDirection).normalize()
  const sunLight = new DirectionalLight(0xfff1e2, 3.4)
  sunLight.position.copy(sun).multiplyScalar(10)
  scene.add(sunLight)
  scene.add(new AmbientLight(0x1a2030, 0.35))

  const tilt = new Group()
  tilt.rotation.set(MathUtils.degToRad(options.viewTilt), 0, MARS_AXIAL_TILT)
  scene.add(tilt)

  const planetGeometry = new SphereGeometry(1, 128, 96)
  const planetMaterial = new MeshStandardMaterial({
    map: texture,
    bumpMap: bumpTexture,
    bumpScale: 1.6,
    roughness: 1,
    metalness: 0,
  })
  const planet = new Mesh(planetGeometry, planetMaterial)
  planet.rotation.y = -Math.PI / 2 - MathUtils.degToRad(options.startLongitude)
  tilt.add(planet)

  if (options.marker) {
    planet.add(createMarker(options.marker.latitude, options.marker.longitude))
  }

  const atmosphereGeometry = new SphereGeometry(1.025, 96, 64)
  const atmosphereMaterial = new ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    uniforms: { uSun: { value: sun } },
    side: BackSide,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  scene.add(new Mesh(atmosphereGeometry, atmosphereMaterial))

  const radiansPerSecond = MathUtils.degToRad(options.degreesPerSecond)

  return {
    render(deltaSeconds) {
      planet.rotation.y += radiansPerSecond * deltaSeconds
      renderer.render(scene, camera)
    },
    resize(width, height) {
      if (width === 0 || height === 0) return
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    },
    dispose() {
      planetGeometry.dispose()
      planetMaterial.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      texture.dispose()
      bumpTexture.dispose()
      scene.traverse((object) => {
        if (object instanceof Mesh && object.parent === planet) {
          object.geometry.dispose()
          ;(object.material as MeshBasicMaterial).dispose()
        }
      })
      renderer.dispose()
    },
  }
}
