const CONTAINERS = {
  "20ft": { name: "20 FT Container", length: 589.5, width: 235.0, height: 239.2, payload: 28230 },
  "40ft": { name: "40 FT Container", length: 1202.9, width: 235.0, height: 239.2, payload: 26700 },
  "40hq": { name: "40 HQ Container", length: 1202.4, width: 235.0, height: 269.7, payload: 26460 },
  "45hq": { name: "45 HQ Container", length: 1355.6, width: 235.2, height: 270.0, payload: 27700 },
};

const COLORS = ["#0f766e", "#2563eb", "#b45309", "#6d28d9", "#15803d", "#be123c", "#0369a1", "#854d0e"];
const MAX_RENDERED_BOXES = 12000;

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
  smartMix: document.querySelector("#smartMix"),
  mixed360: document.querySelector("#mixed360"),
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
  els.activePacket.style.display = packets.length > 1 ? "none" : "";
  els.activePacket.innerHTML = "";
  packets.forEach((packet) => {
    const option = document.createElement("option");
    option.value = packet.id;
    option.textContent = packet.name;
    option.selected = packet.id === state.activePacketId;
    els.activePacket.appendChild(option);
  });
}

function uniqueOrientations(packet, force360 = false) {
  const base = [];
  if (force360 || packet.flip) {
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

function readMixedOptions() {
  const smartMix = Boolean(els.smartMix?.checked);
  return {
    mode: smartMix ? "space" : "packet",
    force360: smartMix && Boolean(els.mixed360?.checked),
  };
}

function buildMixedPlacements(container, plan, options = {}) {
  const { showFullCapacity = false, mode = "space", force360 = false } = options;
  if (showFullCapacity && plan.length === 1) {
    return buildSingleSkuPlacements(plan[0].packet, plan[0].best, true);
  }

  if (mode === "packet") {
    return buildPacketWiseMixedPlacements(container, plan, force360);
  }

  const zoned = buildZonedMixedPlacements(container, plan, force360);
  const spaceWise = buildSpaceWiseMixedPlacements(container, plan, force360);
  const layered = buildLayeredMixedPlacements(container, plan, force360);
  return [zoned, spaceWise, layered].reduce((best, candidate) => (isBetterPlacementSet(candidate, best) ? candidate : best), []);
}

function buildZonedMixedPlacements(container, plan, force360 = false) {
  if (plan.length < 2 || plan.length > 4) return [];

  const items = plan
    .map((item) => ({
      packet: item.packet,
      orientations: uniqueOrientations(item.packet, force360)
        .filter(
          (orientation) =>
            orientation.length <= container.length &&
            orientation.width <= container.width &&
            orientation.height <= container.height
        )
        .sort((a, b) => {
          const aLayers = Math.floor(container.height / a.height);
          const bLayers = Math.floor(container.height / b.height);
          return bLayers - aLayers || a.width - b.width || a.length * a.width - b.length * b.width;
        }),
    }))
    .filter((item) => item.packet.qty > 0 && item.orientations.length);

  if (items.length !== plan.length) return [];

  const totalQty = items.reduce((sum, item) => sum + item.packet.qty, 0);
  const indices = items.map((_, index) => index);
  let best = [];

  getIndexPermutations(indices).forEach((order) => {
    const candidate = buildZonedOrder(container, items, order);
    if (isBetterPlacementSet(candidate, best)) best = candidate;
    if (best.length >= totalQty) return best;
  });

  return best;
}

function getIndexPermutations(indices) {
  const output = [];
  const used = new Set();
  const current = [];

  function walk() {
    if (current.length === indices.length) {
      output.push([...current]);
      return;
    }

    indices.forEach((index) => {
      if (used.has(index)) return;
      used.add(index);
      current.push(index);
      walk();
      current.pop();
      used.delete(index);
    });
  }

  walk();
  return output;
}

function buildZonedOrder(container, items, order) {
  const fillIndex = order[order.length - 1];
  const reserveOrder = order.slice(0, -1);
  let best = [];

  function reserve(step, floorSpaces, placements) {
    if (placements.length >= MAX_RENDERED_BOXES) return;
    if (step >= reserveOrder.length) {
      const fillPlacements = fillItemAcrossFloorSpaces(
        container,
        items[fillIndex],
        floorSpaces,
        MAX_RENDERED_BOXES - placements.length
      );
      const candidate = placements.concat(fillPlacements);
      if (isBetterPlacementSet(candidate, best)) best = candidate;
      return;
    }

    const item = items[reserveOrder[step]];
    const candidates = buildZoneCandidates(container, item, floorSpaces).slice(0, 90);
    candidates.forEach((candidate) => {
      const zonePlacements = buildGridPlacementsInZone(container, item.packet, candidate.orientation, candidate.zone, item.packet.qty);
      if (zonePlacements.length < item.packet.qty) return;
      const nextSpaces = splitFloorSpaceForZone(floorSpaces, candidate.spaceIndex, candidate.zone);
      reserve(step + 1, nextSpaces, placements.concat(zonePlacements));
    });
  }

  reserve(0, [{ x: 0, y: 0, length: container.length, width: container.width }], []);
  return best;
}

function buildZoneCandidates(container, item, floorSpaces) {
  const candidates = [];

  floorSpaces.forEach((space, spaceIndex) => {
    item.orientations.forEach((orientation) => {
      const layers = Math.floor(container.height / orientation.height);
      const maxColumns = Math.floor(space.length / orientation.length);
      const maxRows = Math.floor(space.width / orientation.width);
      if (layers <= 0 || maxColumns <= 0 || maxRows <= 0) return;

      const neededCells = Math.ceil(item.packet.qty / layers);
      const maxUsefulRows = Math.min(maxRows, neededCells);
      for (let rows = 1; rows <= maxUsefulRows; rows += 1) {
        const columns = Math.ceil(neededCells / rows);
        if (columns > maxColumns) continue;

        const zone = {
          x: space.x,
          y: space.y,
          length: columns * orientation.length,
          width: rows * orientation.width,
        };
        const capacity = columns * rows * layers;
        const zoneArea = zone.length * zone.width;
        const unusedCapacity = capacity - item.packet.qty;
        candidates.push({
          spaceIndex,
          zone,
          orientation,
          capacity,
          score: [
            zoneArea,
            unusedCapacity,
            zone.width,
            zone.length,
            Math.abs(space.length - zone.length),
            Math.abs(space.width - zone.width),
          ],
        });
      }
    });
  });

  candidates.sort((a, b) => compareScore(a.score, b.score));
  return candidates;
}

function splitFloorSpaceForZone(floorSpaces, zoneIndex, zone) {
  const next = floorSpaces.filter((_, index) => index !== zoneIndex);
  const source = floorSpaces[zoneIndex];
  const right = {
    x: zone.x + zone.length,
    y: zone.y,
    length: source.x + source.length - (zone.x + zone.length),
    width: zone.width,
  };
  const front = {
    x: source.x,
    y: zone.y + zone.width,
    length: source.length,
    width: source.y + source.width - (zone.y + zone.width),
  };

  [right, front].forEach((space) => {
    if (space.length > 0.01 && space.width > 0.01) next.push(space);
  });

  return prune2dSpaces(next).sort((a, b) => b.length * b.width - a.length * a.width);
}

function fillItemAcrossFloorSpaces(container, item, floorSpaces, limit) {
  const sortedSpaces = [...floorSpaces].sort((a, b) => b.length * b.width - a.length * a.width);
  let best = [];

  item.orientations.forEach((firstOrientation) => {
    const placements = [];
    let remaining = Math.min(item.packet.qty, limit);

    sortedSpaces.forEach((space, spaceIndex) => {
      if (remaining <= 0) return;
      const orientation =
        spaceIndex === 0
          ? firstOrientation
          : bestOrientationForFloorSpace(container, item, space);
      if (!orientation) return;

      const zonePlacements = buildGridPlacementsInZone(container, item.packet, orientation, space, remaining);
      placements.push(...zonePlacements);
      remaining -= zonePlacements.length;
    });

    if (isBetterPlacementSet(placements, best)) best = placements;
  });

  return best;
}

function bestOrientationForFloorSpace(container, item, space) {
  return item.orientations
    .map((orientation) => ({
      orientation,
      columns: Math.floor(space.length / orientation.length),
      rows: Math.floor(space.width / orientation.width),
      layers: Math.floor(container.height / orientation.height),
    }))
    .filter((entry) => entry.columns > 0 && entry.rows > 0 && entry.layers > 0)
    .sort((a, b) => {
      const aCapacity = a.columns * a.rows * a.layers;
      const bCapacity = b.columns * b.rows * b.layers;
      const aUsed = a.columns * a.rows * a.layers * a.orientation.length * a.orientation.width * a.orientation.height;
      const bUsed = b.columns * b.rows * b.layers * b.orientation.length * b.orientation.width * b.orientation.height;
      return bCapacity - aCapacity || bUsed - aUsed;
    })[0]?.orientation;
}

function buildGridPlacementsInZone(container, packet, orientation, zone, limit) {
  const placements = [];
  const columns = Math.floor(zone.length / orientation.length);
  const rows = Math.floor(zone.width / orientation.width);
  const layers = Math.floor(container.height / orientation.height);
  const qty = Math.min(limit, columns * rows * layers, MAX_RENDERED_BOXES);

  let count = 0;
  for (let layer = 0; layer < layers && count < qty; layer += 1) {
    for (let row = 0; row < rows && count < qty; row += 1) {
      for (let column = 0; column < columns && count < qty; column += 1) {
        placements.push({
          packetId: packet.id,
          name: packet.name,
          color: packet.color,
          x: zone.x + column * orientation.length,
          y: zone.y + row * orientation.width,
          z: layer * orientation.height,
          length: orientation.length,
          width: orientation.width,
          height: orientation.height,
        });
        count += 1;
      }
    }
  }

  return placements;
}

function buildPacketWiseMixedPlacements(container, plan, force360 = false) {
  const units = [];
  for (const item of plan) {
    const orientations = uniqueOrientations(item.packet, force360).filter(
      (orientation) =>
        orientation.length <= container.length &&
        orientation.width <= container.width &&
        orientation.height <= container.height
    );
    if (!orientations.length) continue;
    const qty = Math.min(item.packet.qty, MAX_RENDERED_BOXES - units.length);
    for (let index = 0; index < qty; index += 1) {
      units.push({
        packet: item.packet,
        orientations,
        volume: volumeOf(item.packet),
        largestSide: Math.max(item.packet.length, item.packet.width, item.packet.height),
      });
    }
    if (units.length >= MAX_RENDERED_BOXES) break;
  }

  units.sort((a, b) => b.volume - a.volume || b.largestSide - a.largestSide || a.packet.name.localeCompare(b.packet.name));

  const placements = [];
  let spaces = [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: container.height }];

  for (const unit of units) {
    const placement = findBestMixedPlacement(unit, spaces);
    if (!placement) {
      continue;
    }

    const { space, orientation, spaceIndex } = placement;
    placements.push({
      packetId: unit.packet.id,
      name: unit.packet.name,
      color: unit.packet.color,
      x: space.x,
      y: space.y,
      z: space.z,
      length: orientation.length,
      width: orientation.width,
      height: orientation.height,
    });

    spaces.splice(spaceIndex, 1);
    spaces.push(...splitMixedSpace(space, orientation));
    spaces = pruneMixedSpaces(spaces);
  }

  return placements;
}

function buildSpaceWiseMixedPlacements(container, plan, force360 = false) {
  const inventory = plan
    .map((item) => ({
      packet: item.packet,
      remaining: item.packet.qty,
      orientations: uniqueOrientations(item.packet, force360)
        .filter(
          (orientation) =>
            orientation.length <= container.length &&
            orientation.width <= container.width &&
            orientation.height <= container.height
        )
        .sort((a, b) => b.length * b.width * b.height - a.length * a.width * a.height),
    }))
    .filter((item) => item.remaining > 0 && item.orientations.length);

  const placements = [];
  const placedByPacket = {};
  let spaces = [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: container.height }];

  while (placements.length < MAX_RENDERED_BOXES && inventory.some((item) => item.remaining > 0)) {
    spaces = pruneMixedSpaces(spaces).sort(compareSpacesForSmartMix);
    let didPlace = false;

    for (let spaceIndex = 0; spaceIndex < spaces.length; spaceIndex += 1) {
      const space = spaces[spaceIndex];
      const candidate = findBestInventoryForSpace(space, inventory, placedByPacket);

      if (!candidate) {
        spaces.splice(spaceIndex, 1);
        spaceIndex -= 1;
        continue;
      }

      const { item, orientation } = candidate;
      placements.push({
        packetId: item.packet.id,
        name: item.packet.name,
        color: item.packet.color,
        x: space.x,
        y: space.y,
        z: space.z,
        length: orientation.length,
        width: orientation.width,
        height: orientation.height,
      });
      item.remaining -= 1;
      placedByPacket[item.packet.id] = (placedByPacket[item.packet.id] || 0) + 1;

      spaces.splice(spaceIndex, 1);
      spaces.push(...splitMixedSpace(space, orientation));
      didPlace = true;
      break;
    }

    if (!didPlace) break;
  }

  return placements;
}

