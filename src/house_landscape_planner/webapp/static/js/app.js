const state = {
    assessment: null,
    neo4jParcels: [],
    selectedKind: "parcel",
    selectedId: "parcel",
    activeView: "parcel",
    reportMarkdown: "",
    detailZoom: 1,
    gardenInteraction: null,
    housePlanInteraction: null,
    floorPlanInteraction: null,
    persistenceMode: "session",
    currentNeo4jParcelId: null,
    currentNeo4jDatabase: null,
};

const DETAIL_ZOOM_MIN = 0.5;
const DETAIL_ZOOM_MAX = 10;
const DETAIL_ZOOM_STEP = 0.1;
const FLOOR_VIEW_CONFIGS = [
    { key: "basement", label: "Basement", matchers: ["basement", "lower level", "cellar"] },
    { key: "first-floor", label: "First Floor", matchers: ["first floor", "1st floor", "main floor", "main level", "ground floor"] },
    { key: "second-floor", label: "Second Floor", matchers: ["second floor", "2nd floor", "upper level", "upper floor"] },
];

document.addEventListener("DOMContentLoaded", () => {
    setupTheme();
    setupTabs();
    setupSectionToggles();
    setupSplitters();
    setupForm();
    setupActions();
    setupViewToggle();
    setupZoomControls();
    setupGardenEditing();
    setupHousePlanEditing();
    setupFloorPlanEditing();
    loadNeo4jParcelOptions();
});

function setupTheme() {
    document.getElementById("theme-toggle").addEventListener("click", () => {
        const isLight = document.documentElement.classList.toggle("light-mode");
        localStorage.setItem("house-plan-theme", isLight ? "light" : "dark");
        if (state.assessment) {
            renderInteractiveDiagram();
        }
    });
}

function setupTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    const contents = document.querySelectorAll(".tab-content");
    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            buttons.forEach((item) => item.classList.remove("active"));
            contents.forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            document.getElementById(`${button.dataset.tab}-tab`).classList.add("active");
        });
    });
}

function setupSectionToggles() {
    document.querySelectorAll("[data-section-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            const target = document.getElementById(button.dataset.sectionToggle);
            if (!target) {
                return;
            }
            const collapsed = target.classList.toggle("collapsed");
            button.setAttribute("aria-expanded", String(!collapsed));
            button.scrollIntoView({ block: "nearest" });
        });
    });
}

function setupSplitters() {
    const leftPanel = document.querySelector(".left-panel");
    const middlePanel = document.querySelector(".middle-panel");
    const rightPanel = document.querySelector(".right-panel");
    const leftSplitter = document.getElementById("left-splitter");
    const rightSplitter = document.getElementById("right-splitter");

    if (!leftPanel || !middlePanel || !rightPanel || !leftSplitter || !rightSplitter) {
        return;
    }

    let activeSplitter = null;

    const startDrag = (splitter) => {
        if (window.innerWidth <= 860) {
            return;
        }
        activeSplitter = splitter;
        splitter.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    };

    const stopDrag = () => {
        if (!activeSplitter) {
            return;
        }
        activeSplitter.classList.remove("dragging");
        activeSplitter = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    };

    const onDrag = (event) => {
        if (!activeSplitter || window.innerWidth <= 860) {
            return;
        }

        const container = document.querySelector(".main-content");
        const rect = container.getBoundingClientRect();

        if (activeSplitter === leftSplitter) {
            const newWidth = Math.max(240, Math.min(520, event.clientX - rect.left));
            leftPanel.style.width = `${newWidth}px`;
        }

        if (activeSplitter === rightSplitter) {
            const newWidth = Math.max(260, Math.min(520, rect.right - event.clientX));
            rightPanel.style.width = `${newWidth}px`;
        }
    };

    leftSplitter.addEventListener("mousedown", () => startDrag(leftSplitter));
    rightSplitter.addEventListener("mousedown", () => startDrag(rightSplitter));
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
}

function setupForm() {
    const form = document.getElementById("analysis-form");
    const parcelInput = document.getElementById("parcel-file");

    parcelInput.addEventListener("change", updateFileSummary);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await loadCurrentFile();
    });

    document.getElementById("reset-button").addEventListener("click", () => {
        form.reset();
        state.assessment = null;
        state.selectedKind = "parcel";
        state.selectedId = "parcel";
        state.activeView = "parcel";
        state.reportMarkdown = "";
        state.detailZoom = 1;
        state.gardenInteraction = null;
        state.housePlanInteraction = null;
        state.floorPlanInteraction = null;
        state.persistenceMode = "session";
        state.currentNeo4jParcelId = null;
        state.currentNeo4jDatabase = null;
        document.getElementById("download-report").disabled = true;
        updateStatus("Ready for parcel analysis", false);
        updateFileSummary();
        resetResults();
    });
}

function setupActions() {
    document.getElementById("download-report").addEventListener("click", downloadReport);
    document.getElementById("load-neo4j").addEventListener("click", loadSelectedNeo4jParcel);
    document.getElementById("load-house-gis").addEventListener("click", loadHouseFootprintFromGis);
    document.getElementById("add-house-plan").addEventListener("click", addHousePlan);
    document.getElementById("remove-house-plan").addEventListener("click", removeHousePlan);
    document.getElementById("add-room").addEventListener("click", addFloorRoom);
    document.getElementById("add-house-vertex").addEventListener("click", addHousePlanVertex);
    document.getElementById("remove-house-vertex").addEventListener("click", removeHousePlanVertex);
    document.getElementById("save-features").addEventListener("click", saveFeatures);
    document.getElementById("remove-feature").addEventListener("click", removeSelectedFeature);
}

function setupViewToggle() {
    document.getElementById("view-parcel").addEventListener("click", () => {
        state.activeView = "parcel";
        renderActiveView();
    });
    document.getElementById("view-garden").addEventListener("click", () => {
        state.activeView = "garden";
        renderActiveView();
    });
    document.getElementById("view-patio").addEventListener("click", () => {
        state.activeView = "patio";
        renderActiveView();
    });
    document.getElementById("view-basement").addEventListener("click", () => {
        state.activeView = "basement";
        renderActiveView();
    });
    document.getElementById("view-first-floor").addEventListener("click", () => {
        state.activeView = "first-floor";
        renderActiveView();
    });
    document.getElementById("view-second-floor").addEventListener("click", () => {
        state.activeView = "second-floor";
        renderActiveView();
    });
    renderActiveView();
}

function setupGardenEditing() {
    ["garden-canvas", "patio-canvas"].forEach((canvasId) => {
        const canvas = document.getElementById(canvasId);
        canvas.addEventListener("pointerdown", (event) => {
            const target = event.target.closest("[data-feature-action]");
            if (!target || !state.assessment) {
                return;
            }

            const featureId = target.dataset.id;
            const action = target.dataset.featureAction;
            if (!featureId || !action) {
                return;
            }

            const feature = getFeatureObjectById(featureId);
            if (!feature) {
                return;
            }

            if (state.selectedKind !== "feature" || state.selectedId !== featureId) {
                state.selectedKind = "feature";
                state.selectedId = featureId;
                state.activeView = canvasId === "patio-canvas" ? "patio" : "garden";
                renderSelection();
            }

            const svg = canvas.querySelector("svg");
            if (!svg) {
                return;
            }

            event.preventDefault();
            const context = getGardenEditContext();
            const pointer = clientPointToSvg(svg, event.clientX, event.clientY);
            state.gardenInteraction = {
                mode: action,
                featureId,
                pointerId: event.pointerId,
                sourceCanvasId: canvasId,
                startPointer: pointer,
                startProperties: {
                    anchor_x_ratio: Number(feature.properties.anchor_x_ratio || 0.5),
                    anchor_y_ratio: Number(feature.properties.anchor_y_ratio || 0.5),
                    width_ratio: Number(feature.properties.width_ratio || 0.12),
                    height_ratio: Number(feature.properties.height_ratio || 0.12),
                    rotation_degrees: Number(feature.properties.rotation_degrees ?? getParcelRotation(context.vertexPoints)),
                },
                context,
            };

            if (typeof target.setPointerCapture === "function") {
                target.setPointerCapture(event.pointerId);
            }
        });
    });

    window.addEventListener("pointermove", handleGardenPointerMove);
    window.addEventListener("pointerup", stopGardenInteraction);
    window.addEventListener("pointercancel", stopGardenInteraction);
}

function setupHousePlanEditing() {
    const canvas = document.getElementById("detail-canvas");
    canvas.addEventListener("pointerdown", (event) => {
        const target = event.target.closest("[data-house-plan-action]");
        if (!target || !state.assessment) {
            return;
        }

        const action = target.dataset.housePlanAction;
        const housePoints = state.assessment.house_plan_points || [];
        if (!action || !housePoints.length) {
            return;
        }

        const svg = canvas.querySelector("svg");
        if (!svg) {
            return;
        }

        const pointIndex = Number(target.dataset.index);
        if (action === "move-vertex" && !Number.isInteger(pointIndex)) {
            return;
        }

        if (action === "move-plan") {
            state.selectedKind = "house";
            state.selectedId = "house";
        } else if (action === "move-vertex") {
            state.selectedKind = "house-vertex";
            state.selectedId = getHouseVertexId(pointIndex);
        }

        event.preventDefault();
        const pointer = clientPointToSvg(svg, event.clientX, event.clientY);
        state.housePlanInteraction = {
            mode: action,
            pointIndex,
            pointerId: event.pointerId,
            startPointer: pointer,
            startPoints: housePoints.map((point) => [...point]),
            geometry: buildDiagramGeometry(state.assessment.parcel_boundary_points || []),
            bounds: getSourceBounds(state.assessment.parcel_boundary_points || []),
        };
        renderSelection();

        if (typeof target.setPointerCapture === "function") {
            target.setPointerCapture(event.pointerId);
        }
    });

    window.addEventListener("pointermove", handleHousePlanPointerMove);
    window.addEventListener("pointerup", stopHousePlanInteraction);
    window.addEventListener("pointercancel", stopHousePlanInteraction);
}

function setupFloorPlanEditing() {
    ["basement-canvas", "first-floor-canvas", "second-floor-canvas"].forEach((canvasId) => {
        const canvas = document.getElementById(canvasId);
        canvas.addEventListener("pointerdown", (event) => {
            const target = event.target.closest("[data-kind='room'], [data-floor-action]");
            if (!target || !state.assessment) {
                return;
            }

            const roomId = target.dataset.id || target.dataset.roomId;
            const room = state.assessment.objects.rooms.find((item) => item.id === roomId);
            if (!room) {
                return;
            }

            const levelKey = mapLevelNameToView(room.properties.level_name);
            state.selectedKind = "room";
            state.selectedId = room.id;
            state.activeView = levelKey;

            const action = target.dataset.floorAction;
            if (!action) {
                renderSelection();
                return;
            }

            const svg = canvas.querySelector("svg");
            if (!svg) {
                renderSelection();
                return;
            }

            const shellBox = buildFloorShellBox(state.assessment.house_plan_points || []);
            const pointer = clientPointToSvg(svg, event.clientX, event.clientY);
            state.floorPlanInteraction = {
                roomId: room.id,
                levelKey,
                mode: action,
                pointerId: event.pointerId,
                startPointer: pointer,
                startLayout: {
                    x: Number(room.properties.floor_x_ratio || 0.1),
                    y: Number(room.properties.floor_y_ratio || 0.1),
                    width: Number(room.properties.floor_width_ratio || 0.3),
                    height: Number(room.properties.floor_height_ratio || 0.2),
                },
                shellBox,
            };

            if (typeof target.setPointerCapture === "function") {
                target.setPointerCapture(event.pointerId);
            }

            event.preventDefault();
            renderSelection();
        });
    });

    window.addEventListener("pointermove", handleFloorPlanPointerMove);
    window.addEventListener("pointerup", stopFloorPlanInteraction);
    window.addEventListener("pointercancel", stopFloorPlanInteraction);
}

