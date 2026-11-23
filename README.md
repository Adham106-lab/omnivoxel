# omnivoxel

Deterministic modular hardware/computing compiler and verifier engine for reconfigurable voxelized hardware systems.

## Overview

`omnivoxel` treats physical, electromechanical, and computing modules as discrete 3D unit cells (voxels). It compiles declarative assembly specifications into a Unified Voxel IR, automatically infers mechanical, electrical (dual-plane bus), and thermal adjacency links, and validates assemblies against a 5-Gate Deterministic Verifier before physical fabrication or dynamic reconfiguration.

## Unified ARM Modular Ecosystem & Storage Architecture

`omnivoxel` models a unified **ARM64 modular hardware ecosystem** where the same energy-efficient ARM compute architecture scales seamlessly across form factors — from a standalone Phone to a docked Laptop and a multi-node Desktop / PC Workstation:

- **Dedicated Phone Storage (`vox.device.phone-core`):** Integrates a low-power ARM64 SoC, internal mobile battery, and **256 GB private onboard UFS storage**. When undocked from the lattice, the Phone Core operates completely standalone with its own OS and personal data without depending on external lattice storage.
- **Modular External NVMe Storage (`vox.storage.nvme-bay`):** Hot-swappable **2 TB NVMe storage bay** (`storage` category) enclosed in a passive aluminum thermal caddy. Expands capacity for Laptops, PC Workstations, and docked Phones, and requires an active **High-Speed Plane (PCIe / USB4)** path to a `compute` or `phone-core` host.
- **Scalable ARM Compute (`vox.compute.arm-soc`):** Low-TDP (10W) ARM64 compute voxel exposing dual Control Plane (I2C) and High-Speed Plane (PCIe / USB4) lanes on all mating faces — deploy one tile for a passive laptop boost or cluster multiple tiles with aluminum heatsink towers (`vox.struct.alu-150`) for a PC workstation.

## Core Package (`@omnivoxel/core`)

### 1. Manifest Schema & Default Registry
Each voxel is specified by a `VoxelManifest` describing:
- **Mechanical:** Mass, dimensions, maximum vertical compression rating (e.g. 2243 N for VIK aluminum PCB cuboctahedron), connector types.
- **Electrical (Dual-Plane Bus):**
  - **Control Plane:** Low-speed telemetry & management (`i2c`, `can-fd`, etc.).
  - **High-Speed Plane:** High-bandwidth streaming & storage/device interconnect (`usb4`, `pcie`, `dp`, etc.).
  - **Dual-Rail Power:** Clean compute logic rail vs. isolated actuator power rail.
- **Thermal:** Thermal Design Power (TDP) generation and passive heatsink dissipation capacity.
- **Storage (Optional):** Dedicated private onboard storage (`scope: 'dedicated'`) vs. hot-swappable modular external storage (`scope: 'modular'`, `requiresHostHighSpeedLink: true`).
- **Capabilities:** Functional tags (`arm64-compute`, `standalone-phone`, `dedicated-private-storage`, `nvme-storage`, `hot-swappable`, `graphics-rendering`, `display-output`, `power-provider`, `electromagnetic-pivoting`, `gamepad-input`, `structural-frame`).

#### Built-in Starter Manifests (`createDefaultRegistry()`):
1. `vox.struct.alu-150` (`structural`): Aluminum PCB structural frame (150mm), 2243 N compressive limit, 12W passive thermal heatsink dissipation, passive I2C pass-through routing.
2. `vox.actuated.em-60` (`actuated`): 60mm ElectroVoxel cube with 12 edge electromagnets for solid-state pivoting, drawing 15.1W peak on 12V isolated actuator rail.
3. `vox.compute.gpu-module` (`compute`): High-performance compute/GPU SoM module, 35W TDP, USB4 / PCIe high-speed planes.
4. `vox.display.oled-6in` (`display`): 6-inch OLED touchscreen display voxel requiring continuous High-Speed Plane link to compute.
5. `vox.power.pd-100w` (`power`): Isolated dual-rail power delivery pack (65W compute rail + 60W actuator rail).
6. `vox.io.gamepad-ctrl` (`io`): I2C / CAN-FD gaming & peripheral input controller voxel.
7. `vox.compute.arm-soc` (`compute`): Unified 10W ARM64 compute SoC module with PCIe/USB4 High-Speed Plane and I2C Control Plane across all mating faces.
8. `vox.device.phone-core` (`compute`): Standalone-capable modular ARM64 Phone Core with 256 GB dedicated private onboard UFS storage, 15W internal battery rail, passive 6W vapor-chamber dissipation, and USB4 host lanes.
9. `vox.storage.nvme-bay` (`storage`): Hot-swappable 2 TB modular NVMe storage bay (4W TDP, 4.5W passive aluminum caddy) requiring a High-Speed Plane (PCIe/USB4) path to a compute or phone-core host.