function buildLayeredMixedPlacements(container, plan, force360 = false) {
  const baseInventory = buildLayerInventory(container, plan, force360);
  const layerHeights = [
    ...new Set(
      baseInventory
        .flatMap((item) => item.orientations.map((orientation) => Number(orientation.height.toFixed(3))))
        .filter((height) => height > 0 && height <= container.height)
    ),
  ].sort((a, b) => a - b);

  let best = [];
  for (const preferredHeight of layerHeights) {
    const inventory = cloneLayerInventory(baseInventory);
    const placements = [];
    let z = 0;

    while (z + preferredHeight <= container.height + 0.001 && hasRemainingInventory(inventory) && placements.length < MAX_RENDERED_BOXES) {
      const layer = fillMixedLayer(container, inventory, preferredHeight, z, MAX_RENDERED_BOXES - placements.length);
      if (!layer.length) break;
      placements.push(...layer);
      z += preferredHeight;
    }

    const remainingHeights = layerHeights.filter((height) => height <= container.height - z + 0.001).sort((a, b) => b - a);
    for (const height of remainingHeights) {
      if (!hasRemainingInventory(inventory) || placements.length >= MAX_RENDERED_BOXES) break;
      const layer = fillMixedLayer(container, inventory, height, z, MAX_RENDERED_BOXES - placements.length);
      if (layer.length) {
        placements.push(...layer);
        z += height;
      }
    }

    if (isBetterPlacementSet(placements, best)) {
      best = placements;
    }
  }

  return best;
}