function setupZoomControls() {
    const zoomSlider = document.getElementById("zoom-slider");

    document.getElementById("zoom-in").addEventListener("click", () => adjustDetailZoom(DETAIL_ZOOM_STEP));
    document.getElementById("zoom-out").addEventListener("click", () => adjustDetailZoom(-DETAIL_ZOOM_STEP));
    document.getElementById("zoom-reset").addEventListener("click", () => setDetailZoom(1));
    zoomSlider.addEventListener("input", () => setDetailZoom(Number(zoomSlider.value)));

    ["detail-canvas", "garden-canvas", "patio-canvas", "basement-canvas", "first-floor-canvas", "second-floor-canvas"].forEach((canvasId) => {
        document.getElementById(canvasId).addEventListener("wheel", (event) => {
            if (!event.ctrlKey && !event.metaKey) {
                return;
            }
            event.preventDefault();
            adjustDetailZoom(event.deltaY < 0 ? DETAIL_ZOOM_STEP : -DETAIL_ZOOM_STEP);
        }, { passive: false });
    });

    updateZoomControls();
}

async function analyzeCurrentFiles() {
    const parcelFile = document.getElementById("parcel-file").files[0];

    if (!parcelFile) {
        updateStatus("Choose a parcel GeoJSON before loading.", true);
        return;
    }

    const formData = new FormData();
    formData.append("parcel", parcelFile);

    updateStatus("Loading parcel, edges, and vertices...", false);

    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            body: formData,
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.detail || "Load failed.");
        }
        state.currentNeo4jParcelId = null;
        state.currentNeo4jDatabase = null;
        applyAssessment(payload);
        updateStatus(`Loaded ${payload.parcel_name}.`, false);
    } catch (error) {
        updateStatus(error.message, true);
    }
}

async function loadCurrentFile() {
    await analyzeCurrentFiles();
}

async function loadNeo4jParcelOptions() {
    const select = document.getElementById("neo4j-parcel-select");
    const database = document.getElementById("database-name").value || "hp62n";
    updateStatus(`Loading parcel catalog from ${database}...`, false);
    try {
        const response = await fetch(`/api/neo4j/parcels?database=${encodeURIComponent(database)}`);
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.detail || "Unable to load parcel catalog.");
        }
        state.neo4jParcels = payload;
        renderNeo4jParcelOptions();
        if (payload.length) {
            select.value = payload[0].parcel_id;
            await loadSelectedNeo4jParcel();
        } else {
            updateStatus(`No parcels found in ${database}.`, true);
        }
    } catch (error) {
        updateStatus(error.message, true);
        select.innerHTML = '<option value="">No parcels available</option>';
    }
}

function renderNeo4jParcelOptions() {
    const select = document.getElementById("neo4j-parcel-select");
    if (!state.neo4jParcels.length) {
        select.innerHTML = '<option value="">No parcels available</option>';
        return;
    }
    select.innerHTML = state.neo4jParcels.map((item) => (
        `<option value="${escapeHtml(item.parcel_id)}">${escapeHtml(item.label)} (${item.vertex_count} vertices)</option>`
    )).join("");
}

async function loadSelectedNeo4jParcel() {
    const select = document.getElementById("neo4j-parcel-select");
    const parcelId = select.value;
    const database = document.getElementById("database-name").value || "hp62n";
    if (!parcelId) {
        updateStatus("Choose a Neo4j parcel first.", true);
        return;
    }

    updateStatus(`Loading ${parcelId} from ${database}...`, false);
    try {
        const response = await fetch(`/api/neo4j/parcels/${encodeURIComponent(parcelId)}?database=${encodeURIComponent(database)}`);
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.detail || "Unable to load parcel from Neo4j.");
        }
        state.currentNeo4jParcelId = parcelId;
        state.currentNeo4jDatabase = database;
        applyAssessment(payload);
        updateStatus(`Loaded ${parcelId} from ${database}.`, false);
    } catch (error) {
        updateStatus(error.message, true);
    }
}

function applyAssessment(payload) {
    ensureHousePlanModel(payload);
    ensureFloorPlanModel(payload);
    state.assessment = payload;
    state.persistenceMode = payload.persistence_mode || "session";
    state.selectedKind = "parcel";
    state.selectedId = "parcel";
    state.activeView = "parcel";
    state.reportMarkdown = payload.report_markdown;
    state.detailZoom = 1;
    state.floorPlanInteraction = null;
    document.getElementById("download-report").disabled = false;

    renderCatalog();
    renderMetricSnapshot();
    renderList("assumptions-list", payload.assumptions);
    renderList("recommendations-list", payload.recommendations);
    renderZonesSummary();
    renderMarkdown(payload.report_markdown);
    renderSelection();
}

function ensureHousePlanModel(payload) {
    if (!Array.isArray(payload.house_plan_points)) {
        payload.house_plan_points = [];
    } else if (payload.house_plan_points.length > 0 && payload.house_plan_points.length < 3) {
        payload.house_plan_points = [];
    }
    syncHousePlanObjects(payload);
}

function ensureFloorPlanModel(payload) {
    if (!payload.objects) {
        payload.objects = {};
    }
    if (!Array.isArray(payload.objects.rooms)) {
        payload.objects.rooms = [];
    }

    payload.objects.rooms.forEach((room) => normalizeRoomFloorAssignment(room));
    payload.objects.rooms = mergeGeneratedFloorRooms(payload, payload.objects.rooms);
    payload.objects.rooms.forEach((room, index) => {
        ensureRoomFloorLayout(payload, room, index);
    });
}

function normalizeRoomFloorAssignment(room) {
    const roomType = String(room?.properties?.room_type || "").trim().toLowerCase();
    if (roomType !== "garage") {
        return;
    }
    room.properties.level_name = "First Floor";
    if (room.subtitle) {
        room.subtitle = room.subtitle.replace(/^[^|]+/, "First Floor");
    }
}

function mergeGeneratedFloorRooms(payload, rooms) {
    const baseRooms = rooms.filter((room) => !room.properties?.generated_floor_room);
    const byLevel = new Map();
    baseRooms.forEach((room) => {
        const levelKey = mapLevelNameToView(room.properties.level_name);
        if (!byLevel.has(levelKey)) {
            byLevel.set(levelKey, []);
        }
        byLevel.get(levelKey).push(room);
    });

    const generated = [];
    FLOOR_VIEW_CONFIGS.forEach((config) => {
        if ((byLevel.get(config.key) || []).length) {
            return;
        }
        buildGeneratedRoomsForLevel(payload, config.key).forEach((room) => generated.push(room));
    });

    const firstFloorRooms = byLevel.get("first-floor") || [];
    const hasGarage = firstFloorRooms.some((room) => String(room.properties.room_type || "").toLowerCase() === "garage");
    if (firstFloorRooms.length && !hasGarage) {
        const garageRoom = buildGeneratedRoomsForLevel(payload, "first-floor")
            .find((room) => String(room.properties.room_type || "").toLowerCase() === "garage");
        if (garageRoom) {
            generated.push(garageRoom);
        }
    }

    return [...baseRooms, ...generated];
}

function buildGeneratedRoomsForLevel(payload, levelKey) {
    const levelLabel = getFloorLevelLabel(levelKey);
    const area = Number(payload.objects.housePlan?.properties?.area || payload.metrics?.area || 0);
    const areaUnit = payload.objects.housePlan?.properties?.area_unit || "sq ft";
    const linearUnit = payload.objects.housePlan?.properties?.linear_unit || payload.metrics?.linear_unit || "feet";
    const houseWidth = Number(payload.objects.housePlan?.properties?.width || 0);
    const houseHeight = Number(payload.objects.housePlan?.properties?.height || 0);
    const templates = {
        basement: [
            ["basement-rec", "Recreation Room", "recreation", 0.44, 0.06, 0.08, 0.58, 0.50],
            ["basement-storage", "Storage", "storage", 0.20, 0.67, 0.08, 0.24, 0.26],
            ["basement-mech", "Mechanical", "mechanical", 0.14, 0.67, 0.38, 0.24, 0.20],
            ["basement-laundry", "Laundry", "laundry", 0.12, 0.67, 0.64, 0.24, 0.18],
        ],
        "first-floor": [
            ["first-living", "Living Room", "living_room", 0.18, 0.08, 0.08, 0.28, 0.24],
            ["first-kitchen", "Kitchen", "kitchen", 0.14, 0.44, 0.08, 0.20, 0.16],
            ["first-dining", "Dining", "dining", 0.12, 0.44, 0.30, 0.20, 0.16],
            ["first-bath", "Bath", "bathroom", 0.06, 0.08, 0.38, 0.12, 0.12],
            ["first-garage", "Double Car Garage", "garage", 0.34, 0.18, 0.60, 0.64, 0.24],
        ],
        "second-floor": [
            ["second-bed-1", "Bedroom 2", "bedroom", 0.28, 0.07, 0.08, 0.34, 0.28],
            ["second-bed-2", "Bedroom 3", "bedroom", 0.28, 0.07, 0.44, 0.34, 0.28],
            ["second-bath", "Bath", "bathroom", 0.12, 0.46, 0.08, 0.18, 0.18],
            ["second-study", "Study", "office", 0.16, 0.46, 0.34, 0.18, 0.18],
            ["second-primary", "Primary Suite", "bedroom", 0.30, 0.67, 0.08, 0.22, 0.54],
        ],
    };

    return (templates[levelKey] || []).map(([suffix, label, roomType, share, xRatio, yRatio, widthRatio, heightRatio], index) => ({
        kind: "room",
        id: `generated-${suffix}-${index + 1}`,
        label,
        subtitle: `${levelLabel} | ${roomType.replaceAll("_", " ")}`,
        description: `Blueprint room placeholder for the ${levelLabel.toLowerCase()} plan.`,
        properties: {
            room_id: `generated-${suffix}-${index + 1}`,
            room_type: roomType,
            level_name: levelLabel,
            area: roundValue(area * share, 2),
            area_unit: areaUnit,
            width: roundValue(houseWidth * widthRatio, 2),
            height: roundValue(houseHeight * heightRatio, 2),
            linear_unit: linearUnit,
            notes: `Generated ${levelLabel.toLowerCase()} room placeholder.`,
            generated_floor_room: true,
            floor_x_ratio: xRatio,
            floor_y_ratio: yRatio,
            floor_width_ratio: widthRatio,
            floor_height_ratio: heightRatio,
        },
    }));
}

function ensureRoomFloorLayout(payload, room) {
    const levelKey = mapLevelNameToView(room.properties.level_name);
    const roomsForLevel = payload.objects.rooms.filter((item) => mapLevelNameToView(item.properties.level_name) === levelKey);
    const roomIndex = roomsForLevel.findIndex((item) => item.id === room.id);
    const columns = roomsForLevel.length <= 1 ? 1 : 2;
    const rows = Math.ceil(roomsForLevel.length / columns);
    const column = roomIndex % columns;
    const row = Math.floor(roomIndex / columns);
    const pad = 0.06;
    const cellWidth = (1 - (pad * (columns + 1))) / columns;
    const cellHeight = (1 - (pad * (rows + 1))) / rows;

    room.properties.floor_x_ratio ??= roundValue(pad + (column * (cellWidth + pad)), 4);
    room.properties.floor_y_ratio ??= roundValue(pad + (row * (cellHeight + pad)), 4);
    room.properties.floor_width_ratio ??= roundValue(cellWidth, 4);
    room.properties.floor_height_ratio ??= roundValue(cellHeight, 4);
}

function syncHousePlanObjects(payload) {
    const housePoints = Array.isArray(payload.house_plan_points) ? payload.house_plan_points : [];
    const linearUnit = payload.metrics?.linear_unit || payload.linear_unit || "feet";
    const areaUnit = (payload.metrics?.area_unit || "square feet") === "square feet" ? "sq ft" : (payload.metrics?.area_unit || "square feet");

    if (!housePoints.length) {
        payload.objects.housePlan = null;
        payload.objects.houseVertices = [];
        return;
    }

    const bounds = getSourceBounds(housePoints);
    const width = roundValue(bounds.maxX - bounds.minX, 2);
    const height = roundValue(bounds.maxY - bounds.minY, 2);
    const area = roundValue(computePolygonArea(housePoints), 2);
    const perimeter = roundValue(computePolygonPerimeter(housePoints), 2);

    payload.objects.housePlan = {
        kind: "house",
        id: "house",
        label: "House",
        subtitle: `${housePoints.length} edges | ${formatNumber(area)} ${areaUnit}`,
        description: "Editable house footprint placed inside the parcel as the current building model.",
        properties: {
            house_id: payload.parcel_properties?.PARCELID ? `${payload.parcel_properties.PARCELID}-house-1` : "house-1",
            source: payload.persistence_mode === "neo4j" ? "neo4j_house_graph" : "session_house_model",
            vertex_count: housePoints.length,
            edge_count: housePoints.length,
            width,
            height,
            perimeter,
            area,
            linear_unit: linearUnit,
            area_unit: areaUnit,
        },
    };

    payload.objects.houseVertices = housePoints.map((point, index) => ({
        kind: "house-vertex",
        id: getHouseVertexId(index),
        label: `House Vertex ${index + 1}`,
        subtitle: `${formatNumber(point[0])}, ${formatNumber(point[1])}`,
        description: "Editable vertex on the house footprint.",
        properties: {
            linear_unit: linearUnit,
            source_x: roundValue(point[0], 4),
            source_y: roundValue(point[1], 4),
            vertex_index: index + 1,
        },
    }));
}

