import { mat4, vec4 } from "gl-matrix"
import type { Camera } from "../camera/buildCamera"
import type { SoftwareRenderer } from "./SoftwareRenderer"
import { srgbEncodeLinear01 } from "../utils/srgbEncodeLinear01"
import { clamp } from "../utils/clamp"

/**
 * Calculate grid line intensity at world position.
 * Returns value from 0 (no line) to 1 (on line).
 */
function computeGridLineIntensity(params: {
  world_x: number
  world_z: number
  cell_size: number
  dist: number
  screen_width: number
  screen_height: number
  line_thickness_multiplier: number
}): number {
  const rx = params.world_x / params.cell_size
  const rz = params.world_z / params.cell_size

  // fract(r - 0.5) - 0.5 gives us distance from grid line
  const fract_x = rx - Math.floor(rx + 0.5)
  const fract_z = rz - Math.floor(rz + 0.5)
  const grid_x = Math.abs(fract_x)
  const grid_z = Math.abs(fract_z)

  // Approximate fwidth as derivative - scale based on distance and screen resolution
  // This makes lines thinner when far away, thicker when close
  const pixel_size_in_world =
    params.dist / Math.min(params.screen_width, params.screen_height)
  const fwidth_x = pixel_size_in_world / params.cell_size
  const fwidth_z = pixel_size_in_world / params.cell_size

  const line_x = grid_x / (fwidth_x + 0.0001)
  const line_z = grid_z / (fwidth_z + 0.0001)
  const line = Math.min(line_x, line_z)

  // Adjust line thickness - lower multiplier = thicker lines
  return 1.0 - Math.min(line * params.line_thickness_multiplier, 1.0)
}

/**
 * Calculate fade alpha based on distance from camera
 */
function computeGridFadeAlpha(params: {
  dist: number
  fade_distance: number
  fade_strength: number
}): number {
  const fade_start = params.fade_distance
  const fade_end = params.fade_distance * params.fade_strength
  return (
    1.0 -
    Math.min(
      1.0,
      Math.max(0.0, (params.dist - fade_start) / (fade_end - fade_start)),
    )
  )
}

/**
 * Draws an infinite grid with fade-out effect matching 3d-viewer appearance
 */