function buildLayerInventory(container, plan, force360) {
  return plan
    .map((item) => ({
      packet: item.packet,
      remaining: item.packet.qty,
      totalQty: item.packet.qty,
      orientations: uniqueOrientations(item.packet, force360)
        .filter(
          (orientation) =>
            orientation.length <= container.length &&
            orientation.width <= container.width &&
            orientation.height <= container.height
        )
        .sort((a, b) => b.length * b.width - a.length * a.width),
    }))
    .filter((item) => item.remaining > 0 && item.orientations.length);
}

function cloneLayerInventory(inventory) {
  return inventory.map((item) => ({ ...item, orientations: item.orientations }));
}

function hasRemainingInventory(inventory) {
  return inventory.some((item) => item.remaining > 0);
}

function fillMixedLayer(container, inventory, layerHeight, z, limit) {
  const placements = [];
  let spaces = [{ x: 0, y: 0, length: container.length, width: container.width }];

  while (placements.length < limit && hasRemainingInventory(inventory)) {
    spaces = prune2dSpaces(spaces).sort((a, b) => a.y - b.y || a.x - b.x || a.length * a.width - b.length * b.width);
    let best = null;

    spaces.forEach((space, spaceIndex) => {
      inventory.forEach((item) => {
        if (item.remaining <= 0) return;
        item.orientations.forEach((orientation) => {
          if (orientation.height > layerHeight + 0.001 || orientation.length > space.length || orientation.width > space.width) return;
          const area = orientation.length * orientation.width;
          const spaceArea = space.length * space.width;
          const placedRatio = (item.totalQty - item.remaining) / Math.max(1, item.totalQty);
          const leftoverLength = space.length - orientation.length;
          const leftoverWidth = space.width - orientation.width;
          const score = [
            placedRatio,
            (spaceArea - area) / spaceArea,
            Math.abs(layerHeight - orientation.height) / layerHeight,
            Math.min(leftoverLength, leftoverWidth),
            Math.max(leftoverLength, leftoverWidth),
            -area,
            -item.remaining,
          ];
          if (!best || compareScore(score, best.score) < 0) {
            best = { item, orientation, space, spaceIndex, score };
          }
        });
      });
    });

    if (!best) break;

    placements.push({
      packetId: best.item.packet.id,
      name: best.item.packet.name,
      color: best.item.packet.color,
      x: best.space.x,
      y: best.space.y,
      z,
      length: best.orientation.length,
      width: best.orientation.width,
      height: best.orientation.height,
    });
    best.item.remaining -= 1;

    spaces.splice(best.spaceIndex, 1);
    spaces.push(...split2dSpace(best.space, best.orientation));
  }

  return placements;
}