### 2. Declarative DSL & Unified Voxel IR
Declarative layout specification syntax:
```dsl
assembly "OmniVoxel-ARM-Book" {
  formFactor: "ARM Modular Laptop"
  architecture: "Phone-Docked Unified ARM64 Lattice"
}

voxel phone_core @ (0, 0, 0) {
  type: "vox.device.phone-core"
  role: "primary-arm-host"
}

voxel arm_soc @ (1, 0, 0) {
  type: "vox.compute.arm-soc"
  role: "arm-compute-booster"
}

voxel display @ (0, 1, 0) {
  type: "vox.display.oled-6in"
  role: "laptop-display"
}

voxel nvme_storage @ (1, 1, 0) {
  type: "vox.storage.nvme-bay"
  role: "modular-nvme-drive"
}

voxel battery @ (0, -1, 0) {
  type: "vox.power.pd-100w"
  role: "laptop-battery"
}

voxel chassis_sink @ (-1, 0, 0) {
  type: "vox.struct.alu-150"
  role: "passive-thermal-chassis"
}
```

The parser constructs an AST and compiles it to `VoxelIR`, automatically detecting Manhattan distance-1 face adjacencies (`+x`, `-x`, `+y`, `-y`, `+z`, `-z`) to generate `VoxelLink` instances (mechanical, Control Plane, High-Speed Plane, thermal) and `AssemblyMetrics` (mass, power, thermal, and `dedicatedStorageGb` / `modularStorageGb` / `totalStorageGb`).

### 3. 5-Gate Deterministic Verifier
- **Gate 1 (Spatial & Connectivity):** Detects spatial coordinate overlaps, ensures a single connected mechanical graph, and validates scanned room bounds, obstacle collisions, and clearances.
- **Gate 2 (Dual-Plane Bus):**
  - Verifies continuous High-Speed Plane paths between `compute` / `phone-core` hosts and `display` voxels.
  - Verifies every modular `storage` module (`vox.storage.nvme-bay`) has an active High-Speed Plane (PCIe/USB4) path to at least one `compute` or `phone-core` host (failing with actionable fixes if Control-Plane-only or disconnected).
  - Confirms `vox.device.phone-core` standalone storage readiness via its private onboard storage, and reports expanded capacity when docked with modular NVMe storage.
  - Warns if I2C Control Plane span exceeds 1.0 m without CAN-FD / active repeaters.