function buildDefaultHousePlanPoints(parcelPoints) {
    const points = normalizePolygonPoints(parcelPoints);
    if (points.length < 3) {
        return [];
    }

    const bounds = getSourceBounds(points);
    const spanX = Math.max(bounds.maxX - bounds.minX, 1);
    const spanY = Math.max(bounds.maxY - bounds.minY, 1);
    const insetX = spanX * 0.24;
    const insetY = spanY * 0.24;

    return [
        [bounds.minX + insetX, bounds.minY + insetY],
        [bounds.maxX - insetX, bounds.minY + insetY],
        [bounds.maxX - insetX, bounds.maxY - insetY],
        [bounds.minX + insetX, bounds.maxY - insetY],
    ].map((point) => point.map((value) => roundValue(value, 4)));
}

function renderCatalog() {
    const {
        parcel,
        contours,
        edges,
        vertices,
        features,
        rooms,
        utilities,
        housePlan,
        houseVertices = [],
    } = state.assessment.objects;
    const patioFeatures = getPatioFeatures();
    document.getElementById("parcel-count").textContent = "1";
    document.getElementById("contour-count").textContent = String(contours.length);
    document.getElementById("edge-count").textContent = String(edges.length);
    document.getElementById("vertex-count").textContent = String(vertices.length);
    document.getElementById("house-plan-count").textContent = housePlan ? "1" : "0";
    document.getElementById("house-vertex-count").textContent = String(houseVertices.length);
    document.getElementById("room-count").textContent = String(rooms.length);
    document.getElementById("utility-count").textContent = String(utilities.length);
    document.getElementById("feature-count").textContent = String(features.length);
    document.getElementById("patio-count").textContent = String(patioFeatures.length);

    document.getElementById("parcel-list").innerHTML = renderCatalogItem(parcel);
    document.getElementById("contour-list").innerHTML = contours.length
        ? contours.map(renderCatalogItem).join("")
        : '<div class="placeholder">Load parcel elevation to view contour objects.</div>';
    document.getElementById("edge-list").innerHTML = edges.map(renderCatalogItem).join("");
    document.getElementById("vertex-list").innerHTML = vertices.map(renderCatalogItem).join("");
    document.getElementById("house-plan-list").innerHTML = housePlan
        ? renderCatalogItem(housePlan)
        : '<div class="placeholder">Add a house object to start editing the footprint.</div>';
    document.getElementById("house-vertex-list").innerHTML = houseVertices.length
        ? houseVertices.map(renderCatalogItem).join("")
        : '<div class="placeholder">House footprint vertices will appear here.</div>';
    document.getElementById("room-list").innerHTML = rooms.length
        ? rooms.map(renderCatalogItem).join("")
        : '<div class="placeholder">Room objects will appear here.</div>';
    document.getElementById("utility-list").innerHTML = utilities.length
        ? utilities.map(renderCatalogItem).join("")
        : '<div class="placeholder">Utility connections will appear here.</div>';
    document.getElementById("feature-list").innerHTML = features.map(renderCatalogItem).join("");
    document.getElementById("patio-list").innerHTML = patioFeatures.length
        ? patioFeatures.map(renderCatalogItem).join("")
        : '<div class="placeholder">No patio design features available for this parcel.</div>';

    document.querySelectorAll(".catalog-item").forEach((item) => {
        item.addEventListener("click", () => {
            setSelection(item.dataset.kind, item.dataset.id);
        });
    });
    syncCatalogSelection();
}

function renderCatalogItem(item) {
    return `
        <button class="catalog-item" data-kind="${escapeHtml(item.kind)}" data-id="${escapeHtml(item.id)}" type="button">
            <span class="catalog-kind">${escapeHtml(item.kind)}</span>
            <div class="catalog-label">${escapeHtml(item.label)}</div>
            <div class="catalog-subtitle">${escapeHtml(item.subtitle)}</div>
        </button>
    `;
}

function setSelection(kind, id) {
    state.selectedKind = kind;
    state.selectedId = id;
    if (kind === "feature") {
        state.activeView = isPatioFeature(id) ? "patio" : "garden";
    } else if (kind === "room") {
        const room = state.assessment?.objects.rooms.find((item) => item.id === id) || null;
        state.activeView = room ? mapLevelNameToView(room.properties.level_name) : "first-floor";
    } else {
        state.activeView = "parcel";
    }
    renderSelection();
}

function renderSelection() {
    const item = getSelectedObject();
    if (!item) {
        return;
    }

    syncCatalogSelection();
    renderActiveView();
    renderInteractiveDiagram();
    renderDetailSummary(item);
    renderProperties(item);
    updateFeatureActions();
}

function renderActiveView() {
    const isParcel = state.activeView === "parcel";
    const isGarden = state.activeView === "garden";
    const isPatio = state.activeView === "patio";
    const isBasement = state.activeView === "basement";
    const isFirstFloor = state.activeView === "first-floor";
    const isSecondFloor = state.activeView === "second-floor";
    document.getElementById("view-parcel").classList.toggle("active", isParcel);
    document.getElementById("view-garden").classList.toggle("active", isGarden);
    document.getElementById("view-patio").classList.toggle("active", isPatio);
    document.getElementById("view-basement").classList.toggle("active", isBasement);
    document.getElementById("view-first-floor").classList.toggle("active", isFirstFloor);
    document.getElementById("view-second-floor").classList.toggle("active", isSecondFloor);
    document.getElementById("parcel-view-panel").classList.toggle("active", isParcel);
    document.getElementById("garden-view-panel").classList.toggle("active", isGarden);
    document.getElementById("patio-view-panel").classList.toggle("active", isPatio);
    document.getElementById("basement-view-panel").classList.toggle("active", isBasement);
    document.getElementById("first-floor-view-panel").classList.toggle("active", isFirstFloor);
    document.getElementById("second-floor-view-panel").classList.toggle("active", isSecondFloor);
    updateZoomControls();
}

function syncCatalogSelection() {
    document.querySelectorAll(".catalog-item").forEach((item) => {
        const matches = item.dataset.kind === state.selectedKind && item.dataset.id === state.selectedId;
        item.classList.toggle("selected", matches);
    });
}

function renderInteractiveDiagram() {
    const parcelCanvas = document.getElementById("detail-canvas");
    const gardenCanvas = document.getElementById("garden-canvas");
    const patioCanvas = document.getElementById("patio-canvas");
    const basementCanvas = document.getElementById("basement-canvas");
    const firstFloorCanvas = document.getElementById("first-floor-canvas");
    const secondFloorCanvas = document.getElementById("second-floor-canvas");
    parcelCanvas.innerHTML = buildParcelSvg(state.assessment);
    gardenCanvas.innerHTML = buildGardenSvg(state.assessment);
    patioCanvas.innerHTML = buildPatioSvg(state.assessment);
    basementCanvas.innerHTML = buildFloorPlanSvg(state.assessment, "basement");
    firstFloorCanvas.innerHTML = buildFloorPlanSvg(state.assessment, "first-floor");
    secondFloorCanvas.innerHTML = buildFloorPlanSvg(state.assessment, "second-floor");

    [parcelCanvas, gardenCanvas, patioCanvas, basementCanvas, firstFloorCanvas, secondFloorCanvas].forEach((canvas) => {
        canvas.querySelectorAll("[data-kind][data-id]").forEach((element) => {
            element.addEventListener("click", () => {
                setSelection(element.dataset.kind, element.dataset.id);
            });
        });
    });

    updateZoomControls();
}

function buildParcelSvg(data) {
    const points = data.parcel_boundary_points || [];
    if (!points.length) {
        return '<div class="placeholder">Interactive parcel diagram will appear here.</div>';
    }

    const { width, height, vertexPoints, polygonPoints, project } = buildDiagramGeometry(points);
    const selectedParcel = state.selectedKind === "parcel" ? "selected" : "";
    const contourLines = data.objects.contours.map((contour) => buildContourSvg(contour, project)).join("");
    const housePlanSvg = buildHousePlanSvg(data, project);

    const edgeLines = data.objects.edges.map((edge, index) => {
        const start = vertexPoints[index];
        const end = vertexPoints[(index + 1) % vertexPoints.length];
        const selected = state.selectedKind === "edge" && state.selectedId === edge.id ? "selected" : "";
        const labelX = (start.x + end.x) / 2;
        const labelY = ((start.y + end.y) / 2) - 10;
        return `
            <line class="edge-line ${selected}" data-kind="edge" data-id="${escapeHtml(edge.id)}"
                x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}"
                x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" />
            <text class="canvas-label zoom-stable-label" text-anchor="middle"
                transform="${buildStableLabelTransform(labelX, labelY)}">${index + 1}</text>
        `;
    }).join("");

    const vertexDots = data.objects.vertices.map((vertex, index) => {
        const point = vertexPoints[index];
        const selected = state.selectedKind === "vertex" && state.selectedId === vertex.id ? "selected" : "";
        return `
            <circle class="vertex-dot ${selected}" data-kind="vertex" data-id="${escapeHtml(vertex.id)}"
                cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${buildStableCircleRadius(4)}" />
            <text class="canvas-label zoom-stable-label"
                transform="${buildStableLabelTransform(point.x + 10, point.y - 10)}">${index + 1}</text>
        `;
    }).join("");

    return buildSvgFrame(width, height, `
        <polygon class="parcel-fill ${selectedParcel}" data-kind="parcel" data-id="parcel" points="${polygonPoints}"></polygon>
        ${contourLines}
        ${housePlanSvg}
        ${edgeLines}
        ${vertexDots}
    `);
}

