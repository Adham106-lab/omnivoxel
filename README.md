# omnivoxel

Deterministic modular hardware/computing compiler and verifier engine for reconfigurable voxelized hardware systems.

## Overview

`omnivoxel` treats physical, electromechanical, and computing modules as discrete 3D unit cells (voxels). It compiles declarative assembly specifications into a Unified Voxel IR, automatically infers mechanical, electrical (dual-plane bus), and thermal adjacency links, and validates assemblies against a 5-Gate Deterministic Verifier before physical fabrication or dynamic reconfiguration.

## Core Package (`@omnivoxel/core`)

### 1. Manifest Schema & Default Registry
Each voxel is specified by a `VoxelManifest` describing:
- **Mechanical:** Mass, dimensions, maximum vertical compression rating (e.g. 2243 N for VIK aluminum PCB cuboctahedron), connector types.
- **Electrical (Dual-Plane Bus):**
  - **Control Plane:** Low-speed telemetry & management (`i2c`, `can-fd`, etc.).
  - **High-Speed Plane:** High-bandwidth streaming & interconnect (`usb4`, `pcie`, `dp`, etc.).
  - **Dual-Rail Power:** Clean compute logic rail vs. isolated actuator power rail.
- **Thermal:** Thermal Design Power (TDP) generation and passive heatsink dissipation capacity.
- **Capabilities:** Functional tags (`graphics-rendering`, `display-output`, `battery-source`, `electromagnetic-actuation`, `gamepad-input`, `structural-support`).

#### Starter Manifests:
1. `vox.struct.alu-150`: Aluminum PCB structural frame (150mm), 2243 N compressive limit, 12W passive thermal heatsink dissipation, passive I2C pass-through routing.
2. `vox.actuated.em-60`: 60mm ElectroVoxel cube with 12 edge electromagnets for solid-state pivoting, drawing 15.1W peak on 12V isolated actuator rail.
3. `vox.compute.gpu-module`: High-performance compute/GPU SoM module, 35W TDP, USB4 / PCIe high-speed planes.
4. `vox.display.oled-6in`: 6-inch OLED touchscreen display voxel requiring continuous High-Speed Plane link to compute.
5. `vox.power.pd-100w`: Isolated dual-rail power delivery pack (65W compute rail + 60W actuator rail).
6. `vox.io.gamepad-ctrl`: I2C / CAN-FD gaming input controller voxel with thumbsticks and buttons.

### 2. Declarative DSL & Unified Voxel IR
Declarative layout specification syntax:
```dsl
assembly "Handheld-Console" {
  formFactor: "Handheld"
}

voxel gpu @ (0, 0, 0) {
  type: "vox.compute.gpu-module"
  role: "primary-compute"
}

voxel screen @ (0, 1, 0) {
  type: "vox.display.oled-6in"
  role: "main-display"
}

voxel battery @ (0, -1, 0) {
  type: "vox.power.pd-100w"
  role: "power-pack"
}

voxel heatsink @ (1, 0, 0) {
  type: "vox.struct.alu-150"
  role: "thermal-dissipation"
}
```

The parser constructs an AST and compiles it to `VoxelIR`, automatically detecting Manhattan distance-1 face adjacencies (`+x`, `-x`, `+y`, `-y`, `+z`, `-z`) to generate `VoxelLink` instances with:
- Mechanical connectivity.
- Control Plane routing and distance calculation.
- High-Speed Plane routing and protocol negotiation.
- Thermal conductive coupling.

### 3. 5-Gate Deterministic Verifier
- **Gate 1 (Spatial & Topology):** Detects spatial coordinate overlaps and ensures single connected component graph.
- **Gate 2 (Dual-Plane Bus):** Verifies continuous high-speed paths between compute and display voxels; verifies I2C total span does not exceed 1.0 m without CAN-FD / active repeaters.
- **Gate 3 (Power & Isolation):** Checks compute and actuator power budgets; enforces galvanic isolation between noisy inductive actuators and compute logic.
- **Gate 4 (Thermal Budget):** Verifies that connected structural heatsinks (`vox.struct.alu-150`) dissipate more heat than the total cluster TDP.
- **Gate 5 (Static Mechanical Load):** Verifies vertical column compressive forces do not exceed base voxel compression limits ($F_{\text{comp}} \le F_{\text{max}}$).

## Running Tests

```bash
pnpm test
```
