const CONTAINERS = {
  "20ft": { name: "20 FT Container", length: 590, width: 235, height: 239, payload: 28200 },
  "40ft": { name: "40 FT Container", length: 1203, width: 235, height: 239, payload: 26700 },
  "40hq": { name: "40 HQ Container", length: 1203, width: 235, height: 267, payload: 26500 },
  "45hq": { name: "45 HQ Container", length: 1356, width: 235, height: 267, payload: 27600 },
};

const COLORS = ["#0f766e", "#2563eb", "#b45309", "#6d28d9", "#15803d", "#be123c", "#0369a1", "#854d0e"];
const MAX_RENDERED_BOXES = 1400;

const state = {
  nextPacketId: 1,
  activePacketId: null,
  showUsableBox: true,
  showFullCapacity: false,
  cameraAngleX: -0.75,
  cameraAngleY: 0.85,
  cameraDistance: 15,
  placements: [],
  analysis: null,
  sceneReady: false,
};

const els = {
  statusLabel: document.querySelector("#statusLabel"),
  statusValue: document.querySelector("#statusValue"),
  containerType: document.querySelector("#containerType"),
  containerLength: document.querySelector("#containerLength"),
  containerWidth: document.querySelector("#containerWidth"),
  containerHeight: document.querySelector("#containerHeight"),
  containerPayload: document.querySelector("#containerPayload"),
  margin: document.querySelector("#margin"),
  marginLabel: document.querySelector("#marginLabel"),
  packetRows: document.querySelector("#packetRows"),
  packetTemplate: document.querySelector("#packetTemplate"),
  addPacketBtn: document.querySelector("#addPacketBtn"),
  loadability: document.querySelector("#loadability"),
  loadabilityNote: document.querySelector("#loadabilityNote"),
  containerCbm: document.querySelector("#containerCbm"),
  containerCbmNote: document.querySelector("#containerCbmNote"),
  loadedCbm: document.querySelector("#loadedCbm"),
  loadedCbmNote: document.querySelector("#loadedCbmNote"),
  placedUnits: document.querySelector("#placedUnits"),
  placedNote: document.querySelector("#placedNote"),
  efficiency: document.querySelector("#efficiency"),
  efficiencyNote: document.querySelector("#efficiencyNote"),
  threeMount: document.querySelector("#threeMount"),
  threeMessage: document.querySelector("#threeMessage"),
  resetViewBtn: document.querySelector("#resetViewBtn"),
  toggleWireBtn: document.querySelector("#toggleWireBtn"),
  toggleCapacityBtn: document.querySelector("#toggleCapacityBtn"),
  legend: document.querySelector("#legend"),
  coachList: document.querySelector("#coachList"),
  activePacket: document.querySelector("#activePacket"),
  orientationBody: document.querySelector("#orientationBody"),
  planBody: document.querySelector("#planBody"),
  exportBtn: document.querySelector("#exportBtn"),
};

const three = {
  renderer: null,
  scene: null,
  camera: null,
  root: null,
  boxGroup: null,
  containerGroup: null,
};