function split2dSpace(space, box) {
  const right = {
    x: space.x + box.length,
    y: space.y,
    length: space.length - box.length,
    width: box.width,
  };
  const front = {
    x: space.x,
    y: space.y + box.width,
    length: space.length,
    width: space.width - box.width,
  };
  return [right, front].filter((candidate) => candidate.length > 0.01 && candidate.width > 0.01);
}

function prune2dSpaces(spaces) {
  return spaces.filter((space, index) => {
    return !spaces.some((other, otherIndex) => otherIndex !== index && contains2dSpace(other, space));
  });
}

function contains2dSpace(outer, inner) {
  const epsilon = 0.001;
  return (
    outer.x <= inner.x + epsilon &&
    outer.y <= inner.y + epsilon &&
    outer.x + outer.length >= inner.x + inner.length - epsilon &&
    outer.y + outer.width >= inner.y + inner.width - epsilon
  );
}

function isBetterPlacementSet(candidate, current) {
  if (candidate.length !== current.length) return candidate.length > current.length;
  const candidateVolume = candidate.reduce((sum, item) => sum + item.length * item.width * item.height, 0);
  const currentVolume = current.reduce((sum, item) => sum + item.length * item.width * item.height, 0);
  return candidateVolume > currentVolume;
}

function compareSpacesForSmartMix(a, b) {
  const aVolume = a.length * a.width * a.height;
  const bVolume = b.length * b.width * b.height;
  return a.z - b.z || a.y - b.y || a.x - b.x || aVolume - bVolume;
}