function buildContourSvg(contour, project) {
    const pathMarkup = (contour.properties.paths || []).map((pathPoints, pathIndex) => {
        const projected = pathPoints.map((point) => project([Number(point[0]), Number(point[1])]));
        if (projected.length < 2) {
            return "";
        }
        const d = projected.map((point, index) => (
            `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
        )).join(" ");
        const selected = state.selectedKind === "contour" && state.selectedId === contour.id ? "selected" : "";
        return `<path class="contour-line ${selected}" data-kind="contour" data-id="${escapeHtml(contour.id)}" data-path-index="${pathIndex}" d="${d}"></path>`;
    }).join("");
    return pathMarkup;
}

function buildGardenSvg(data) {
    const points = data.parcel_boundary_points || [];
    if (!points.length) {
        return '<div class="placeholder">Garden design diagram will appear here.</div>';
    }

    const { width, height, vertexPoints, polygonPoints, project } = buildDiagramGeometry(points);
    const left = Math.min(...vertexPoints.map((point) => point.x));
    const right = Math.max(...vertexPoints.map((point) => point.x));
    const top = Math.min(...vertexPoints.map((point) => point.y));
    const bottom = Math.max(...vertexPoints.map((point) => point.y));
    const boxWidth = Math.max(right - left, 1);
    const boxHeight = Math.max(bottom - top, 1);
    const parcelRotation = getParcelRotation(vertexPoints);
    const housePlanSvg = buildHousePlanSvg(data, project);
    const featureShapes = data.objects.features.map((feature) => (
        buildFeatureSvg(feature, left, top, boxWidth, boxHeight, parcelRotation)
    )).join("");

    return buildSvgFrame(width, height, `
        <defs>
            <clipPath id="garden-clip">
                <polygon points="${polygonPoints}"></polygon>
            </clipPath>
        </defs>
        <polygon class="parcel-fill" data-kind="parcel" data-id="parcel" points="${polygonPoints}"></polygon>
        <g clip-path="url(#garden-clip)">
            ${housePlanSvg}
            ${featureShapes}
        </g>
    `);
}

function buildHousePlanSvg(data, project) {
    const housePoints = (data.house_plan_points || []).map(project);
    if (!housePoints.length) {
        return "";
    }

    const polygonPoints = housePoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const selectedPlan = state.selectedKind === "house" ? "selected" : "";
    const edgeMarkup = housePoints.map((point, index) => {
        const next = housePoints[(index + 1) % housePoints.length];
        return `
            <line class="house-plan-edge ${selectedPlan}"
                x1="${point.x.toFixed(1)}" y1="${point.y.toFixed(1)}"
                x2="${next.x.toFixed(1)}" y2="${next.y.toFixed(1)}"></line>
        `;
    }).join("");
    const vertexMarkup = housePoints.map((point, index) => {
        const selected = state.selectedKind === "house-vertex" && state.selectedId === getHouseVertexId(index) ? "selected" : "";
        return `
            <circle class="house-vertex-dot ${selected}" data-kind="house-vertex" data-id="${escapeHtml(getHouseVertexId(index))}" data-house-plan-action="move-vertex" data-index="${index}"
                cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${buildStableCircleRadius(4)}"></circle>
            <text class="canvas-label zoom-stable-label"
                transform="${buildStableLabelTransform(point.x + 8, point.y - 8)}">${index + 1}</text>
        `;
    }).join("");
    const outline = selectedPlan ? `<polygon class="house-plan-outline" points="${polygonPoints}"></polygon>` : "";

    return `
        ${edgeMarkup}
        <polygon class="house-plan-fill ${selectedPlan}" data-kind="house" data-id="house" data-house-plan-action="move-plan" points="${polygonPoints}"></polygon>
        ${outline}
        ${vertexMarkup}
    `;
}

function buildPatioSvg(data) {
    const points = data.parcel_boundary_points || [];
    if (!points.length) {
        return '<div class="placeholder">Patio design diagram will appear here.</div>';
    }

    const { width, height, vertexPoints, polygonPoints, project } = buildDiagramGeometry(points);
    const left = Math.min(...vertexPoints.map((point) => point.x));
    const right = Math.max(...vertexPoints.map((point) => point.x));
    const top = Math.min(...vertexPoints.map((point) => point.y));
    const bottom = Math.max(...vertexPoints.map((point) => point.y));
    const boxWidth = Math.max(right - left, 1);
    const boxHeight = Math.max(bottom - top, 1);
    const parcelRotation = getParcelRotation(vertexPoints);
    const housePlanSvg = buildHousePlanSvg(data, project);
    const patioFeatures = getPatioFeatures();
    const featureShapes = patioFeatures.map((feature) => (
        buildFeatureSvg(feature, left, top, boxWidth, boxHeight, parcelRotation)
    )).join("");

    return buildSvgFrame(width, height, `
        <defs>
            <clipPath id="patio-clip">
                <polygon points="${polygonPoints}"></polygon>
            </clipPath>
        </defs>
        <polygon class="parcel-fill" data-kind="parcel" data-id="parcel" points="${polygonPoints}"></polygon>
        <g clip-path="url(#patio-clip)">
            ${housePlanSvg}
            ${featureShapes}
        </g>
    `);
}

function buildFloorPlanSvg(data, levelKey) {
    if (!(data.house_plan_points || []).length) {
        return '<div class="placeholder">Load or draw a house footprint to view floor plans.</div>';
    }

    const levelConfig = FLOOR_VIEW_CONFIGS.find((item) => item.key === levelKey) || FLOOR_VIEW_CONFIGS[1];
    const allRooms = data.objects.rooms || [];
    const levelRooms = allRooms.filter((room) => roomBelongsToFloor(room, levelKey));
    const shellBox = buildFloorShellBox(data.house_plan_points || []);
    const shellVertexCount = shellBox.vertexPoints.length;
    const roomMarkup = buildFloorRoomMarkup(levelRooms, shellBox);
    const virtualGarageMarkup = buildVirtualGarageMarkup(allRooms, shellBox, levelKey);
    const note = levelRooms.length
        ? `${levelRooms.length} rooms loaded | ${shellVertexCount} walls`
        : `No rooms loaded yet | ${shellVertexCount} walls`;

    return buildSvgFrame(shellBox.canvasWidth, shellBox.canvasHeight, `
        <defs>
            <pattern id="floor-grid-${levelKey}" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" class="floor-grid-minor"></path>
            </pattern>
            <clipPath id="floor-shell-clip-${levelKey}">
                <polygon points="${shellBox.polygonPoints}"></polygon>
            </clipPath>
        </defs>
        <rect class="floor-grid-surface" width="${shellBox.canvasWidth}" height="${shellBox.canvasHeight}" fill="url(#floor-grid-${levelKey})"></rect>
        <polygon class="floor-shell" data-kind="house" data-id="house" points="${shellBox.polygonPoints}"></polygon>
        ${virtualGarageMarkup}
        <g clip-path="url(#floor-shell-clip-${levelKey})">
            ${roomMarkup}
        </g>
        <text class="floor-level-label zoom-stable-label" transform="${buildStableLabelTransform(84, 34)}">${escapeHtml(levelConfig.label)}</text>
        <text class="floor-note zoom-stable-label" transform="${buildStableLabelTransform(84, 54)}">${escapeHtml(note)}</text>
    `);
}

function buildFloorRoomMarkup(rooms, shellBox) {
    if (!rooms.length) {
        return "";
    }

    return rooms.map((room, index) => {
        const x = shellBox.x + (shellBox.width * Number(room.properties.floor_x_ratio || 0.1));
        const y = shellBox.y + (shellBox.height * Number(room.properties.floor_y_ratio || 0.1));
        const roomWidth = shellBox.width * Number(room.properties.floor_width_ratio || 0.3);
        const roomHeight = shellBox.height * Number(room.properties.floor_height_ratio || 0.2);
        const selected = state.selectedKind === "room" && state.selectedId === room.id ? "selected" : "";
        const label = room.label.length > 18 ? `${room.label.slice(0, 18)}...` : room.label;
        const controls = selected ? buildFloorRoomControls(room.id, x, y, roomWidth, roomHeight) : "";
        return `
            <rect class="floor-room ${selected}" data-kind="room" data-id="${escapeHtml(room.id)}" data-floor-action="move-room"
                x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${roomWidth.toFixed(1)}" height="${roomHeight.toFixed(1)}"></rect>
            ${controls}
            <text class="floor-room-label zoom-stable-label" text-anchor="middle"
                transform="${buildStableLabelTransform(x + (roomWidth / 2), y + (roomHeight / 2))}">${escapeHtml(label)}</text>
        `;
    }).join("");
}

function buildVirtualGarageMarkup(allRooms, shellBox, levelKey) {
    if (levelKey === "first-floor") {
        return "";
    }
    const garageRoom = allRooms.find((room) => String(room?.properties?.room_type || "").toLowerCase() === "garage");
    if (!garageRoom) {
        return "";
    }

    const x = shellBox.x + (shellBox.width * Number(garageRoom.properties.floor_x_ratio || 0));
    const y = shellBox.y + (shellBox.height * Number(garageRoom.properties.floor_y_ratio || 0));
    const width = shellBox.width * Number(garageRoom.properties.floor_width_ratio || 0);
    const height = shellBox.height * Number(garageRoom.properties.floor_height_ratio || 0);
    if (width <= 0 || height <= 0) {
        return "";
    }

    return `
        <rect class="floor-virtual-cutout" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}"></rect>
        <line class="floor-virtual-line" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + width).toFixed(1)}" y2="${y.toFixed(1)}"></line>
    `;
}

function buildFloorShellBox(housePoints) {
    const canvasWidth = 920;
    const canvasHeight = 460;
    const margin = 48;
    const normalized = normalizePolygonPoints(housePoints);
    const centroid = getPolygonCentroid(normalized);
    let rotatedPoints = rotateSourcePoints(normalized, -getLongestEdgeAngle(normalized), centroid);
    let bounds = getSourceBounds(rotatedPoints);

    if ((bounds.maxX - bounds.minX) > (bounds.maxY - bounds.minY)) {
        rotatedPoints = rotateSourcePoints(rotatedPoints, 90, centroid);
        bounds = getSourceBounds(rotatedPoints);
    }

    const xs = rotatedPoints.map((point) => point[0]);
    const ys = rotatedPoints.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const scale = Math.min((canvasWidth - margin * 2) / spanX, (canvasHeight - margin * 2) / spanY);

    const project = (point) => ({
        x: margin + (point[0] - minX) * scale,
        y: canvasHeight - margin - (point[1] - minY) * scale,
    });

    const vertexPoints = rotatedPoints.map(project);
    const polygonPoints = vertexPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const projectedXs = vertexPoints.map((point) => point.x);
    const projectedYs = vertexPoints.map((point) => point.y);
    const boxMinX = Math.min(...projectedXs);
    const boxMaxX = Math.max(...projectedXs);
    const boxMinY = Math.min(...projectedYs);
    const boxMaxY = Math.max(...projectedYs);

    return {
        canvasWidth,
        canvasHeight,
        x: boxMinX,
        y: boxMinY,
        width: boxMaxX - boxMinX,
        height: boxMaxY - boxMinY,
        vertexPoints,
        polygonPoints,
    };
}

function buildFloorRoomControls(roomId, x, y, width, height) {
    return `
        <rect class="floor-room-outline" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}"></rect>
        <circle class="floor-room-handle" data-kind="room" data-id="${escapeHtml(roomId)}" data-floor-action="resize-room"
            cx="${(x + width).toFixed(1)}" cy="${(y + height).toFixed(1)}" r="${buildStableCircleRadius(6)}"></circle>
    `;
}

function buildDiagramGeometry(points) {
    const width = 920;
    const height = 460;
    const margin = 48;
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);

    const project = (point) => ({
        x: margin + (point[0] - minX) * scale,
        y: height - margin - (point[1] - minY) * scale,
    });

    const vertexPoints = points.slice(0, -1).map(project);
    const polygonPoints = vertexPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    return { width, height, margin, minX, minY, scale, vertexPoints, polygonPoints, project };
}

function buildSvgFrame(width, height, content) {
    const zoomedWidth = (width * state.detailZoom).toFixed(1);
    const zoomedHeight = (height * state.detailZoom).toFixed(1);

    return `
        <div class="diagram-stage" style="width:${zoomedWidth}px">
            <svg viewBox="0 0 ${width} ${height}" width="${zoomedWidth}" height="${zoomedHeight}" role="img" aria-label="Parcel geometry detail view">
                <rect class="diagram-surface" width="${width}" height="${height}" rx="18"></rect>
                ${content}
            </svg>
        </div>
    `;
}

function buildFeatureSvg(feature, left, top, boxWidth, boxHeight, parcelRotation = 0) {
    const properties = feature.properties || {};
    const insetX = Math.max(18, boxWidth * 0.08);
    const insetY = Math.max(18, boxHeight * 0.08);
    const maxWidth = Math.max(28, boxWidth - (insetX * 2));
    const maxHeight = Math.max(18, boxHeight - (insetY * 2));
    const width = Math.min(maxWidth, Math.max(28, Number(properties.width_ratio || 0.12) * boxWidth * 0.82));
    const height = Math.min(maxHeight, Math.max(18, Number(properties.height_ratio || 0.12) * boxHeight * 0.82));
    const rawCenterX = left + (Number(properties.anchor_x_ratio || 0.5) * boxWidth);
    const rawCenterY = top + (Number(properties.anchor_y_ratio || 0.5) * boxHeight);
    const centerX = clamp(rawCenterX, left + insetX + (width / 2), left + boxWidth - insetX - (width / 2));
    const centerY = clamp(rawCenterY, top + insetY + (height / 2), top + boxHeight - insetY - (height / 2));
    const visualKind = properties.visual_kind || "bed";
    const selected = state.selectedKind === "feature" && state.selectedId === feature.id ? "selected" : "";
    const rotation = Number(properties.rotation_degrees ?? parcelRotation);
    const cornerRadius = visualKind === "patio" ? 0 : Math.min(width, height, 18);
    let shape = "";

    if (visualKind === "path") {
        const points = [
            [centerX, centerY - (height / 2)],
            [centerX - (width / 4), centerY - (height / 6)],
            [centerX + (width / 5), centerY + (height / 6)],
            [centerX - (width / 8), centerY + (height / 2)],
        ].map((point) => `${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
        shape = `<polyline class="feature-shape path ${selected}" data-kind="feature" data-id="${escapeHtml(feature.id)}" data-feature-action="move" points="${points}" transform="rotate(${rotation.toFixed(1)} ${centerX.toFixed(1)} ${centerY.toFixed(1)})"></polyline>`;
    } else if (visualKind === "screen") {
        shape = `<ellipse class="feature-shape screen ${selected}" data-kind="feature" data-id="${escapeHtml(feature.id)}" data-feature-action="move" cx="${centerX.toFixed(1)}" cy="${centerY.toFixed(1)}" rx="${(width / 2).toFixed(1)}" ry="${(height / 2).toFixed(1)}" transform="rotate(${rotation.toFixed(1)} ${centerX.toFixed(1)} ${centerY.toFixed(1)})"></ellipse>`;
    } else {
        shape = `<rect class="feature-shape ${escapeHtml(visualKind)} ${selected}" data-kind="feature" data-id="${escapeHtml(feature.id)}" data-feature-action="move" x="${(centerX - (width / 2)).toFixed(1)}" y="${(centerY - (height / 2)).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="${cornerRadius.toFixed(1)}" transform="rotate(${rotation.toFixed(1)} ${centerX.toFixed(1)} ${centerY.toFixed(1)})"></rect>`;
    }

    const controls = selected ? buildFeatureControls(feature.id, centerX, centerY, width, height, rotation, cornerRadius) : "";

    return `
        ${shape}
        ${controls}
        <text class="feature-label zoom-stable-label" text-anchor="middle"
            transform="${buildStableLabelTransform(centerX, centerY + 4)}">${escapeHtml(feature.label)}</text>
    `;
}