- **Gate 3 (Power & Rail Isolation):** Checks compute and actuator power budgets (including `vox.device.phone-core`'s internal mobile rail) and enforces galvanic isolation between noisy inductive actuators and compute logic.
- **Gate 4 (Thermal Budget):** Verifies that connected passive heatsinks (`vox.struct.alu-150` and module casings) dissipate at least the total thermal cluster TDP.
- **Gate 5 (Static Mechanical Load):** Verifies vertical column compressive forces do not exceed base voxel compression limits ($F_{\text{comp}} \le F_{\text{max}}$).

### 4. Built-in Gallery Presets (`GALLERY_ITEMS`)
- **Device Assemblies:**
  - `handheld-gaming-console`: Handheld Gaming Console (OmniVoxel Deck)
  - `modular-laptop`: Modular Laptop Workstation
  - `arm-modular-phone`: Modular ARM Phone (Standalone + Docked Storage)
  - `arm-modular-laptop`: ARM Modular Laptop (Phone Core + ARM SoC + Display + Battery + IO + 2 TB NVMe Bay)
- **Room & Furniture Setups:**
  - `desk-workstation`: Desk Workstation Setup
  - `living-room-unit`: Living Room Entertainment Unit
  - `arm-pc-workstation`: ARM Desktop / PC Workstation (Dual ARM SoC Cluster + Dual 2 TB NVMe Array + Dual Displays + Heatsink Towers)
- **Structural & Architectural Lattices (`category: 'structural'`):**
  - `voxel-chair`: Modular Voxel Chair (12-voxel reconfigurable cuboctahedron lattice)
  - `voxel-table`: Modular Voxel Table (12-voxel clear-span tabletop & corner legs)
  - `voxel-couch`: Modular Voxel Couch / Sofa (12-voxel sofa with armrests & backrest)
  - `voxel-bridge`: Modular Voxel Bridge (10-voxel twin-pier Pratt/arch truss span)

## Running Tests

```bash
pnpm vitest run
pnpm --filter @omnivoxel/web build
```

## Workbench interactions (apps/web)

- **Open Cuboctahedron Truss Geometry & `Physics` FEA View Mode** – switch to the **Physics** tab alongside `Assembly`, `Thermal`, and `Bus` to render every voxel as an open cellular metamaterial **cuboctahedron / octahedral truss lattice** colored by deterministic von Mises mechanical load distribution (cool blue → cyan → green → amber → red). A live **Simulation Results Summary** overlay displays **Max Displacement (mm)**, **Max Stress (MPa)**, and **Safety Factor (×)** derived from Gate 5 and static truss load routing.
- **Realistic per-module 3D silhouettes** – in `Assembly` mode every module renders a distinct engineering form factor strictly inside its lattice cell bounds (zero clipping, crisp grid alignment):
  - *Structural Lattice (`structural` / `vox.struct.alu-150`)*: open machined-aluminum cuboctahedron space-frame truss with anodized face-center mating rings.
  - *ARM Phone Core (`vox.device.phone-core`)*: slim chamfered titanium smartphone slab with recessed OLED UI glass, camera/sensor notch, side buttons, and a rear magnetic docking plate bridging cleanly to lattice connectors.
  - *OLED Display (`display`)*: thin frameless upright OLED monitor panel with recessed glass screen and rear magnetic docking hub.
  - *Modular NVMe Storage (`storage` / `vox.storage.nvme-bay`)*: hot-swappable NVMe drive-bay cartridge with recessed side guide rails, sculpted aluminum heat-spreader fins, cyan pull-tab latch, rear PCIe/USB4 gold connector, and an emissive mounted High-Speed Bus LED.
  - *ARM & GPU Compute (`compute`)*: open-sided machined aluminum exoskeleton exposing the internal PCB, brushed-nickel ARM SoC / GPU IHS die block, copper heatpipes, and recessed aluminum heatsink fin stacks.
  - *Actuated Pivot (`actuated`)*: open-frame ElectroVoxel skeletal cube with 8 corner connector blocks, 12 copper edge electromagnets, internal electronics deck, and a visible amber pivot collar.
  - *Power (`power`)* & *IO (`io`)*: chamfered LiFePO4 battery pack with 4-segment charge bar and heavy terminals, and slim ergonomic control/port deck with 3D thumbsticks, D-pad, and USB-C ports.
- **Interactive Radial Menu** – right-click any voxel in the 3D viewport (or click **Radial** on the selection chip) to open a viewport-clamped circular radial menu with **+ Neighbor** (attach a connected voxel on an open face), **Swap Type** (6-module outer arc: Truss, Pivot, ARM SoC, OLED, NVMe, Power), and **Delete** (detaches the voxel with visible joint unlatch animation). Every action updates the DSL, recompiles, and re-runs all 5 verification gates immediately.
- **Live Furniture Morph Reconfiguration (`Chair ↔ Table ↔ Couch`)** – when viewing any of the 12-voxel modular furniture presets, use the **Morph** control strip in the viewport overlay to animate voxels detaching, traversing across the lattice surface, and executing 90° corner-edge **Pivoting** moves directly into the target furniture shape.
- **DSL quick-insert chips & interactive moves** – insert `+ ARM SoC`, `+ Phone`, `+ NVMe`, `+ GPU`, `+ OLED`, `+ Battery`, or `+ Heatsink` directly adjacent to the active assembly, or select any voxel and drag an axis arrow / press ←→↑↓ PgUp/PgDn to move cell-by-cell with live joint latch/unlatch animations.
- **Connected Launch Rail & continuous assembly playback** – the *Assembly Container* opens through a machined `+X` portal onto a physical **Launch Rail / Docking Bridge** aligned directly with the lattice entry point. Modules glide out along the rail at floor height, traverse step-by-step across the placed lattice surface (`Launch → Travel / Pivot → Catch`) with dual-polarity hinge fulcrum indicators, and seat via 90° corner-edge pivoting or coaxial guided docking.