function findBestInventoryForSpace(space, inventory, placedByPacket = {}) {
  let best = null;
  for (const item of inventory) {
    if (item.remaining <= 0) continue;
    for (const orientation of item.orientations) {
      if (orientation.length > space.length || orientation.width > space.width || orientation.height > space.height) continue;

      const leftoverLength = space.length - orientation.length;
      const leftoverWidth = space.width - orientation.width;
      const leftoverHeight = space.height - orientation.height;
      const boxVolume = orientation.length * orientation.width * orientation.height;
      const spaceVolume = space.length * space.width * space.height;
      const waste = spaceVolume - boxVolume;
      const tightFaces = [leftoverLength, leftoverWidth, leftoverHeight].filter((gap) => gap < 0.01).length;
      const placedRatio = (placedByPacket[item.packet.id] || 0) / Math.max(1, item.packet.qty);
      const score = [
        placedRatio,
        waste / spaceVolume,
        -tightFaces,
        Math.min(leftoverLength, leftoverWidth, leftoverHeight),
        Math.max(leftoverLength, leftoverWidth, leftoverHeight),
        -boxVolume,
        -item.remaining,
      ];

      if (!best || compareScore(score, best.score) < 0) {
        best = { item, orientation, score };
      }
    }
  }
  return best;
}

function findBestMixedPlacement(unit, spaces) {
  let best = null;
  spaces.forEach((space, spaceIndex) => {
    unit.orientations.forEach((orientation) => {
      if (orientation.length > space.length || orientation.width > space.width || orientation.height > space.height) return;
      const waste =
        space.length * space.width * space.height -
        orientation.length * orientation.width * orientation.height;
      const score = [
        space.z,
        space.y,
        space.x,
        waste,
        space.height - orientation.height,
        space.width - orientation.width,
        space.length - orientation.length,
      ];
      if (!best || compareScore(score, best.score) < 0) {
        best = { space, spaceIndex, orientation, score };
      }
    });
  });
  return best;
}

function compareScore(a, b) {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function splitMixedSpace(space, box) {
  const next = [];
  const right = {
    x: space.x + box.length,
    y: space.y,
    z: space.z,
    length: space.length - box.length,
    width: box.width,
    height: box.height,
  };
  const front = {
    x: space.x,
    y: space.y + box.width,
    z: space.z,
    length: space.length,
    width: space.width - box.width,
    height: box.height,
  };
  const top = {
    x: space.x,
    y: space.y,
    z: space.z + box.height,
    length: space.length,
    width: space.width,
    height: space.height - box.height,
  };
  [right, front, top].forEach((candidate) => {
    if (candidate.length > 0.01 && candidate.width > 0.01 && candidate.height > 0.01) next.push(candidate);
  });
  return next;
}

function pruneMixedSpaces(spaces) {
  const sorted = spaces
    .filter((space) => space.length > 0.01 && space.width > 0.01 && space.height > 0.01)
    .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x || a.length * a.width * a.height - b.length * b.width * b.height);

  return sorted.filter((space, index) => {
    return !sorted.some((other, otherIndex) => otherIndex !== index && containsMixedSpace(other, space));
  });
}

function containsMixedSpace(outer, inner) {
  const epsilon = 0.001;
  return (
    outer.x <= inner.x + epsilon &&
    outer.y <= inner.y + epsilon &&
    outer.z <= inner.z + epsilon &&
    outer.x + outer.length >= inner.x + inner.length - epsilon &&
    outer.y + outer.width >= inner.y + inner.width - epsilon &&
    outer.z + outer.height >= inner.z + inner.height - epsilon
  );
}