function buildStableLabelTransform(x, y) {
    const safeZoom = state.detailZoom || 1;
    const inverseZoom = 1 / safeZoom;
    return `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${inverseZoom.toFixed(4)})`;
}

function buildStableCircleRadius(radius) {
    const safeZoom = state.detailZoom || 1;
    return (radius / safeZoom).toFixed(3);
}

function mapLevelNameToView(levelName) {
    const normalized = String(levelName || "").trim().toLowerCase();
    const match = FLOOR_VIEW_CONFIGS.find((config) => config.matchers.some((value) => normalized.includes(value)));
    return match ? match.key : "first-floor";
}

function roomBelongsToFloor(room, levelKey) {
    const roomType = String(room?.properties?.room_type || "").trim().toLowerCase();
    if (roomType === "garage") {
        return levelKey === "first-floor";
    }
    return mapLevelNameToView(room?.properties?.level_name) === levelKey;
}

function getFloorLevelLabel(levelKey) {
    return (FLOOR_VIEW_CONFIGS.find((item) => item.key === levelKey)?.label) || "First Floor";
}

function getLongestEdgeAngle(points) {
    if (points.length < 2) {
        return 0;
    }

    let bestAngle = 0;
    let bestLength = 0;
    for (let index = 0; index < points.length; index += 1) {
        const start = points[index];
        const end = points[(index + 1) % points.length];
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const length = Math.hypot(dx, dy);
        if (length <= bestLength) {
            continue;
        }
        bestLength = length;
        bestAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    }
    return bestAngle;
}

function rotateSourcePoints(points, degrees, center) {
    return points.map((point) => {
        const rotated = rotatePoint(point[0], point[1], center[0], center[1], degrees);
        return [roundValue(rotated.x, 6), roundValue(rotated.y, 6)];
    });
}

function getPolygonCentroid(points) {
    if (!points.length) {
        return [0, 0];
    }
    const sum = points.reduce((accumulator, point) => {
        accumulator[0] += point[0];
        accumulator[1] += point[1];
        return accumulator;
    }, [0, 0]);
    return [sum[0] / points.length, sum[1] / points.length];
}

function buildFeatureControls(featureId, centerX, centerY, width, height, rotation, cornerRadius) {
    const topCenter = rotatePoint(centerX, centerY - (height / 2), centerX, centerY, rotation);
    const resizeCorner = rotatePoint(centerX + (width / 2), centerY + (height / 2), centerX, centerY, rotation);
    const rotateHandle = rotatePoint(centerX, centerY - (height / 2) - 28, centerX, centerY, rotation);

    return `
        <g class="feature-controls">
            <rect class="feature-outline" x="${(centerX - (width / 2)).toFixed(1)}" y="${(centerY - (height / 2)).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="${cornerRadius.toFixed(1)}" transform="rotate(${rotation.toFixed(1)} ${centerX.toFixed(1)} ${centerY.toFixed(1)})"></rect>
            <line class="feature-handle-line" x1="${topCenter.x.toFixed(1)}" y1="${topCenter.y.toFixed(1)}" x2="${rotateHandle.x.toFixed(1)}" y2="${rotateHandle.y.toFixed(1)}"></line>
            <circle class="feature-handle resize" data-id="${escapeHtml(featureId)}" data-feature-action="resize" cx="${resizeCorner.x.toFixed(1)}" cy="${resizeCorner.y.toFixed(1)}" r="7"></circle>
            <circle class="feature-handle rotate" data-id="${escapeHtml(featureId)}" data-feature-action="rotate" cx="${rotateHandle.x.toFixed(1)}" cy="${rotateHandle.y.toFixed(1)}" r="7"></circle>
        </g>
    `;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function rotatePoint(x, y, centerX, centerY, degrees) {
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = x - centerX;
    const dy = y - centerY;
    return {
        x: centerX + (dx * cos) - (dy * sin),
        y: centerY + (dx * sin) + (dy * cos),
    };
}

function getParcelRotation(vertexPoints) {
    if (vertexPoints.length < 2) {
        return 0;
    }

    let bestAngle = 0;
    let bestLength = 0;
    for (let index = 0; index < vertexPoints.length; index += 1) {
        const start = vertexPoints[index];
        const end = vertexPoints[(index + 1) % vertexPoints.length];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (length <= bestLength) {
            continue;
        }
        bestLength = length;
        bestAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    }

    if (bestAngle > 90) {
        return bestAngle - 180;
    }
    if (bestAngle < -90) {
        return bestAngle + 180;
    }
    return bestAngle;
}

function handleGardenPointerMove(event) {
    if (!state.gardenInteraction || !state.assessment) {
        return;
    }

    if (event.pointerId !== state.gardenInteraction.pointerId) {
        return;
    }

    const sourceCanvas = document.getElementById(state.gardenInteraction.sourceCanvasId || "garden-canvas");
    const svg = sourceCanvas?.querySelector("svg");
    if (!svg) {
        return;
    }

    const pointer = clientPointToSvg(svg, event.clientX, event.clientY);
    const { mode, featureId, startPointer, startProperties, context } = state.gardenInteraction;
    const feature = getFeatureObjectById(featureId);
    if (!feature) {
        return;
    }

    const deltaX = pointer.x - startPointer.x;
    const deltaY = pointer.y - startPointer.y;
    let nextAnchorX = startProperties.anchor_x_ratio;
    let nextAnchorY = startProperties.anchor_y_ratio;
    let nextWidthRatio = startProperties.width_ratio;
    let nextHeightRatio = startProperties.height_ratio;
    let nextRotation = startProperties.rotation_degrees;

    if (mode === "move") {
        const startCenterX = context.left + (startProperties.anchor_x_ratio * context.boxWidth);
        const startCenterY = context.top + (startProperties.anchor_y_ratio * context.boxHeight);
        const width = getFeatureRenderSize(startProperties.width_ratio, context.boxWidth, context.maxWidth, 28);
        const height = getFeatureRenderSize(startProperties.height_ratio, context.boxHeight, context.maxHeight, 18);
        const centerX = clamp(startCenterX + deltaX, context.left + context.insetX + (width / 2), context.left + context.boxWidth - context.insetX - (width / 2));
        const centerY = clamp(startCenterY + deltaY, context.top + context.insetY + (height / 2), context.top + context.boxHeight - context.insetY - (height / 2));
        nextAnchorX = (centerX - context.left) / context.boxWidth;
        nextAnchorY = (centerY - context.top) / context.boxHeight;
    } else if (mode === "resize") {
        const localDelta = rotateVector(deltaX, deltaY, -startProperties.rotation_degrees);
        nextWidthRatio = clamp(startProperties.width_ratio + ((localDelta.x * 2) / (context.boxWidth * 0.82)), 0.06, 0.9);
        nextHeightRatio = clamp(startProperties.height_ratio + ((localDelta.y * 2) / (context.boxHeight * 0.82)), 0.06, 0.9);
    } else if (mode === "rotate") {
        const centerX = context.left + (startProperties.anchor_x_ratio * context.boxWidth);
        const centerY = context.top + (startProperties.anchor_y_ratio * context.boxHeight);
        const startAngle = Math.atan2(startPointer.y - centerY, startPointer.x - centerX);
        const currentAngle = Math.atan2(pointer.y - centerY, pointer.x - centerX);
        nextRotation = normalizeDegrees(startProperties.rotation_degrees + ((currentAngle - startAngle) * 180 / Math.PI));
    }

    applyFeatureLayout(feature, {
        anchor_x_ratio: roundValue(nextAnchorX, 4),
        anchor_y_ratio: roundValue(nextAnchorY, 4),
        width_ratio: roundValue(nextWidthRatio, 4),
        height_ratio: roundValue(nextHeightRatio, 4),
        rotation_degrees: roundValue(nextRotation, 2),
    });
    renderSelection();
}

function stopGardenInteraction(event) {
    if (event && state.gardenInteraction && event.pointerId !== state.gardenInteraction.pointerId) {
        return;
    }
    state.gardenInteraction = null;
}

function handleFloorPlanPointerMove(event) {
    if (!state.floorPlanInteraction || !state.assessment) {
        return;
    }
    if (event.pointerId !== state.floorPlanInteraction.pointerId) {
        return;
    }

    const viewCanvasId = `${state.floorPlanInteraction.levelKey}-canvas`;
    const svg = document.getElementById(viewCanvasId)?.querySelector("svg");
    if (!svg) {
        return;
    }

    const pointer = clientPointToSvg(svg, event.clientX, event.clientY);
    const room = state.assessment.objects.rooms.find((item) => item.id === state.floorPlanInteraction.roomId);
    if (!room) {
        return;
    }

    const deltaX = (pointer.x - state.floorPlanInteraction.startPointer.x) / state.floorPlanInteraction.shellBox.width;
    const deltaY = (pointer.y - state.floorPlanInteraction.startPointer.y) / state.floorPlanInteraction.shellBox.height;
    let nextX = state.floorPlanInteraction.startLayout.x;
    let nextY = state.floorPlanInteraction.startLayout.y;
    let nextWidth = state.floorPlanInteraction.startLayout.width;
    let nextHeight = state.floorPlanInteraction.startLayout.height;

    if (state.floorPlanInteraction.mode === "move-room") {
        nextX = clamp(nextX + deltaX, 0.02, 0.98 - nextWidth);
        nextY = clamp(nextY + deltaY, 0.02, 0.98 - nextHeight);
    } else if (state.floorPlanInteraction.mode === "resize-room") {
        nextWidth = clamp(nextWidth + deltaX, 0.12, 0.96 - nextX);
        nextHeight = clamp(nextHeight + deltaY, 0.12, 0.96 - nextY);
    }

    room.properties.floor_x_ratio = roundValue(nextX, 4);
    room.properties.floor_y_ratio = roundValue(nextY, 4);
    room.properties.floor_width_ratio = roundValue(nextWidth, 4);
    room.properties.floor_height_ratio = roundValue(nextHeight, 4);
    syncRoomPhysicalProperties(room);

    renderSelection();
}

function stopFloorPlanInteraction(event) {
    if (event && state.floorPlanInteraction && event.pointerId !== state.floorPlanInteraction.pointerId) {
        return;
    }
    state.floorPlanInteraction = null;
}

function handleHousePlanPointerMove(event) {
    if (!state.housePlanInteraction || !state.assessment) {
        return;
    }

    if (event.pointerId !== state.housePlanInteraction.pointerId) {
        return;
    }

    const svg = document.getElementById("detail-canvas")?.querySelector("svg");
    if (!svg) {
        return;
    }

    const pointer = clientPointToSvg(svg, event.clientX, event.clientY);
    const deltaX = (pointer.x - state.housePlanInteraction.startPointer.x) / state.housePlanInteraction.geometry.scale;
    const deltaY = -(pointer.y - state.housePlanInteraction.startPointer.y) / state.housePlanInteraction.geometry.scale;
    const { bounds, mode, pointIndex, startPoints } = state.housePlanInteraction;

    if (mode === "move-plan") {
        updateHousePlanPoints(clampTranslatedHousePlan(startPoints, deltaX, deltaY, bounds));
    } else if (mode === "move-vertex") {
        const nextPoints = startPoints.map((point) => [...point]);
        nextPoints[pointIndex] = [
            roundValue(clamp(startPoints[pointIndex][0] + deltaX, bounds.minX, bounds.maxX), 4),
            roundValue(clamp(startPoints[pointIndex][1] + deltaY, bounds.minY, bounds.maxY), 4),
        ];
        updateHousePlanPoints(nextPoints);
    }

    renderSelection();
}

function stopHousePlanInteraction(event) {
    if (event && state.housePlanInteraction && event.pointerId !== state.housePlanInteraction.pointerId) {
        return;
    }
    state.housePlanInteraction = null;
}

function clientPointToSvg(svg, clientX, clientY) {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
}

function getGardenEditContext() {
    const { vertexPoints } = buildDiagramGeometry(state.assessment.parcel_boundary_points || []);
    const left = Math.min(...vertexPoints.map((point) => point.x));
    const right = Math.max(...vertexPoints.map((point) => point.x));
    const top = Math.min(...vertexPoints.map((point) => point.y));
    const bottom = Math.max(...vertexPoints.map((point) => point.y));
    const boxWidth = Math.max(right - left, 1);
    const boxHeight = Math.max(bottom - top, 1);
    const insetX = Math.max(18, boxWidth * 0.08);
    const insetY = Math.max(18, boxHeight * 0.08);
    return {
        left,
        top,
        boxWidth,
        boxHeight,
        insetX,
        insetY,
        maxWidth: Math.max(28, boxWidth - (insetX * 2)),
        maxHeight: Math.max(18, boxHeight - (insetY * 2)),
        vertexPoints,
    };
}

function getFeatureRenderSize(ratio, boxSize, maxSize, minSize) {
    return Math.min(maxSize, Math.max(minSize, ratio * boxSize * 0.82));
}

function rotateVector(x, y, degrees) {
    const radians = degrees * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
        x: (x * cos) - (y * sin),
        y: (x * sin) + (y * cos),
    };
}