function value(input, fallback = 0) {
  const parsed = Number.parseFloat(input.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(input, fallback = 0) {
  const parsed = Number.parseInt(input.value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmt(number, digits = 0) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(number || 0);
}

function pct(used, total) {
  return total > 0 ? (used / total) * 100 : 0;
}

function volumeOf(dim) {
  return (dim.length * dim.width * dim.height) / 1000000;
}

function setStatus(label, text) {
  els.statusLabel.textContent = label;
  els.statusValue.textContent = text;
}

function setContainer(type) {
  const preset = CONTAINERS[type] || CONTAINERS["20ft"];
  els.containerType.value = type;
  els.containerLength.value = preset.length;
  els.containerWidth.value = preset.width;
  els.containerHeight.value = preset.height;
  els.containerPayload.value = preset.payload;
}

function readContainer() {
  const margin = value(els.margin);
  const raw = {
    length: value(els.containerLength),
    width: value(els.containerWidth),
    height: value(els.containerHeight),
    payload: value(els.containerPayload),
  };
  const factor = Math.max(0.01, 1 - margin / 100);
  return {
    raw,
    usable: {
      length: raw.length * factor,
      width: raw.width * factor,
      height: raw.height * factor,
      payload: raw.payload,
    },
    margin,
  };
}

function createPacket(data = {}) {
  const node = els.packetTemplate.content.firstElementChild.cloneNode(true);
  const id = String(state.nextPacketId++);
  node.dataset.id = id;
  node.querySelector(".packet-name").value = data.name || `Packet ${id}`;
  node.querySelector(".packet-length").value = data.length ?? 56;
  node.querySelector(".packet-width").value = data.width ?? 34;
  node.querySelector(".packet-height").value = data.height ?? 46.5;
  node.querySelector(".packet-qty").value = data.qty ?? 25;
  node.querySelector(".packet-weight").value = data.weight ?? 1;
  node.querySelector(".packet-rotate").checked = data.rotate ?? true;
  node.querySelector(".packet-flip").checked = data.flip ?? false;
  node.querySelector(".remove-btn").addEventListener("click", () => {
    node.remove();
    if (!els.packetRows.children.length) createPacket();
    update();
  });
  node.querySelectorAll("input").forEach((input) => input.addEventListener("input", update));
  node.addEventListener("click", () => {
    state.activePacketId = id;
    syncActiveSelect();
    update();
  });
  els.packetRows.appendChild(node);
  state.activePacketId = state.activePacketId || id;
}

function readPackets() {
  return [...els.packetRows.querySelectorAll(".packet-row")]
    .map((row, index) => ({
      id: row.dataset.id,
      name: row.querySelector(".packet-name").value.trim() || `Packet ${index + 1}`,
      length: value(row.querySelector(".packet-length")),
      width: value(row.querySelector(".packet-width")),
      height: value(row.querySelector(".packet-height")),
      qty: intValue(row.querySelector(".packet-qty")),
      weight: value(row.querySelector(".packet-weight")),
      rotate: row.querySelector(".packet-rotate").checked,
      flip: row.querySelector(".packet-flip").checked,
      color: COLORS[index % COLORS.length],
    }))
    .filter((packet) => packet.length > 0 && packet.width > 0 && packet.height > 0 && packet.qty > 0);
}

function syncActiveSelect() {
  const packets = readPackets();
  if (!packets.some((packet) => packet.id === state.activePacketId)) {
    state.activePacketId = packets[0]?.id || null;
  }
  els.activePacket.innerHTML = "";
  packets.forEach((packet) => {
    const option = document.createElement("option");
    option.value = packet.id;
    option.textContent = packet.name;
    option.selected = packet.id === state.activePacketId;
    els.activePacket.appendChild(option);
  });
}

function uniqueOrientations(packet) {
  const base = [];
  if (packet.flip) {
    const dims = [packet.length, packet.width, packet.height];
    const permutations = [
      [dims[0], dims[1], dims[2]],
      [dims[0], dims[2], dims[1]],
      [dims[1], dims[0], dims[2]],
      [dims[1], dims[2], dims[0]],
      [dims[2], dims[0], dims[1]],
      [dims[2], dims[1], dims[0]],
    ];
    permutations.forEach(([length, width, height]) => base.push({ length, width, height }));
  } else {
    base.push({ length: packet.length, width: packet.width, height: packet.height });
    if (packet.rotate) base.push({ length: packet.width, width: packet.length, height: packet.height });
  }
  const seen = new Set();
  return base.filter((orientation) => {
    const key = `${orientation.length}-${orientation.width}-${orientation.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function orientationStats(container, packet, orientation) {
  const perLength = Math.floor(container.length / orientation.length);
  const perWidth = Math.floor(container.width / orientation.width);
  const layers = Math.floor(container.height / orientation.height);
  const capacity = Math.max(0, perLength * perWidth * layers);
  const fitQty = Math.min(packet.qty, capacity);
  const usedVolume = fitQty * volumeOf(orientation);
  const totalCapacityVolume = capacity * volumeOf(orientation);
  return {
    ...orientation,
    perLength,
    perWidth,
    layers,
    capacity,
    fitQty,
    usedVolume,
    totalCapacityVolume,
    efficiency: pct(totalCapacityVolume, volumeOf(container)),
    loadEfficiency: pct(usedVolume, volumeOf(container)),
    gapLength: container.length - perLength * orientation.length,
    gapWidth: container.width - perWidth * orientation.width,
    gapHeight: container.height - layers * orientation.height,
  };
}

function bestOrientation(container, packet) {
  const stats = uniqueOrientations(packet)
    .map((orientation) => orientationStats(container, packet, orientation))
    .sort((a, b) => b.capacity - a.capacity || b.efficiency - a.efficiency);
  return stats[0] || null;
}

function buildSingleSkuPlacements(packet, stats, showFullCapacity = false) {
  const placements = [];
  if (!stats || stats.capacity <= 0) return placements;
  const targetQty = showFullCapacity ? stats.capacity : packet.qty;
  const qty = Math.min(targetQty, stats.capacity, MAX_RENDERED_BOXES);
  let count = 0;
  for (let layer = 0; layer < stats.layers && count < qty; layer += 1) {
    for (let row = 0; row < stats.perWidth && count < qty; row += 1) {
      for (let column = 0; column < stats.perLength && count < qty; column += 1) {
        placements.push({
          packetId: packet.id,
          name: packet.name,
          color: packet.color,
          x: column * stats.length,
          y: row * stats.width,
          z: layer * stats.height,
          length: stats.length,
          width: stats.width,
          height: stats.height,
        });
        count += 1;
      }
    }
  }
  return placements;
}

function buildMixedPlacements(container, plan, showFullCapacity = false) {
  if (showFullCapacity && plan.length === 1) {
    return buildSingleSkuPlacements(plan[0].packet, plan[0].best, true);
  }

  const units = [];
  for (const item of plan) {
    if (!item.best) continue;
    const qty = Math.min(item.packet.qty, MAX_RENDERED_BOXES - units.length);
    for (let index = 0; index < qty; index += 1) {
      units.push({ packet: item.packet, stats: item.best });
    }
    if (units.length >= MAX_RENDERED_BOXES) break;
  }

  const placements = [];
  let x = 0;
  let y = 0;
  let z = 0;
  let rowDepth = 0;
  let layerHeight = 0;

  for (const unit of units) {
    const box = unit.stats;

    if (x + box.length > container.length) {
      x = 0;
      y += rowDepth;
      rowDepth = 0;
    }

    if (y + box.width > container.width) {
      x = 0;
      y = 0;
      z += layerHeight;
      rowDepth = 0;
      layerHeight = 0;
    }

    if (z + box.height > container.height) {
      continue;
    }

    placements.push({
      packetId: unit.packet.id,
      name: unit.packet.name,
      color: unit.packet.color,
      x,
      y,
      z,
      length: box.length,
      width: box.width,
      height: box.height,
    });
    x += box.length;
    rowDepth = Math.max(rowDepth, box.width);
    layerHeight = Math.max(layerHeight, box.height);
  }

  return placements;
}

function countPlacementsByPacket(placements) {
  return placements.reduce((counts, placement) => {
    counts[placement.packetId] = (counts[placement.packetId] || 0) + 1;
    return counts;
  }, {});
}

function planLoad(container, packets) {
  const plan = packets.map((packet) => {
    const best = bestOrientation(container, packet);
    const cbmQty = Math.floor(volumeOf(container) / volumeOf(packet));
    return {
      packet,
      best,
      cbmQty,
      loadableQty: best ? Math.min(packet.qty, best.capacity) : 0,
      capacity: best?.capacity || 0,
      enteredVolume: packet.qty * volumeOf(packet),
      enteredWeight: packet.qty * packet.weight,
    };
  });

  const primary = plan.find((item) => item.packet.id === state.activePacketId) || plan[0];
  const visualFullCapacity = state.showFullCapacity && plan.length === 1;
  const placements = buildMixedPlacements(container, plan, visualFullCapacity);
  const placedCounts = countPlacementsByPacket(placements);
  plan.forEach((item) => {
    item.loadableQty = visualFullCapacity
      ? Math.min(item.packet.qty, item.capacity)
      : Math.min(item.packet.qty, placedCounts[item.packet.id] || 0);
  });
  const totalQty = packets.reduce((sum, packet) => sum + packet.qty, 0);
  const totalWeight = packets.reduce((sum, packet) => sum + packet.qty * packet.weight, 0);
  const placedQty = plan.reduce((sum, item) => sum + item.loadableQty, 0);
  const enteredVolume = packets.reduce((sum, packet) => sum + packet.qty * volumeOf(packet), 0);
  const loadedVolume = plan.reduce((sum, item) => sum + item.loadableQty * volumeOf(item.packet), 0);

  return { plan, primary, placements, totalQty, totalWeight, placedQty, enteredVolume, loadedVolume, visualFullCapacity };
}

function packetTotals(packet) {
  return {
    volume: packet.qty * volumeOf(packet),
    weight: packet.qty * packet.weight,
  };
}

function renderMetrics(containerData, packets, analysis) {
  const usable = containerData.usable;
  const containerVolume = volumeOf(usable);
  const hasFailure = analysis.plan.some((item) => item.loadableQty < item.packet.qty) || analysis.totalWeight > usable.payload;
  const hasPackets = packets.length > 0;
  const active = analysis.primary;
  const rawContainerCbm = volumeOf(containerData.raw);
  const usableContainerCbm = volumeOf(usable);
  const enteredCbm = analysis.enteredVolume;

  els.loadability.textContent = !hasPackets ? "-" : hasFailure ? "Not loadable" : "Loadable";
  els.loadability.className = hasFailure ? "fail" : "pass";
  els.loadabilityNote.textContent = hasFailure
    ? "Quantity, dimensions, or payload need adjustment."
    : `Using ${fmt(containerData.margin, 1)}% planning margin.`;

  els.containerCbm.textContent = fmt(rawContainerCbm, 2);
  els.containerCbmNote.textContent = `${fmt(usableContainerCbm, 2)} cbm usable after ${fmt(containerData.margin, 1)}% margin`;
  els.loadedCbm.textContent = fmt(analysis.loadedVolume, 2);
  els.loadedCbmNote.textContent = `${fmt(enteredCbm, 2)} cbm entered cargo`;
  els.placedUnits.textContent = `${fmt(analysis.placedQty)} / ${fmt(analysis.totalQty)}`;
  els.placedNote.textContent = analysis.totalWeight > usable.payload ? `Payload over by ${fmt(analysis.totalWeight - usable.payload)} kg` : `${fmt(analysis.totalWeight)} kg used`;
  els.efficiency.textContent = `${fmt(pct(analysis.loadedVolume, containerVolume), 1)}%`;
  els.efficiencyNote.textContent = analysis.visualFullCapacity && active
    ? `3D view is showing ${fmt(active.capacity)} possible units`
    : `${fmt(analysis.loadedVolume, 2)} of ${fmt(containerVolume, 2)} cbm`;

  setStatus(hasFailure ? "Check needed" : "Plan status", hasFailure ? "Container is not fully loadable yet" : "Current packet plan fits");
}

function renderLegend(packets) {
  els.legend.innerHTML = "";
  packets.forEach((packet) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="swatch" style="background:${packet.color}"></span>${packet.name}`;
    els.legend.appendChild(item);
  });
}

function renderPlan(container, analysis) {
  els.planBody.innerHTML = "";
  analysis.plan.forEach((item) => {
    const row = document.createElement("tr");
    const best = item.best;
    const total = packetTotals(item.packet);
    row.innerHTML = `
      <td>${item.packet.name}</td>
      <td>${fmt(item.packet.qty)}</td>
      <td>${best ? `${fmt(best.length, 1)} x ${fmt(best.width, 1)} x ${fmt(best.height, 1)} cm` : "Does not fit"}</td>
      <td>${fmt(item.cbmQty)}</td>
      <td class="${item.loadableQty >= item.packet.qty ? "pass" : "fail"}">${fmt(item.loadableQty)} / ${fmt(item.packet.qty)}</td>
      <td class="${total.weight <= container.payload ? "pass" : "fail"}">${fmt(total.weight)} kg</td>
    `;
    els.planBody.appendChild(row);
  });
}

function renderOrientationTable(container, active) {
  els.orientationBody.innerHTML = "";
  if (!active) {
    els.orientationBody.innerHTML = `<tr><td colspan="5">Add a packet to compare orientations.</td></tr>`;
    return;
  }

  const rows = uniqueOrientations(active.packet)
    .map((orientation) => orientationStats(container, active.packet, orientation))
    .sort((a, b) => b.capacity - a.capacity || b.efficiency - a.efficiency);

  rows.forEach((stats, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index === 0 ? "<strong>Best</strong> " : ""}${fmt(stats.length, 1)} x ${fmt(stats.width, 1)} x ${fmt(stats.height, 1)} cm</td>
      <td>${stats.perLength} L x ${stats.perWidth} W x ${stats.layers} layers</td>
      <td>${fmt(stats.capacity)} units</td>
      <td>${fmt(stats.efficiency, 1)}%</td>
      <td>${fmt(stats.gapLength, 1)} L, ${fmt(stats.gapWidth, 1)} W, ${fmt(stats.gapHeight, 1)} H cm</td>
    `;
    els.orientationBody.appendChild(row);
  });
}

function addCoachItem(kind, title, text) {
  const item = document.createElement("div");
  item.className = `coach-item ${kind}`;
  item.innerHTML = `<strong>${title}</strong>${text}`;
  els.coachList.appendChild(item);
}

function renderCoach(container, analysis) {
  els.coachList.innerHTML = "";
  const active = analysis.primary;
  if (!active || !active.best) {
    addCoachItem("bad", "Packet does not fit", "Reduce packet dimensions or select a larger container.");
    return;
  }

  const stats = active.best;
  const packet = active.packet;
  const entered = packet.qty;
  const spare = stats.capacity - entered;
  const cbmGap = active.cbmQty - stats.capacity;

  addCoachItem(
    stats.capacity >= entered ? "good" : "bad",
    "Actual loadability",
    `${packet.name} loads ${fmt(Math.min(entered, stats.capacity))} of ${fmt(entered)} entered units. The selected orientation capacity is ${fmt(stats.capacity)}.`
  );

  if (cbmGap > 0) {
    addCoachItem(
      "warn",
      "CBM is optimistic",
      `Volume-only CBM says ${fmt(active.cbmQty)} units, but real packet geometry allows ${fmt(stats.capacity)} in this orientation.`
    );
  }

  if (spare >= 0) {
    addCoachItem("good", "Extra room", `You can add ${fmt(spare)} more units before this orientation reaches its geometric limit.`);
  } else {
    addCoachItem("bad", "Reduce quantity", `Remove ${fmt(Math.abs(spare))} units or change packet/container dimensions to make this loadable.`);
  }

  const nextLength = container.length / (stats.perLength + 1);
  const nextWidth = container.width / (stats.perWidth + 1);
  const nextHeight = container.height / (stats.layers + 1);

  if (nextLength > 0 && nextLength < stats.length) {
    addCoachItem(
      "warn",
      "Length adjustment",
      `If packet length can be ${fmt(nextLength, 1)} cm or less in this orientation, one more packet fits along the container length.`
    );
  }
  if (nextWidth > 0 && nextWidth < stats.width) {
    addCoachItem(
      "warn",
      "Width adjustment",
      `If packet width can be ${fmt(nextWidth, 1)} cm or less, one more packet fits across the container width.`
    );
  }
  if (nextHeight > 0 && nextHeight < stats.height) {
    addCoachItem(
      "warn",
      "Height adjustment",
      `If packet height can be ${fmt(nextHeight, 1)} cm or less, the plan gains one more vertical layer.`
    );
  }

  addCoachItem(
    "good",
    "Best orientation",
    `Use ${fmt(stats.length, 1)} x ${fmt(stats.width, 1)} x ${fmt(stats.height, 1)} cm. Grid: ${stats.perLength} by ${stats.perWidth}, with ${stats.layers} layers.`
  );
}

function exportPlan() {
  const containerData = readContainer();
  const packets = readPackets();
  const analysis = planLoad(containerData.usable, packets);
  const rows = [
    ["Container", els.containerType.value],
    ["Usable L cm", containerData.usable.length.toFixed(1)],
    ["Usable W cm", containerData.usable.width.toFixed(1)],
    ["Usable H cm", containerData.usable.height.toFixed(1)],
    ["Margin %", containerData.margin],
    [],
    ["Packet", "Qty", "Length", "Width", "Height", "CBM Qty", "Loadable Qty", "Best L", "Best W", "Best H"],
    ...analysis.plan.map((item) => [
      item.packet.name,
      item.packet.qty,
      item.packet.length,
      item.packet.width,
      item.packet.height,
      item.cbmQty,
      item.loadableQty,
      item.best?.length || "",
      item.best?.width || "",
      item.best?.height || "",
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "container-loadability-plan.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function initThree() {
  if (!window.THREE) {
    els.threeMessage.textContent = "Three.js could not load. Check your internet connection and reload this page.";
    return;
  }

  const THREE = window.THREE;
  three.scene = new THREE.Scene();
  three.scene.background = new THREE.Color(0xdfe9e7);
  three.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  three.renderer = new THREE.WebGLRenderer({ antialias: true });
  three.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  three.renderer.shadowMap.enabled = true;
  els.threeMount.appendChild(three.renderer.domElement);
  els.threeMessage.style.display = "none";

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa7a4, 1.5);
  three.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(8, 13, 7);
  sun.castShadow = true;
  three.scene.add(sun);

  three.root = new THREE.Group();
  three.scene.add(three.root);
  three.containerGroup = new THREE.Group();
  three.boxGroup = new THREE.Group();
  three.root.add(three.containerGroup, three.boxGroup);

  bindThreeInput();
  state.sceneReady = true;
  resizeThree();
  animate();
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose();
  }
}

function makeWireBox(dim, color, opacity) {
  const THREE = window.THREE;
  const scale = 0.01;
  const geometry = new THREE.BoxGeometry(dim.length * scale, dim.height * scale, dim.width * scale);
  const edges = new THREE.EdgesGeometry(geometry);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const box = new THREE.LineSegments(edges, material);
  box.position.y = (dim.height * scale) / 2;
  geometry.dispose();
  return box;
}

function makeFloorGrid(dim) {
  const THREE = window.THREE;
  const scale = 0.01;
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0x8fa09c, transparent: true, opacity: 0.35 });
  const step = 1;
  const length = dim.length * scale;
  const width = dim.width * scale;
  const halfL = length / 2;
  const halfW = width / 2;
  for (let x = -halfL; x <= halfL + 0.001; x += step) {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, -halfW), new THREE.Vector3(x, 0, halfW)]);
    group.add(new THREE.Line(geometry, material));
  }
  for (let z = -halfW; z <= halfW + 0.001; z += step) {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-halfL, 0, z), new THREE.Vector3(halfL, 0, z)]);
    group.add(new THREE.Line(geometry, material));
  }
  return group;
}

function renderThree(containerData, packets, placements) {
  if (!state.sceneReady) return;
  const THREE = window.THREE;
  const scale = 0.01;
  clearGroup(three.containerGroup);
  clearGroup(three.boxGroup);

  three.containerGroup.add(makeWireBox(containerData.raw, 0x172026, 0.45));
  if (state.showUsableBox) three.containerGroup.add(makeWireBox(containerData.usable, 0x0f766e, 0.9));
  three.containerGroup.add(makeFloorGrid(containerData.usable));

  const byPacket = new Map();
  placements.forEach((placement) => {
    if (!byPacket.has(placement.packetId)) byPacket.set(placement.packetId, []);
    byPacket.get(placement.packetId).push(placement);
  });

  byPacket.forEach((items, packetId) => {
    const packet = packets.find((candidate) => candidate.id === packetId);
    if (!packet || !items.length) return;
    const first = items[0];
    const geometry = new THREE.BoxGeometry(first.length * scale, first.height * scale, first.width * scale);
    const material = new THREE.MeshStandardMaterial({
      color: packet.color,
      roughness: 0.58,
      metalness: 0.05,
      transparent: true,
      opacity: 0.88,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    items.forEach((item, index) => {
      matrix.makeTranslation(
        (item.x + item.length / 2 - containerData.usable.length / 2) * scale,
        (item.z + item.height / 2) * scale,
        (item.y + item.width / 2 - containerData.usable.width / 2) * scale
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    three.boxGroup.add(mesh);
  });

  updateCamera(containerData.usable);
  resizeThree();
}

function updateCamera(dim) {
  if (!state.sceneReady) return;
  const scale = 0.01;
  const maxDim = Math.max(dim.length, dim.width, dim.height) * scale;
  const distance = state.cameraDistance || maxDim * 1.3;
  const y = Math.sin(state.cameraAngleY) * distance;
  const flat = Math.cos(state.cameraAngleY) * distance;
  const x = Math.sin(state.cameraAngleX) * flat;
  const z = Math.cos(state.cameraAngleX) * flat;
  three.camera.position.set(x, y + dim.height * scale * 0.35, z);
  three.camera.lookAt(0, dim.height * scale * 0.35, 0);
}

function resizeThree() {
  if (!state.sceneReady) return;
  const rect = els.threeMount.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  three.camera.aspect = width / height;
  three.camera.updateProjectionMatrix();
  three.renderer.setSize(width, height, false);
}

function animate() {
  if (!state.sceneReady) return;
  three.renderer.render(three.scene, three.camera);
  requestAnimationFrame(animate);
}

function bindThreeInput() {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  els.threeMount.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    els.threeMount.setPointerCapture(event.pointerId);
  });
  els.threeMount.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    state.cameraAngleX -= dx * 0.008;
    state.cameraAngleY = Math.max(0.18, Math.min(1.35, state.cameraAngleY + dy * 0.006));
    updateCamera(readContainer().usable);
  });
  els.threeMount.addEventListener("pointerup", () => {
    dragging = false;
  });
  els.threeMount.addEventListener("wheel", (event) => {
    event.preventDefault();
    state.cameraDistance = Math.max(5, Math.min(28, state.cameraDistance + event.deltaY * 0.01));
    updateCamera(readContainer().usable);
  }, { passive: false });
  window.addEventListener("resize", resizeThree);
}

function update() {
  els.marginLabel.textContent = `${fmt(value(els.margin), 1)}%`;
  syncActiveSelect();
  const containerData = readContainer();
  const packets = readPackets();
  if (packets.length > 1 && state.showFullCapacity) {
    state.showFullCapacity = false;
  }
  els.toggleCapacityBtn.disabled = packets.length > 1;
  els.toggleCapacityBtn.textContent = packets.length > 1
    ? "Mixed entered qty"
    : state.showFullCapacity ? "Show entered qty" : "Show full capacity";
  const analysis = planLoad(containerData.usable, packets);
  state.analysis = analysis;
  state.placements = analysis.placements;
  renderMetrics(containerData, packets, analysis);
  renderLegend(packets);
  renderPlan(containerData.usable, analysis);
  renderOrientationTable(containerData.usable, analysis.primary);
  renderCoach(containerData.usable, analysis);
  renderThree(containerData, packets, analysis.placements);
}

els.containerType.addEventListener("change", () => {
  if (els.containerType.value !== "custom") setContainer(els.containerType.value);
  update();
});

[els.containerLength, els.containerWidth, els.containerHeight, els.containerPayload].forEach((input) => {
  input.addEventListener("input", () => {
    els.containerType.value = "custom";
    update();
  });
});

els.margin.addEventListener("input", update);
els.addPacketBtn.addEventListener("click", () => {
  createPacket();
  update();
});
els.activePacket.addEventListener("change", () => {
  state.activePacketId = els.activePacket.value;
  update();
});
els.exportBtn.addEventListener("click", exportPlan);
els.resetViewBtn.addEventListener("click", () => {
  state.cameraAngleX = -0.75;
  state.cameraAngleY = 0.85;
  state.cameraDistance = 15;
  updateCamera(readContainer().usable);
});
els.toggleWireBtn.addEventListener("click", () => {
  state.showUsableBox = !state.showUsableBox;
  update();
});
els.toggleCapacityBtn.addEventListener("click", () => {
  state.showFullCapacity = !state.showFullCapacity;
  els.toggleCapacityBtn.textContent = state.showFullCapacity ? "Show entered qty" : "Show full capacity";
  update();
});

function loadInitialPackets() {
  const demo = new URLSearchParams(window.location.search).get("demo");
  if (demo === "mixed") {
    createPacket({ name: "Packet 1", length: 56, width: 34, height: 46.5, qty: 25, weight: 1, rotate: true, flip: true });
    createPacket({ name: "Packet 2", length: 50, width: 34, height: 46.5, qty: 25, weight: 1, rotate: true, flip: true });
    createPacket({ name: "Packet 3", length: 40, width: 34, height: 46.5, qty: 25, weight: 1, rotate: true, flip: true });
    return;
  }
  createPacket({ name: "Packet 1", length: 56, width: 34, height: 46.5, qty: 25, weight: 1, rotate: true, flip: false });
}

setContainer("40hq");
loadInitialPackets();
initThree();
update();