function countPlacementsByPacket(placements) {
  return placements.reduce((counts, placement) => {
    counts[placement.packetId] = (counts[placement.packetId] || 0) + 1;
    return counts;
  }, {});
}

function placementOrientationKey(placement) {
  return [
    placement.packetId,
    Number(placement.length).toFixed(3),
    Number(placement.width).toFixed(3),
    Number(placement.height).toFixed(3),
  ].join("|");
}

function orientationKey(packetId, orientation) {
  return [
    packetId,
    Number(orientation.length).toFixed(3),
    Number(orientation.width).toFixed(3),
    Number(orientation.height).toFixed(3),
  ].join("|");
}

function countPlacementsByOrientation(placements) {
  return placements.reduce((counts, placement) => {
    const key = placementOrientationKey(placement);
    counts[key] = (counts[key] || 0) + 1;
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
  const mixedOptions = readMixedOptions();
  const placements =
    plan.length === 1 && primary
      ? buildSingleSkuPlacements(primary.packet, primary.best, visualFullCapacity)
      : buildMixedPlacements(container, plan, { ...mixedOptions, showFullCapacity: false });
  let mixed360Preview = null;
  if (plan.length > 1 && mixedOptions.mode === "space" && !mixedOptions.force360 && plan.length <= 4) {
    const previewPlacements = buildZonedMixedPlacements(container, plan, true);
    const previewCounts = countPlacementsByPacket(previewPlacements);
    const previewPlacedQty = plan.reduce((sum, item) => sum + Math.min(item.packet.qty, previewCounts[item.packet.id] || 0), 0);
    const previewLoadedVolume = plan.reduce(
      (sum, item) => sum + Math.min(item.packet.qty, previewCounts[item.packet.id] || 0) * volumeOf(item.packet),
      0
    );
    mixed360Preview = {
      placedQty: previewPlacedQty,
      loadedVolume: previewLoadedVolume,
    };
  }
  const placedCounts = countPlacementsByPacket(placements);
  const orientationCounts = countPlacementsByOrientation(placements);
  plan.forEach((item) => {
    item.loadableQty = visualFullCapacity
      ? Math.min(item.packet.qty, item.capacity)
      : plan.length === 1
        ? Math.min(item.packet.qty, item.capacity)
        : Math.min(item.packet.qty, placedCounts[item.packet.id] || 0);
  });
  const totalQty = packets.reduce((sum, packet) => sum + packet.qty, 0);
  const totalWeight = packets.reduce((sum, packet) => sum + packet.qty * packet.weight, 0);
  const placedQty = plan.reduce((sum, item) => sum + item.loadableQty, 0);
  const enteredVolume = packets.reduce((sum, packet) => sum + packet.qty * volumeOf(packet), 0);
  const loadedVolume = plan.reduce((sum, item) => sum + item.loadableQty * volumeOf(item.packet), 0);

  return {
    plan,
    primary,
    placements,
    placedCounts,
    orientationCounts,
    totalQty,
    totalWeight,
    placedQty,
    enteredVolume,
    loadedVolume,
    visualFullCapacity,
    mixedMode: mixedOptions.mode,
    mixed360: mixedOptions.force360,
    mixed360Preview,
  };
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

function renderOrientationTable(container, analysis) {
  els.orientationBody.innerHTML = "";
  if (!analysis.plan.length) {
    els.orientationBody.innerHTML = `<tr><td colspan="6">Add a packet to compare orientations.</td></tr>`;
    return;
  }

  analysis.plan.forEach((item) => {
    const rows = uniqueOrientations(item.packet, analysis.plan.length > 1 && analysis.mixed360)
      .map((orientation) => orientationStats(container, item.packet, orientation))
      .sort((a, b) => b.capacity - a.capacity || b.efficiency - a.efficiency);

    rows.forEach((stats, index) => {
      const used = analysis.orientationCounts[orientationKey(item.packet.id, stats)] || 0;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${item.packet.name}</td>
        <td>${index === 0 ? "<strong>Solo best</strong> " : ""}${fmt(stats.length, 1)} x ${fmt(stats.width, 1)} x ${fmt(stats.height, 1)} cm</td>
        <td>${stats.perLength} L x ${stats.perWidth} W x ${stats.layers} layers</td>
        <td>${used ? `Used ${fmt(used)} / ${fmt(item.packet.qty)}` : `Solo cap ${fmt(stats.capacity)}`}</td>
        <td>${fmt(stats.efficiency, 1)}%</td>
        <td>${fmt(stats.gapLength, 1)} L, ${fmt(stats.gapWidth, 1)} W, ${fmt(stats.gapHeight, 1)} H cm</td>
      `;
      els.orientationBody.appendChild(row);
    });
  });
}

function addCoachItem(kind, title, text) {
  const item = document.createElement("div");
  item.className = `coach-item ${kind}`;
  item.innerHTML = `<strong>${title}</strong>${text}`;
  els.coachList.appendChild(item);
}

function mixedOrientationSummary(analysis) {
  const grouped = new Map();
  analysis.placements.forEach((placement) => {
    const key = placementOrientationKey(placement);
    if (!grouped.has(key)) {
      grouped.set(key, {
        packetId: placement.packetId,
        name: placement.name,
        length: placement.length,
        width: placement.width,
        height: placement.height,
        count: 0,
      });
    }
    grouped.get(key).count += 1;
  });

  return [...grouped.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || b.count - a.count)
    .map((entry) => `${entry.name}: ${fmt(entry.length, 1)} x ${fmt(entry.width, 1)} x ${fmt(entry.height, 1)} cm (${fmt(entry.count)} used)`)
    .join("; ");
}

function renderCoach(container, analysis) {
  els.coachList.innerHTML = "";
  if (!analysis.plan.length) {
    addCoachItem("warn", "No packets entered", "Add packet dimensions and quantity to calculate the consolidated load.");
    return;
  }

  addCombinedLoadabilityCoach(container, analysis);

  if (analysis.plan.length === 1) {
    renderSinglePacketCoach(container, analysis);
    return;
  }

  renderMixedPacketCoach(container, analysis);
}

function addCombinedLoadabilityCoach(container, analysis) {
  const containerVolume = volumeOf(container);
  const loadedPercent = pct(analysis.loadedVolume, containerVolume);
  const unplaced = analysis.totalQty - analysis.placedQty;
  const spareCbm = Math.max(0, containerVolume - analysis.loadedVolume);
  const overWeight = analysis.totalWeight - container.payload;

  addCoachItem(
    unplaced === 0 && overWeight <= 0 ? "good" : "bad",
    "Combined loadability",
    `${fmt(analysis.placedQty)} of ${fmt(analysis.totalQty)} units are placed in the shared 3D container plan. Loaded CBM is ${fmt(analysis.loadedVolume, 2)} of ${fmt(containerVolume, 2)} usable CBM (${fmt(loadedPercent, 1)}%).`
  );
}

function renderSinglePacketCoach(container, analysis) {
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

function renderMixedPacketCoach(container, analysis) {
  const containerVolume = volumeOf(container);
  const unplaced = analysis.totalQty - analysis.placedQty;
  const spareCbm = Math.max(0, containerVolume - analysis.loadedVolume);
  const overWeight = analysis.totalWeight - container.payload;

  addCoachItem(
    "good",
    "Mixed loading method",
    `${analysis.mixedMode === "space" ? "Smart carton mixing" : "Packet-wise sequence"} is active${analysis.mixed360 ? " with 360 orientation." : "."}`
  );

  if (!analysis.mixed360 && analysis.mixed360Preview?.placedQty > analysis.placedQty) {
    addCoachItem(
      analysis.mixed360Preview.placedQty >= analysis.totalQty ? "good" : "warn",
      "Try 360 orientation",
      analysis.mixed360Preview.placedQty >= analysis.totalQty
        ? `Tick 360 orientation when mixing. This same mix can place all ${fmt(analysis.totalQty)} units and load ${fmt(analysis.mixed360Preview.loadedVolume, 2)} CBM.`
        : `Tick 360 orientation when mixing. The mixed plan improves to ${fmt(analysis.mixed360Preview.placedQty)} of ${fmt(analysis.totalQty)} units.`
    );
  }

  addCoachItem(
    overWeight <= 0 ? "good" : "bad",
    "Payload",
    overWeight <= 0
      ? `${fmt(analysis.totalWeight)} kg loaded against ${fmt(container.payload)} kg payload.`
      : `Payload is over by ${fmt(overWeight)} kg. Reduce quantity or choose a higher-payload container.`
  );

  if (unplaced > 0) {
    const shortage = analysis.plan
      .filter((item) => item.loadableQty < item.packet.qty)
      .map((item) => `${item.packet.name}: ${fmt(item.packet.qty - item.loadableQty)} unplaced`)
      .join(", ");
    addCoachItem("bad", "Unplaced packets", shortage || `${fmt(unplaced)} units could not be placed.`);
  } else {
    addCoachItem("good", "All packet types placed", "Every entered packet type is represented in the consolidated 3D loading result.");
  }

  if (analysis.enteredVolume > analysis.loadedVolume + 0.0001) {
    addCoachItem(
      "warn",
      "CBM vs geometry",
      `Entered cargo is ${fmt(analysis.enteredVolume, 2)} CBM, but only ${fmt(analysis.loadedVolume, 2)} CBM was placed. The gap is from real packet geometry and mixed-load fit, not only volume.`
    );
  }

  if (spareCbm > 0 && unplaced === 0) {
    const approximateExtra = analysis.plan
      .map((item) => ({
        item,
        extra: Math.floor(spareCbm / volumeOf(item.packet)),
      }))
      .filter((entry) => entry.extra > 0)
      .sort((a, b) => b.extra - a.extra)[0];
    addCoachItem(
      "good",
      "Remaining volume",
      approximateExtra
        ? `${fmt(spareCbm, 2)} CBM remains by volume. Roughly ${fmt(approximateExtra.extra)} more ${approximateExtra.item.packet.name} units may fit by CBM, subject to geometry.`
        : `${fmt(spareCbm, 2)} CBM remains, but packet geometry may limit further loading.`
    );
  } else {
    addCoachItem("warn", "Improve fit", "Try reducing the largest unplaced packet dimension, enabling side loading where practical, or moving to a larger container.");
  }

  const bestAdjustments = analysis.plan
    .filter((item) => item.best)
    .flatMap((item) => {
      const stats = item.best;
      return [
        { packet: item.packet.name, label: "length", current: stats.length, target: container.length / (stats.perLength + 1) },
        { packet: item.packet.name, label: "width", current: stats.width, target: container.width / (stats.perWidth + 1) },
        { packet: item.packet.name, label: "height", current: stats.height, target: container.height / (stats.layers + 1) },
      ];
    })
    .filter((entry) => entry.target > 0 && entry.target < entry.current)
    .map((entry) => ({ ...entry, reduction: entry.current - entry.target }))
    .sort((a, b) => a.reduction - b.reduction)
    .slice(0, 3);

  if (bestAdjustments.length) {
    addCoachItem(
      "warn",
      "Best dimension adjustments",
      bestAdjustments
        .map((entry) => `${entry.packet}: ${entry.label} to ${fmt(entry.target, 1)} cm or less`)
        .join("; ") + "."
    );
  }

  addCoachItem("good", "Used mixed orientations", mixedOrientationSummary(analysis) || "No valid packet orientation found for this container.");
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
    const key = [
      placement.packetId,
      placement.length.toFixed(3),
      placement.width.toFixed(3),
      placement.height.toFixed(3),
    ].join("|");
    if (!byPacket.has(key)) byPacket.set(key, { packetId: placement.packetId, items: [] });
    byPacket.get(key).items.push(placement);
  });

  byPacket.forEach((group) => {
    const { packetId, items } = group;
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
  els.mixed360.disabled = !els.smartMix.checked;
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
  renderOrientationTable(containerData.usable, analysis);
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
els.smartMix.addEventListener("change", update);
els.mixed360.addEventListener("change", update);
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
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo");
  if (demo === "mixed") {
    createPacket({ name: "Packet 1", length: 56, width: 34, height: 46.5, qty: 25, weight: 1, rotate: true, flip: true });
    createPacket({ name: "Packet 2", length: 50, width: 34, height: 46.5, qty: 25, weight: 1, rotate: true, flip: true });
    createPacket({ name: "Packet 3", length: 40, width: 34, height: 46.5, qty: 25, weight: 1, rotate: true, flip: true });
    return;
  }
  if (demo === "reported") {
    els.margin.value = 0;
    els.smartMix.checked = true;
    els.mixed360.checked = params.get("mix360") === "1";
    createPacket({ name: "Packet 1", length: 64, width: 42.4, height: 22, qty: 253, weight: 1, rotate: true, flip: false });
    createPacket({ name: "Packet 2", length: 28, width: 28, height: 45, qty: 1470, weight: 1, rotate: true, flip: false });
    return;
  }
  createPacket({ name: "Packet 1", length: 56, width: 34, height: 46.5, qty: 25, weight: 1, rotate: true, flip: false });
}

setContainer("40hq");
loadInitialPackets();
initThree();
update();