function normalizeDegrees(value) {
    let degrees = value;
    while (degrees > 180) {
        degrees -= 360;
    }
    while (degrees < -180) {
        degrees += 360;
    }
    return degrees;
}

function roundValue(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function getHouseVertexId(index) {
    return `house-vertex-${index + 1}`;
}

function normalizePolygonPoints(points) {
    if (!Array.isArray(points)) {
        return [];
    }
    const normalized = points.map((point) => [Number(point[0]), Number(point[1])]);
    if (normalized.length >= 2) {
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) {
            return normalized.slice(0, -1);
        }
    }
    return normalized;
}

function getSourceBounds(points) {
    if (!points.length) {
        return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    const normalizedPoints = points.length && points[0][0] === points[points.length - 1]?.[0] && points[0][1] === points[points.length - 1]?.[1]
        ? normalizePolygonPoints(points)
        : points.map((point) => [Number(point[0]), Number(point[1])]);
    const xs = normalizedPoints.map((point) => point[0]);
    const ys = normalizedPoints.map((point) => point[1]);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
    };
}

function computePolygonArea(points) {
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
        const [x1, y1] = points[index];
        const [x2, y2] = points[(index + 1) % points.length];
        sum += (x1 * y2) - (x2 * y1);
    }
    return Math.abs(sum) / 2;
}

function computePolygonPerimeter(points) {
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
        const [x1, y1] = points[index];
        const [x2, y2] = points[(index + 1) % points.length];
        sum += Math.hypot(x2 - x1, y2 - y1);
    }
    return sum;
}

function updateHousePlanPoints(points) {
    state.assessment.house_plan_points = points.map((point) => point.map((value) => roundValue(value, 4)));
    syncHousePlanObjects(state.assessment);
}

function clampTranslatedHousePlan(points, deltaX, deltaY, bounds) {
    const translated = points.map((point) => [point[0] + deltaX, point[1] + deltaY]);
    const translatedBounds = getSourceBounds([...translated, translated[0]]);
    let adjustX = 0;
    let adjustY = 0;

    if (translatedBounds.minX < bounds.minX) {
        adjustX = bounds.minX - translatedBounds.minX;
    } else if (translatedBounds.maxX > bounds.maxX) {
        adjustX = bounds.maxX - translatedBounds.maxX;
    }

    if (translatedBounds.minY < bounds.minY) {
        adjustY = bounds.minY - translatedBounds.minY;
    } else if (translatedBounds.maxY > bounds.maxY) {
        adjustY = bounds.maxY - translatedBounds.maxY;
    }

    return translated.map((point) => [
        roundValue(point[0] + adjustX, 4),
        roundValue(point[1] + adjustY, 4),
    ]);
}

function addHousePlan() {
    if (!state.assessment || state.assessment.house_plan_points?.length) {
        return;
    }
    updateHousePlanPoints(buildDefaultHousePlanPoints(state.assessment.parcel_boundary_points || []));
    state.selectedKind = "house";
    state.selectedId = "house";
    renderSelection();
}

function removeHousePlan() {
    if (!state.assessment || !state.assessment.house_plan_points?.length) {
        return;
    }
    state.assessment.house_plan_points = [];
    syncHousePlanObjects(state.assessment);
    state.selectedKind = "parcel";
    state.selectedId = "parcel";
    renderSelection();
}

function addHousePlanVertex() {
    if (!state.assessment || !state.assessment.house_plan_points?.length) {
        return;
    }

    const points = state.assessment.house_plan_points.map((point) => [...point]);
    let insertAfterIndex = 0;

    if (state.selectedKind === "house-vertex") {
        insertAfterIndex = Math.max(0, Number(state.selectedId.split("-").pop()) - 1);
    } else {
        let bestLength = -1;
        points.forEach((point, index) => {
            const next = points[(index + 1) % points.length];
            const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
            if (length > bestLength) {
                bestLength = length;
                insertAfterIndex = index;
            }
        });
    }

    const current = points[insertAfterIndex];
    const next = points[(insertAfterIndex + 1) % points.length];
    const midpoint = [
        roundValue((current[0] + next[0]) / 2, 4),
        roundValue((current[1] + next[1]) / 2, 4),
    ];
    points.splice(insertAfterIndex + 1, 0, midpoint);
    updateHousePlanPoints(points);
    state.selectedKind = "house-vertex";
    state.selectedId = getHouseVertexId(insertAfterIndex + 1);
    renderSelection();
}

function removeHousePlanVertex() {
    if (!state.assessment || state.selectedKind !== "house-vertex" || state.assessment.house_plan_points.length <= 3) {
        return;
    }

    const index = Math.max(0, Number(state.selectedId.split("-").pop()) - 1);
    const points = state.assessment.house_plan_points.map((point) => [...point]);
    points.splice(index, 1);
    updateHousePlanPoints(points);
    state.selectedKind = "house";
    state.selectedId = "house";
    renderSelection();
}

function getFeatureObjectById(featureId) {
    return state.assessment?.objects.features.find((item) => item.id === featureId) || null;
}

function applyFeatureLayout(feature, layout) {
    Object.assign(feature.properties, layout);
    feature.subtitle = `${titleCase(feature.properties.visual_kind || "feature")} in ${feature.properties.zone_name}`;

    const landscapeFeature = state.assessment?.landscape_features.find((item) => item.feature_id === feature.id);
    if (landscapeFeature) {
        Object.assign(landscapeFeature, layout);
    }
}