export function drawInfiniteGrid(
  software_renderer: SoftwareRenderer,
  params: {
    camera: Camera
    cell_size?: number
    section_size?: number
    fade_distance?: number
    fade_strength?: number
    grid_color?: readonly [number, number, number]
    section_color?: readonly [number, number, number]
    gamma_out?: boolean
  },
) {
  const cell_size = params.cell_size ?? 1
  const section_size = params.section_size ?? 10
  const fade_distance = params.fade_distance ?? 100
  const fade_strength = params.fade_strength ?? 1.5
  const grid_color = params.grid_color ?? [0.93, 0.93, 0.93]
  const section_color = params.section_color ?? [0.8, 0.8, 1.0]
  const gamma_out = params.gamma_out ?? true
  const camera = params.camera
  const view = camera.view
  const proj = camera.proj

  // Get camera position from inverse view matrix
  const inv_view = mat4.create()
  mat4.invert(inv_view, view)
  const cam_pos_x = inv_view[12]
  const cam_pos_y = inv_view[13]
  const cam_pos_z = inv_view[14]

  // Combined view-projection matrix
  const vp = mat4.create()
  mat4.multiply(vp, proj, view)
  const inv_vp = mat4.create()
  mat4.invert(inv_vp, vp)

  // For each pixel, ray-cast to find grid intersection
  for (let y = 0; y < software_renderer.height; y++) {
    for (let x = 0; x < software_renderer.width; x++) {
      // NDC coordinates
      const ndc_x = (x / (software_renderer.width - 1)) * 2 - 1
      const ndc_y = 1 - (y / (software_renderer.height - 1)) * 2

      // Ray direction in world space
      const near_point = vec4.fromValues(ndc_x, ndc_y, -1, 1)
      const far_point = vec4.fromValues(ndc_x, ndc_y, 1, 1)

      vec4.transformMat4(near_point, near_point, inv_vp)
      vec4.transformMat4(far_point, far_point, inv_vp)

      // Perspective division
      near_point[0] /= near_point[3]
      near_point[1] /= near_point[3]
      near_point[2] /= near_point[3]
      far_point[0] /= far_point[3]
      far_point[1] /= far_point[3]
      far_point[2] /= far_point[3]

      // Ray from near to far
      const ray_dir_x = far_point[0] - near_point[0]
      const ray_dir_y = far_point[1] - near_point[1]
      const ray_dir_z = far_point[2] - near_point[2]

      // Intersect ray with y=0 plane
      // rayOrigin + t * rayDir = (x, 0, z)
      // near_point[1] + t * ray_dir_y = 0
      if (Math.abs(ray_dir_y) < 1e-6) continue // Ray parallel to plane

      const t = -near_point[1] / ray_dir_y
      if (t < 0 || t > 1) continue // Intersection behind camera or too far

      const world_x = near_point[0] + t * ray_dir_x
      const world_z = near_point[2] + t * ray_dir_z

      // Distance from camera to intersection point (in XZ plane)
      const dx = world_x - cam_pos_x
      const dz = world_z - cam_pos_z
      const dist = Math.sqrt(dx * dx + dz * dz)

      // Fade calculation
      const alpha = computeGridFadeAlpha({
        dist,
        fade_distance,
        fade_strength,
      })

      if (alpha <= 0.0) continue

      // Calculate grid line intensities
      // Cell grid uses thinner lines (higher multiplier = thinner)
      const g1 = computeGridLineIntensity({
        world_x,
        world_z,
        cell_size,
        dist,
        screen_width: software_renderer.width,
        screen_height: software_renderer.height,
        line_thickness_multiplier: 0.8,
      })

      // Section grid uses thicker lines (lower multiplier = thicker)
      const g2 = computeGridLineIntensity({
        world_x,
        world_z,
        cell_size: section_size,
        dist,
        screen_width: software_renderer.width,
        screen_height: software_renderer.height,
        line_thickness_multiplier: 0.5, // Thicker section lines
      })

      const grid_strength = Math.max(g1, g2)
      if (grid_strength <= 0.0) continue

      // Mix colors exactly like shader: mix(grid_color, section_color, g2)
      const final_r = grid_color[0] * (1.0 - g2) + section_color[0] * g2
      const final_g = grid_color[1] * (1.0 - g2) + section_color[1] * g2
      const final_b = grid_color[2] * (1.0 - g2) + section_color[2] * g2

      const final_alpha = grid_strength * alpha

      if (final_alpha <= 0.01) continue

      // Apply gamma correction
      let out_r = final_r
      let out_g = final_g
      let out_b = final_b

      if (gamma_out) {
        out_r = srgbEncodeLinear01(clamp(out_r, 0, 1))
        out_g = srgbEncodeLinear01(clamp(out_g, 0, 1))
        out_b = srgbEncodeLinear01(clamp(out_b, 0, 1))
      } else {
        out_r = clamp(out_r, 0, 1)
        out_g = clamp(out_g, 0, 1)
        out_b = clamp(out_b, 0, 1)
      }

      // Alpha blend with existing pixel
      const dst_idx = (y * software_renderer.width + x) * 4
      const dst_r = (software_renderer.buffer[dst_idx + 0] ?? 0) / 255
      const dst_g = (software_renderer.buffer[dst_idx + 1] ?? 0) / 255
      const dst_b = (software_renderer.buffer[dst_idx + 2] ?? 0) / 255
      const dst_a = (software_renderer.buffer[dst_idx + 3] ?? 0) / 255

      const one_minus_a = 1 - final_alpha
      const blend_r = out_r * final_alpha + dst_r * one_minus_a
      const blend_g = out_g * final_alpha + dst_g * one_minus_a
      const blend_b = out_b * final_alpha + dst_b * one_minus_a
      const blend_a = final_alpha + dst_a * one_minus_a

      software_renderer.setPixel(
        x,
        y,
        (clamp(blend_r, 0, 1) * 255) | 0,
        (clamp(blend_g, 0, 1) * 255) | 0,
        (clamp(blend_b, 0, 1) * 255) | 0,
        (clamp(blend_a, 0, 1) * 255) | 0,
      )
    }
  }
}