function titleCase(value) {
    return String(value)
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function getPatioFeatures() {
    return state.assessment?.objects.features.filter((feature) => {
        const visualKind = String(feature.properties.visual_kind || "");
        return visualKind === "patio" || visualKind === "wall" || visualKind === "path";
    }) || [];
}

function isPatioFeature(featureId) {
    return getPatioFeatures().some((feature) => feature.id === featureId);
}

function getLandscapeFeaturesForIds(featureIds) {
    const featureIdSet = new Set(featureIds);
    return state.assessment?.landscape_features.filter((feature) => featureIdSet.has(feature.feature_id)) || [];
}

function getFeaturesForActiveView() {
    if (!state.assessment) {
        return [];
    }
    if (state.activeView === "patio") {
        return getLandscapeFeaturesForIds(getPatioFeatures().map((feature) => feature.id));
    }
    if (state.activeView === "garden") {
        const patioIdSet = new Set(getPatioFeatures().map((feature) => feature.id));
        return state.assessment.landscape_features.filter((feature) => !patioIdSet.has(feature.feature_id));
    }
    return state.assessment.landscape_features;
}

function renderDetailSummary(item) {
    document.getElementById("detail-title").textContent = item.label;
    document.getElementById("detail-subtitle").textContent = item.subtitle;
    document.getElementById("detail-tags").innerHTML = buildDetailTags(item);
    document.getElementById("selection-summary").innerHTML = buildSelectionSummary(item);
    updateFeatureActions();
}

function buildDetailTags(item) {
    const tags = [`<span class="detail-chip">${escapeHtml(item.kind)}</span>`];
    if (item.kind === "parcel") {
        tags.push(`<span class="detail-chip">${escapeHtml(state.assessment.geometry_type)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(formatAreaValue(state.assessment.metrics.area, state.assessment.metrics.area_unit))}</span>`);
    } else if (item.kind === "house") {
        tags.push(`<span class="detail-chip">${escapeHtml(String(item.properties.vertex_count))} vertices</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(formatAreaValue(item.properties.area, item.properties.area_unit))}</span>`);
    } else if (item.kind === "house-vertex") {
        tags.push(`<span class="detail-chip">Vertex ${escapeHtml(String(item.properties.vertex_index))}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.linear_unit)}</span>`);
    } else if (item.kind === "room") {
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.room_type)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(formatAreaValue(item.properties.area, item.properties.area_unit))}</span>`);
    } else if (item.kind === "utility") {
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.utility_type)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.status)}</span>`);
    } else if (item.kind === "edge") {
        tags.push(`<span class="detail-chip">${escapeHtml(formatNumber(item.properties.length))} ${escapeHtml(item.properties.linear_unit)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.direction)}</span>`);
    } else if (item.kind === "contour") {
        tags.push(`<span class="detail-chip">${escapeHtml(formatNumber(item.properties.elevation_feet))} ft</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(String(item.properties.interval_feet))}-ft interval</span>`);
    } else if (item.kind === "vertex") {
        tags.push(`<span class="detail-chip">Angle ${escapeHtml(String(item.properties.interior_angle_degrees))}°</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.linear_unit)}</span>`);
    } else if (item.kind === "feature") {
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.priority)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.visual_kind)}</span>`);
    }
    return tags.join("");
}

function buildSelectionSummary(item) {
    if (item.kind === "parcel") {
        const elevationRows = state.assessment.elevation_summary ? `
                <li>Elevation range: ${escapeHtml(formatNumber(state.assessment.elevation_summary.min_elevation_feet))} to ${escapeHtml(formatNumber(state.assessment.elevation_summary.max_elevation_feet))} ft</li>
                <li>Estimated relief: ${escapeHtml(formatNumber(state.assessment.elevation_summary.relief_feet))} ft</li>
        ` : "";
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>Edges: ${escapeHtml(String(state.assessment.objects.edges.length))}</li>
                <li>Contours: ${escapeHtml(String(state.assessment.objects.contours.length))}</li>
                <li>Vertices: ${escapeHtml(String(state.assessment.objects.vertices.length))}</li>
                <li>Image input: ${escapeHtml(state.assessment.image ? state.assessment.image.source_name : "Not provided")}</li>
                ${elevationRows}
            </ul>
        `;
    }

    if (item.kind === "contour") {
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>Elevation: ${escapeHtml(formatNumber(item.properties.elevation_feet))} ft</li>
                <li>Interval: ${escapeHtml(String(item.properties.interval_feet))} ft</li>
                <li>Segments: ${escapeHtml(String(item.properties.path_count))}</li>
                <li>Points: ${escapeHtml(String(item.properties.point_count))}</li>
            </ul>
        `;
    }

    if (item.kind === "edge") {
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>Direction: ${escapeHtml(item.properties.direction)} (${escapeHtml(String(item.properties.bearing_degrees))}°)</li>
                <li>Length: ${escapeHtml(formatNumber(item.properties.length))} ${escapeHtml(item.properties.length_unit)}</li>
            </ul>
        `;
    }

    if (item.kind === "house") {
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>Edges: ${escapeHtml(String(item.properties.edge_count))}</li>
                <li>Width: ${escapeHtml(formatNumber(item.properties.width))} ${escapeHtml(item.properties.linear_unit)}</li>
                <li>Height: ${escapeHtml(formatNumber(item.properties.height))} ${escapeHtml(item.properties.linear_unit)}</li>
                <li>Area: ${escapeHtml(formatAreaValue(item.properties.area, item.properties.area_unit))}</li>
            </ul>
        `;
    }

    if (item.kind === "room") {
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>Type: ${escapeHtml(item.properties.room_type)}</li>
                <li>Level: ${escapeHtml(item.properties.level_name)}</li>
                <li>Width: ${escapeHtml(formatNumber(item.properties.width))} ${escapeHtml(item.properties.linear_unit)}</li>
                <li>Height: ${escapeHtml(formatNumber(item.properties.height))} ${escapeHtml(item.properties.linear_unit)}</li>
                <li>Area: ${escapeHtml(formatAreaValue(item.properties.area, item.properties.area_unit))}</li>
            </ul>
        `;
    }

    if (item.kind === "utility") {
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>Type: ${escapeHtml(item.properties.utility_type)}</li>
                <li>Status: ${escapeHtml(item.properties.status)}</li>
            </ul>
        `;
    }

    if (item.kind === "house-vertex") {
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>X: ${escapeHtml(formatNumber(item.properties.source_x))}</li>
                <li>Y: ${escapeHtml(formatNumber(item.properties.source_y))}</li>
                <li>Index: ${escapeHtml(String(item.properties.vertex_index))}</li>
            </ul>
        `;
    }

    if (item.kind === "feature") {
        const moves = (item.properties.design_moves || []).map((move) => `<li>${escapeHtml(move)}</li>`).join("");
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>Zone: ${escapeHtml(item.properties.zone_name)}</li>
                <li>Priority: ${escapeHtml(item.properties.priority)}</li>
                <li>Ontology class: ${escapeHtml(item.properties.ontology_class)}</li>
            </ul>
            <p>${escapeHtml(item.properties.rationale)}</p>
            <ul class="selection-moves">${moves}</ul>
        `;
    }

    return `
        <p>${escapeHtml(item.description)}</p>
        <ul class="selection-list">
            <li>Interior angle: ${escapeHtml(String(item.properties.interior_angle_degrees))}°</li>
            <li>${item.properties.latitude !== undefined ? `Latitude: ${escapeHtml(String(item.properties.latitude))}` : `Source X: ${escapeHtml(String(item.properties.source_x))}`}</li>
            <li>${item.properties.longitude !== undefined ? `Longitude: ${escapeHtml(String(item.properties.longitude))}` : `Source Y: ${escapeHtml(String(item.properties.source_y))}`}</li>
        </ul>
    `;
}

function renderProperties(item) {
    document.getElementById("properties-title").textContent = item.label;
    const propertiesData = buildDisplayProperties(item);
    const entries = Object.entries(propertiesData);
    const properties = document.getElementById("properties-list");
    properties.innerHTML = entries.map(([key, value]) => (
        `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(formatPropertyValue(key, value, propertiesData))}</dd>`
    )).join("");
}

function buildDisplayProperties(item) {
    const baseProperties = { ...(item.properties || {}) };
    if (item.kind !== "feature" || baseProperties.visual_kind !== "patio" || !state.assessment) {
        return baseProperties;
    }

    const patioMetrics = computePatioMetrics(baseProperties);
    return {
        patio_length_feet: patioMetrics.lengthFeet,
        patio_width_feet: patioMetrics.widthFeet,
        patio_area_square_feet: patioMetrics.areaSquareFeet,
        ...baseProperties,
    };
}

function computePatioMetrics(properties) {
    const parcelWidth = Number(state.assessment.metrics.width || 0);
    const parcelHeight = Number(state.assessment.metrics.height || 0);
    const widthRatio = Number(properties.width_ratio || 0);
    const heightRatio = Number(properties.height_ratio || 0);
    const patioWidth = widthRatio * parcelWidth * 0.82;
    const patioHeight = heightRatio * parcelHeight * 0.82;
    const widthFeet = convertLengthToFeet(patioWidth, state.assessment.metrics.linear_unit);
    const heightFeet = convertLengthToFeet(patioHeight, state.assessment.metrics.linear_unit);
    const lengthFeet = Math.max(widthFeet, heightFeet);
    const shortWidthFeet = Math.min(widthFeet, heightFeet);
    return {
        lengthFeet: roundValue(lengthFeet, 2),
        widthFeet: roundValue(shortWidthFeet, 2),
        areaSquareFeet: roundValue(lengthFeet * shortWidthFeet, 2),
    };
}

function renderMetricSnapshot() {
    const data = state.assessment;
    const imageLabel = data.image ? `${data.image.width_px} x ${data.image.height_px}` : "No image";
    const elevationLabel = data.elevation_summary
        ? `${formatNumber(data.elevation_summary.min_elevation_feet)}-${formatNumber(data.elevation_summary.max_elevation_feet)} ft`
        : "Not loaded";
    const cards = [
        metricCard("Area", formatAreaValue(data.metrics.area, data.metrics.area_unit)),
        metricCard("Perimeter", `${formatNumber(data.metrics.perimeter)} ${data.metrics.linear_unit}`),
        metricCard("Irregularity", data.metrics.irregularity_index.toFixed(3)),
        metricCard("Vertices", String(data.metrics.vertex_count)),
        metricCard("Elevation", elevationLabel),
        metricCard("Garden Features", String(data.landscape_features.length)),
        metricCard("Bounds", `${formatNumber(data.metrics.width)} x ${formatNumber(data.metrics.height)}`),
        metricCard("Image", imageLabel),
    ];
    document.getElementById("metrics-grid").innerHTML = cards.join("");
}

function renderZonesSummary() {
    const nextData = state.assessment.next_data_to_collect.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const featureMarkup = state.assessment.landscape_features.map((feature) => `
        <li><strong>${escapeHtml(feature.name)}:</strong> ${escapeHtml(feature.zone_name)} | ${escapeHtml(feature.priority)} priority</li>
    `).join("");
    document.getElementById("zones-summary").innerHTML = `
        <p>${escapeHtml(String(state.assessment.landscape_features.length))} garden design features are mapped onto the current parcel.</p>
        <p><strong>Garden design program</strong></p>
        <ul class="selection-list">${featureMarkup}</ul>
        <p><strong>Next data to collect</strong></p>
        <ul class="selection-list">${nextData}</ul>
    `;
}

function renderMarkdown(markdown) {
    document.getElementById("report-preview").innerHTML = window.marked.parse(markdown);
}

function renderList(elementId, items) {
    const element = document.getElementById(elementId);
    if (!items.length) {
        element.innerHTML = '<li class="placeholder-line">No items available.</li>';
        return;
    }
    element.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function getSelectedObject() {
    if (!state.assessment) {
        return null;
    }
    if (state.selectedKind === "parcel") {
        return state.assessment.objects.parcel;
    }
    if (state.selectedKind === "house") {
        return state.assessment.objects.housePlan;
    }
    if (state.selectedKind === "house-vertex") {
        return state.assessment.objects.houseVertices.find((item) => item.id === state.selectedId) || null;
    }
    if (state.selectedKind === "room") {
        return state.assessment.objects.rooms.find((item) => item.id === state.selectedId) || null;
    }
    if (state.selectedKind === "utility") {
        return state.assessment.objects.utilities.find((item) => item.id === state.selectedId) || null;
    }
    if (state.selectedKind === "contour") {
        return state.assessment.objects.contours.find((item) => item.id === state.selectedId) || null;
    }
    if (state.selectedKind === "edge") {
        return state.assessment.objects.edges.find((item) => item.id === state.selectedId) || null;
    }
    if (state.selectedKind === "vertex") {
        return state.assessment.objects.vertices.find((item) => item.id === state.selectedId) || null;
    }
    if (state.selectedKind === "feature") {
        return state.assessment.objects.features.find((item) => item.id === state.selectedId) || null;
    }
    return null;
}

function updateFeatureActions() {
    const loadHouseGisButton = document.getElementById("load-house-gis");
    const addHousePlanButton = document.getElementById("add-house-plan");
    const removeHousePlanButton = document.getElementById("remove-house-plan");
    const addRoomButton = document.getElementById("add-room");
    const addHouseVertexButton = document.getElementById("add-house-vertex");
    const removeHouseVertexButton = document.getElementById("remove-house-vertex");
    const saveButton = document.getElementById("save-features");
    const removeButton = document.getElementById("remove-feature");
    const hasAssessment = Boolean(state.assessment);
    const hasHousePlan = hasAssessment && Boolean(state.assessment.objects.housePlan);
    const isHouseVertexSelected = hasAssessment && state.selectedKind === "house-vertex" && Boolean(getSelectedObject());
    const isFeatureSelected = hasAssessment && state.selectedKind === "feature" && Boolean(getSelectedObject());
    const isFloorView = ["basement", "first-floor", "second-floor"].includes(state.activeView);

    const isNeo4jBacked = state.persistenceMode === "neo4j" && Boolean(state.currentNeo4jParcelId);
    loadHouseGisButton.disabled = !isNeo4jBacked;
    addHousePlanButton.disabled = !hasAssessment || hasHousePlan;
    removeHousePlanButton.disabled = !hasHousePlan;
    addRoomButton.disabled = !hasAssessment || !hasHousePlan || !isFloorView;
    addHouseVertexButton.disabled = !hasHousePlan;
    removeHouseVertexButton.disabled = !isHouseVertexSelected || state.assessment.house_plan_points.length <= 3;
    saveButton.disabled = !hasAssessment || !isNeo4jBacked;
    removeButton.disabled = !isFeatureSelected || !isNeo4jBacked;
}

function addFloorRoom() {
    if (!state.assessment || !state.assessment.objects.housePlan) {
        return;
    }
    if (!["basement", "first-floor", "second-floor"].includes(state.activeView)) {
        updateStatus("Switch to Basement, First Floor, or Second Floor to add a room.", true);
        return;
    }

    const levelKey = state.activeView;
    const levelLabel = getFloorLevelLabel(levelKey);
    const existingRooms = state.assessment.objects.rooms.filter((room) => mapLevelNameToView(room.properties.level_name) === levelKey);
    const roomNumber = existingRooms.length + 1;
    const houseWidth = Number(state.assessment.objects.housePlan.properties.width || 0);
    const houseHeight = Number(state.assessment.objects.housePlan.properties.height || 0);
    const layout = getNextFloorRoomLayout(existingRooms);
    const newRoom = {
        kind: "room",
        id: `custom-${levelKey}-room-${Date.now()}`,
        label: `Room ${roomNumber}`,
        subtitle: `${levelLabel} | custom room`,
        description: `Editable room added to the ${levelLabel.toLowerCase()} blueprint.`,
        properties: {
            room_id: `custom-${levelKey}-room-${roomNumber}`,
            room_type: "room",
            level_name: levelLabel,
            area: roundValue(Number(state.assessment.objects.housePlan.properties.area || 0) * layout.width * layout.height, 2),
            area_unit: state.assessment.objects.housePlan.properties.area_unit || "sq ft",
            width: roundValue(houseWidth * layout.width, 2),
            height: roundValue(houseHeight * layout.height, 2),
            linear_unit: state.assessment.objects.housePlan.properties.linear_unit || "feet",
            notes: `Custom room added on ${levelLabel.toLowerCase()}.`,
            floor_x_ratio: layout.x,
            floor_y_ratio: layout.y,
            floor_width_ratio: layout.width,
            floor_height_ratio: layout.height,
        },
    };

    syncRoomPhysicalProperties(newRoom);
    state.assessment.objects.rooms.push(newRoom);
    state.selectedKind = "room";
    state.selectedId = newRoom.id;
    renderCatalog();
    renderSelection();
}

function getNextFloorRoomLayout(existingRooms) {
    const presets = [
        { x: 0.08, y: 0.08, width: 0.22, height: 0.18 },
        { x: 0.34, y: 0.08, width: 0.22, height: 0.18 },
        { x: 0.60, y: 0.08, width: 0.22, height: 0.18 },
        { x: 0.08, y: 0.32, width: 0.22, height: 0.18 },
        { x: 0.34, y: 0.32, width: 0.22, height: 0.18 },
        { x: 0.60, y: 0.32, width: 0.22, height: 0.18 },
        { x: 0.08, y: 0.56, width: 0.22, height: 0.18 },
        { x: 0.34, y: 0.56, width: 0.22, height: 0.18 },
        { x: 0.60, y: 0.56, width: 0.22, height: 0.18 },
    ];
    const used = new Set(existingRooms.map((room) => `${room.properties.floor_x_ratio}|${room.properties.floor_y_ratio}`));
    const preset = presets.find((item) => !used.has(`${item.x}|${item.y}`));
    return preset || { x: 0.12, y: 0.12, width: 0.2, height: 0.16 };
}

function syncRoomPhysicalProperties(room) {
    if (!state.assessment?.objects?.housePlan) {
        return;
    }

    const houseProperties = state.assessment.objects.housePlan.properties || {};
    const houseWidth = Number(houseProperties.width || 0);
    const houseHeight = Number(houseProperties.height || 0);
    const houseArea = Number(houseProperties.area || 0);
    const widthRatio = Number(room.properties.floor_width_ratio || 0);
    const heightRatio = Number(room.properties.floor_height_ratio || 0);

    room.properties.width = roundValue(houseWidth * widthRatio, 2);
    room.properties.height = roundValue(houseHeight * heightRatio, 2);
    room.properties.area = roundValue(houseArea * widthRatio * heightRatio, 2);
}

function metricCard(label, value) {
    return `
        <article class="metric-card">
            <span class="metric-label">${escapeHtml(label)}</span>
            <span class="metric-value">${escapeHtml(value)}</span>
        </article>
    `;
}

function updateFileSummary() {
    const parcelFile = document.getElementById("parcel-file").files[0];
    const summary = document.getElementById("file-summary");

    if (!parcelFile) {
        summary.textContent = "No files selected.";
        return;
    }

    summary.textContent = `Parcel: ${parcelFile.name}`;
}

function updateStatus(message, isError) {
    document.getElementById("status-text").textContent = message;
    document.getElementById("status-dot").classList.toggle("error", Boolean(isError));
}

function resetResults() {
    document.getElementById("parcel-count").textContent = "0";
    document.getElementById("contour-count").textContent = "0";
    document.getElementById("edge-count").textContent = "0";
    document.getElementById("vertex-count").textContent = "0";
    document.getElementById("house-plan-count").textContent = "0";
    document.getElementById("house-vertex-count").textContent = "0";
    document.getElementById("room-count").textContent = "0";
    document.getElementById("utility-count").textContent = "0";
    document.getElementById("feature-count").textContent = "0";
    document.getElementById("patio-count").textContent = "0";
    document.getElementById("parcel-list").innerHTML = '<div class="placeholder">Load a parcel to populate the catalog.</div>';
    document.getElementById("edge-list").innerHTML = '<div class="placeholder">Boundary edges will appear here.</div>';
    document.getElementById("vertex-list").innerHTML = '<div class="placeholder">Corner vertices will appear here.</div>';
    document.getElementById("house-plan-list").innerHTML = '<div class="placeholder">Editable house footprint will appear here.</div>';
    document.getElementById("house-vertex-list").innerHTML = '<div class="placeholder">House footprint vertices will appear here.</div>';
    document.getElementById("room-list").innerHTML = '<div class="placeholder">Room objects will appear here.</div>';
    document.getElementById("utility-list").innerHTML = '<div class="placeholder">Utility connections will appear here.</div>';
    document.getElementById("feature-list").innerHTML = '<div class="placeholder">Garden design features will appear here.</div>';
    document.getElementById("patio-list").innerHTML = '<div class="placeholder">Patio design features will appear here.</div>';
    document.getElementById("assumptions-list").innerHTML = '<li class="placeholder-line">No assumptions loaded yet.</li>';
    document.getElementById("recommendations-list").innerHTML = '<li class="placeholder-line">No recommendations loaded yet.</li>';
    document.getElementById("detail-title").textContent = "Parcel detail view";
    document.getElementById("detail-subtitle").textContent = "Select a parcel object from the left panel or the diagram.";
    document.getElementById("detail-tags").innerHTML = '<span class="detail-chip">No object selected</span>';
    document.getElementById("detail-canvas").innerHTML = '<div class="placeholder">Interactive parcel diagram will appear here.</div>';
    document.getElementById("garden-canvas").innerHTML = '<div class="placeholder">Garden design diagram will appear here.</div>';
    document.getElementById("patio-canvas").innerHTML = '<div class="placeholder">Patio design diagram will appear here.</div>';
    document.getElementById("basement-canvas").innerHTML = '<div class="placeholder">Basement floor plan will appear here.</div>';
    document.getElementById("first-floor-canvas").innerHTML = '<div class="placeholder">First floor plan will appear here.</div>';
    document.getElementById("second-floor-canvas").innerHTML = '<div class="placeholder">Second floor plan will appear here.</div>';
    document.getElementById("selection-summary").innerHTML = '<p class="placeholder-line">Selection-specific notes will appear here.</p>';
    document.getElementById("zones-summary").innerHTML = '<p class="placeholder-line">Concept zones and next data steps will appear here.</p>';
    document.getElementById("report-preview").innerHTML = '<p class="placeholder-line">The generated markdown report will render here.</p>';
    document.getElementById("properties-title").textContent = "Inspector";
    document.getElementById("properties-list").innerHTML = '<div class="placeholder-line">Select an object to inspect its values.</div>';
    document.getElementById("metrics-grid").innerHTML = '<div class="placeholder">Parcel metrics will appear here after analysis.</div>';
    document.getElementById("contour-list").innerHTML = '<div class="placeholder">Loaded elevation contours will appear here.</div>';
    renderActiveView();
    updateFeatureActions();
    updateZoomControls();
}

function adjustDetailZoom(delta) {
    setDetailZoom(state.detailZoom + delta);
}

function setDetailZoom(value) {
    const nextZoom = Math.min(DETAIL_ZOOM_MAX, Math.max(DETAIL_ZOOM_MIN, Number(value.toFixed(2))));

    if (nextZoom === state.detailZoom) {
        updateZoomControls();
        return;
    }

    state.detailZoom = nextZoom;

    if (state.assessment) {
        renderInteractiveDiagram();
        return;
    }

    updateZoomControls();
}

function updateZoomControls() {
    const zoomIn = document.getElementById("zoom-in");
    const zoomOut = document.getElementById("zoom-out");
    const zoomReset = document.getElementById("zoom-reset");
    const zoomSlider = document.getElementById("zoom-slider");
    const zoomPercent = Math.round(state.detailZoom * 100);

    zoomIn.disabled = state.detailZoom >= DETAIL_ZOOM_MAX;
    zoomOut.disabled = state.detailZoom <= DETAIL_ZOOM_MIN;
    zoomReset.textContent = `${zoomPercent}%`;
    zoomReset.disabled = !state.assessment && state.detailZoom === 1;
    zoomSlider.value = String(state.detailZoom);
}

function downloadReport() {
    if (!state.reportMarkdown) {
        return;
    }
    const blob = new Blob([state.reportMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "site_report.md";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function saveFeatures() {
    if (!state.assessment || state.persistenceMode !== "neo4j" || !state.currentNeo4jParcelId) {
        updateStatus("Saving is only available for parcels loaded from Neo4j.", true);
        return;
    }

    try {
        const response = await fetch(
            `/api/neo4j/parcels/${encodeURIComponent(state.currentNeo4jParcelId)}/features?database=${encodeURIComponent(state.currentNeo4jDatabase || "hp62n")}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    features: state.assessment.landscape_features,
                    house_plan_points: state.assessment.house_plan_points || [],
                    rooms: (state.assessment.objects.rooms || []).map((room) => ({
                        room_id: room.properties.room_id,
                        label: room.label,
                        room_type: room.properties.room_type,
                        level_name: room.properties.level_name,
                        area: room.properties.area,
                        area_unit: room.properties.area_unit,
                        width: room.properties.width,
                        height: room.properties.height,
                        linear_unit: room.properties.linear_unit,
                        notes: room.properties.notes,
                        floor_x_ratio: room.properties.floor_x_ratio || 0,
                        floor_y_ratio: room.properties.floor_y_ratio || 0,
                        floor_width_ratio: room.properties.floor_width_ratio || 0,
                        floor_height_ratio: room.properties.floor_height_ratio || 0,
                    })),
                }),
            },
        );
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.detail || "Unable to save design changes to Neo4j.");
        }
        applyAssessment(payload);
        updateStatus(
            `Saved ${payload.landscape_features.length} features, ${payload.objects.rooms.length} rooms, and ${payload.house_plan_points.length} house footprint points to Neo4j.`,
            false,
        );
    } catch (error) {
        updateStatus(error.message, true);
    }
}

async function removeSelectedFeature() {
    if (!state.assessment || state.selectedKind !== "feature" || state.persistenceMode !== "neo4j" || !state.currentNeo4jParcelId) {
        updateStatus("Feature removal is only available for parcels loaded from Neo4j.", true);
        return;
    }

    try {
        const featureId = state.selectedId;
        const response = await fetch(
            `/api/neo4j/parcels/${encodeURIComponent(state.currentNeo4jParcelId)}/features/${encodeURIComponent(featureId)}?database=${encodeURIComponent(state.currentNeo4jDatabase || "hp62n")}`,
            { method: "DELETE" },
        );
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.detail || "Unable to remove feature from Neo4j.");
        }
        applyAssessment(payload);
        updateStatus(`Removed feature ${featureId} from Neo4j.`, false);
    } catch (error) {
        updateStatus(error.message, true);
    }
}

async function loadHouseFootprintFromGis() {
    if (!state.assessment || state.persistenceMode !== "neo4j" || !state.currentNeo4jParcelId) {
        updateStatus("GIS house loading is only available for parcels loaded from Neo4j.", true);
        return;
    }

    try {
        updateStatus(`Loading Suffolk GIS house footprint for ${state.currentNeo4jParcelId}...`, false);
        const response = await fetch(
            `/api/neo4j/parcels/${encodeURIComponent(state.currentNeo4jParcelId)}/house-footprint/gis?database=${encodeURIComponent(state.currentNeo4jDatabase || "hp62n")}`,
            { method: "POST" },
        );
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.detail || "Unable to load house footprint from Suffolk GIS.");
        }
        applyAssessment(payload);
        updateStatus(`Loaded Suffolk GIS house footprint for ${payload.parcel_name}.`, false);
    } catch (error) {
        updateStatus(error.message, true);
    }
}

function formatNumber(value) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function stringifyValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}

function formatAreaValue(area, areaUnit) {
    if (areaUnit === "square feet") {
        return `${formatNumber(Number(area) / 43560)} acre`;
    }
    return `${formatNumber(area)} ${areaUnit}`;
}

function formatPropertyValue(key, value, properties) {
    if (key === "area") {
        return formatAreaValue(value, properties.area_unit);
    }
    if (key === "area_unit" && properties.area_unit === "square feet") {
        return "acre";
    }
    if ((key === "width" || key === "height" || key === "perimeter") && properties.linear_unit) {
        return `${formatNumber(value)} ${properties.linear_unit}`;
    }
    if (key === "patio_length_feet" || key === "patio_width_feet") {
        return `${formatNumber(value)} ft`;
    }
    if (key === "patio_area_square_feet") {
        return `${formatNumber(value)} sq ft`;
    }
    return stringifyValue(value);
}

function convertLengthToFeet(value, linearUnit) {
    if (linearUnit === "feet") {
        return value;
    }
    if (linearUnit === "meters") {
        return value * 3.28084;
    }
    return value;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
