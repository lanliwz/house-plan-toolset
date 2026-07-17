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
    interiorFixtureInteraction: null,
    interiorFixtureEditTimer: null,
    selectedInteriorFixtureId: null,
    selectedInteriorSegmentKind: null,
    selectedInteriorSegmentIndex: null,
    selectedRoomVertexIndex: null,
    persistenceMode: "session",
    currentNeo4jParcelId: null,
    currentNeo4jDatabase: null,
};

const DETAIL_ZOOM_MIN = 0.5;
const DETAIL_ZOOM_MAX = 10;
const DETAIL_ZOOM_STEP = 0.1;
const DEFAULT_WALL_THICKNESS_INCHES = 4.5;
const LEGACY_DEFAULT_WALL_THICKNESS_INCHES = 6;
const DESIGN_GRID_INCHES = 1;
const DESIGN_GRID_MAJOR_INCHES = 12;
const FLOOR_VIEW_CONFIGS = [
    { key: "basement", label: "Basement", matchers: ["basement", "lower level", "cellar"] },
    { key: "first-floor", label: "First Floor", matchers: ["first floor", "1st floor", "main floor", "main level", "ground floor"] },
    { key: "second-floor", label: "Second Floor", matchers: ["second floor", "2nd floor", "upper level", "upper floor"] },
];
const ROOM_TYPE_OPTIONS = [
    "room",
    "bedroom",
    "bathroom",
    "kitchen",
    "living_room",
    "dining",
    "office",
    "recreation",
    "storage",
    "mechanical",
    "laundry",
    "garage",
    "stair",
];

document.addEventListener("DOMContentLoaded", () => {
    setupTheme();
    setupTabs();
    setupSectionToggles();
    setupSplitters();
    setupForm();
    setupActions();
    setupPropertyEditing();
    setupViewToggle();
    setupZoomControls();
    setupGardenEditing();
    setupHousePlanEditing();
    setupFloorPlanEditing();
    setupInteriorDesignEditing();
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
        state.interiorFixtureInteraction = null;
        window.clearTimeout(state.interiorFixtureEditTimer);
        state.interiorFixtureEditTimer = null;
        state.selectedInteriorFixtureId = null;
        state.selectedInteriorSegmentKind = null;
        state.selectedInteriorSegmentIndex = null;
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
    document.getElementById("remove-room").addEventListener("click", removeSelectedRoom);
    document.getElementById("rotate-stair").addEventListener("click", rotateSelectedStair);
    document.getElementById("add-house-vertex").addEventListener("click", addSelectedPlanVertex);
    document.getElementById("remove-house-vertex").addEventListener("click", removeSelectedPlanVertex);
    document.getElementById("save-features").addEventListener("click", saveFeatures);
    document.getElementById("remove-feature").addEventListener("click", removeSelectedFeature);
}

function setupPropertyEditing() {
    const properties = document.getElementById("properties-list");
    properties.addEventListener("change", handlePropertyEditorChange);
    properties.addEventListener("input", (event) => {
        if (event.target.dataset.segmentField === "thickness_inches") {
            handlePropertyEditorChange(event);
        }
    });
    properties.addEventListener("click", handlePropertyEditorClick);
    const interiorCanvas = document.getElementById("interior-design-canvas");
    interiorCanvas.addEventListener("change", handlePropertyEditorChange);
    interiorCanvas.addEventListener("input", (event) => {
        const target = event.target;
        if (target.dataset.interiorRoomDimension) {
            window.clearTimeout(state.interiorFixtureEditTimer);
            const dimension = target.dataset.interiorRoomDimension;
            const value = target.value;
            state.interiorFixtureEditTimer = window.setTimeout(() => {
                state.interiorFixtureEditTimer = null;
                applyInteriorRoomDimensionField(dimension, value);
            }, 250);
        } else if (target.dataset.interiorSegmentField === "thickness_inches") {
            applyInteriorSegmentField(target.dataset.interiorSegmentField, target.value);
        } else if (target.dataset.fixtureField) {
            window.clearTimeout(state.interiorFixtureEditTimer);
            const field = target.dataset.fixtureField;
            const value = target.value;
            state.interiorFixtureEditTimer = window.setTimeout(() => {
                state.interiorFixtureEditTimer = null;
                applyBathroomFixtureField(field, value);
            }, 200);
        } else if (target.dataset.interiorField || target.dataset.interiorColorIndex) {
            applyInteriorDesignEdit(target, { refreshOnly: true });
        }
    });
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
    document.getElementById("view-interior-design").addEventListener("click", () => {
        state.activeView = "interior-design";
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
            state.selectedRoomVertexIndex = action === "move-room-vertex"
                ? Number(target.dataset.index)
                : null;
            if (!action) {
                renderSelection();
                return;
            }

            if (action === "rotate-stair-inline") {
                rotateRoomDirection(room);
                renderSelection();
                return;
            }

            const svg = canvas.querySelector("svg");
            if (!svg) {
                renderSelection();
                return;
            }

            const shellBox = buildFloorShellBox(state.assessment.house_plan_points || []);
            const shellShape = buildFloorShellShape(shellBox, state.assessment.objects.rooms || [], levelKey);
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
                startPolygon: getRoomPolygonRatios(room).map((point) => [...point]),
                rawLayout: {
                    x: Number(room.properties.floor_x_ratio || 0.1),
                    y: Number(room.properties.floor_y_ratio || 0.1),
                    width: Number(room.properties.floor_width_ratio || 0.3),
                    height: Number(room.properties.floor_height_ratio || 0.2),
                },
                rawPolygon: getRoomPolygonRatios(room).map((point) => [...point]),
                pointIndex: Number(target.dataset.index),
                shellShape,
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

function setupInteriorDesignEditing() {
    const canvas = document.getElementById("interior-design-canvas");

    canvas.addEventListener("click", (event) => {
        const addSegmentButton = event.target.closest("[data-interior-segment-add]");
        if (addSegmentButton) {
            addInteriorRoomSegment(addSegmentButton.dataset.interiorSegmentAdd);
            return;
        }

        const removeSegmentButton = event.target.closest("[data-interior-segment-remove]");
        if (removeSegmentButton) {
            removeSelectedInteriorRoomSegment();
            return;
        }

        const addButton = event.target.closest("[data-fixture-add]");
        if (addButton) {
            addBathroomFixture(addButton.dataset.fixtureAdd);
            return;
        }

        const removeButton = event.target.closest("[data-fixture-remove]");
        if (removeButton) {
            removeSelectedBathroomFixture();
            return;
        }

        const fixture = event.target.closest("[data-fixture-id]");
        if (fixture) {
            state.selectedInteriorFixtureId = fixture.dataset.fixtureId;
            state.selectedInteriorSegmentKind = null;
            state.selectedInteriorSegmentIndex = null;
            refreshInteriorDesignWindow();
            return;
        }

        const segment = event.target.closest("[data-interior-segment-kind]");
        if (segment) {
            state.selectedInteriorFixtureId = null;
            state.selectedInteriorSegmentKind = segment.dataset.interiorSegmentKind;
            state.selectedInteriorSegmentIndex = Number(segment.dataset.interiorSegmentIndex);
            refreshInteriorDesignWindow();
        }
    });

    canvas.addEventListener("pointerdown", (event) => {
        const target = event.target.closest("[data-fixture-action]");
        if (!target || state.selectedKind !== "interior-design") {
            return;
        }
        const design = getSelectedObject();
        const sourceRoom = getInteriorSourceRoom(design);
        const fixtureId = target.dataset.fixtureId;
        const fixture = getBathroomFixture(sourceRoom, fixtureId);
        const svg = canvas.querySelector(".interior-floor-svg");
        if (!sourceRoom || !fixture || !svg) {
            return;
        }

        event.preventDefault();
        state.selectedInteriorFixtureId = fixtureId;
        state.selectedInteriorSegmentKind = null;
        state.selectedInteriorSegmentIndex = null;
        state.interiorFixtureInteraction = {
            fixtureId,
            pointerId: event.pointerId,
            mode: target.dataset.fixtureAction,
            startPointer: clientPointToSvg(svg, event.clientX, event.clientY),
            startFixture: { ...fixture },
            pixelsPerInch: getInteriorPixelsPerInch(design),
            roomWidthInches: getInteriorRoomDimensionsInches(design).width,
            roomDepthInches: getInteriorRoomDimensionsInches(design).height,
        };
        refreshInteriorDesignWindow();
    });

    window.addEventListener("pointermove", handleInteriorFixturePointerMove);
    window.addEventListener("pointerup", stopInteriorFixtureInteraction);
    window.addEventListener("pointercancel", stopInteriorFixtureInteraction);
}

function setupZoomControls() {
    const zoomSlider = document.getElementById("zoom-slider");

    document.getElementById("zoom-in").addEventListener("click", () => adjustDetailZoom(DETAIL_ZOOM_STEP));
    document.getElementById("zoom-out").addEventListener("click", () => adjustDetailZoom(-DETAIL_ZOOM_STEP));
    document.getElementById("zoom-reset").addEventListener("click", () => setDetailZoom(1));
    zoomSlider.addEventListener("input", () => setDetailZoom(Number(zoomSlider.value)));

    ["detail-canvas", "garden-canvas", "patio-canvas", "interior-design-canvas", "basement-canvas", "first-floor-canvas", "second-floor-canvas"].forEach((canvasId) => {
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
    (state.assessment.objects.rooms || []).forEach((room) => syncRoomPhysicalProperties(room));
    state.persistenceMode = payload.persistence_mode || "session";
    state.selectedKind = "parcel";
    state.selectedId = "parcel";
    state.activeView = "parcel";
    state.reportMarkdown = payload.report_markdown;
    state.detailZoom = 1;
    state.floorPlanInteraction = null;
    state.selectedRoomVertexIndex = null;
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

    FLOOR_VIEW_CONFIGS.forEach((config) => {
        const roomsForLevel = byLevel.get(config.key) || [];
        if (!roomsForLevel.length) {
            return;
        }
        const hasStair = roomsForLevel.some((room) => String(room.properties.room_type || "").toLowerCase() === "stair");
        if (hasStair) {
            return;
        }
        const stairRoom = buildGeneratedRoomsForLevel(payload, config.key)
            .find((room) => String(room.properties.room_type || "").toLowerCase() === "stair");
        if (stairRoom) {
            generated.push(stairRoom);
        }
    });

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
            ["basement-stair", "Stair to First Floor", "stair", 0.10, 0.60, 0.64, 0.18, 0.22],
        ],
        "first-floor": [
            ["first-living", "Living Room", "living_room", 0.16, 0.08, 0.08, 0.28, 0.24],
            ["first-kitchen", "Kitchen", "kitchen", 0.12, 0.44, 0.08, 0.20, 0.16],
            ["first-dining", "Dining", "dining", 0.10, 0.44, 0.30, 0.20, 0.16],
            ["first-bath", "Bath", "bathroom", 0.06, 0.08, 0.38, 0.12, 0.12],
            ["first-garage", "Double Car Garage", "garage", 0.34, 0.18, 0.60, 0.64, 0.24],
            ["first-stair", "Stair Core", "stair", 0.10, 0.34, 0.48, 0.16, 0.22],
        ],
        "second-floor": [
            ["second-bed-1", "Bedroom 2", "bedroom", 0.28, 0.07, 0.08, 0.34, 0.28],
            ["second-bed-2", "Bedroom 3", "bedroom", 0.28, 0.07, 0.44, 0.34, 0.28],
            ["second-bath", "Bath", "bathroom", 0.10, 0.46, 0.08, 0.18, 0.18],
            ["second-study", "Study", "office", 0.12, 0.46, 0.34, 0.18, 0.18],
            ["second-primary", "Primary Suite", "bedroom", 0.26, 0.67, 0.08, 0.22, 0.54],
            ["second-stair", "Stair from First Floor", "stair", 0.10, 0.46, 0.58, 0.18, 0.20],
        ],
    };

    return (templates[levelKey] || []).map(([suffix, label, roomType, share, xRatio, yRatio, widthRatio, heightRatio], index) => {
        const stairDirection = levelKey === "second-floor" ? "down" : "up";
        const adjustedWidthRatio = roomType === "stair" && stairDirection !== "left" && stairDirection !== "right"
            ? roundValue(Math.min(widthRatio, 4 / Math.max(houseWidth, 1)), 4)
            : widthRatio;
        const adjustedHeightRatio = roomType === "stair" && (stairDirection === "left" || stairDirection === "right")
            ? roundValue(Math.min(heightRatio, 4 / Math.max(houseHeight, 1)), 4)
            : heightRatio;
        return {
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
                width: roundValue(houseWidth * adjustedWidthRatio, 2),
                height: roundValue(houseHeight * adjustedHeightRatio, 2),
                linear_unit: linearUnit,
                notes: `Generated ${levelLabel.toLowerCase()} room placeholder.`,
                generated_floor_room: true,
                floor_x_ratio: xRatio,
                floor_y_ratio: yRatio,
                floor_width_ratio: adjustedWidthRatio,
                floor_height_ratio: adjustedHeightRatio,
                stair_direction: stairDirection,
                walls: buildDefaultRoomWalls(),
                doors: buildDefaultRoomDoors(),
                windows: buildDefaultRoomWindows(),
            },
        };
    });
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
    room.properties.stair_direction ??= "up";
    room.properties.walls = normalizeRoomWalls(room.properties.walls);
    room.properties.doors = normalizeRoomOpenings(room.properties.doors);
    room.properties.windows = normalizeRoomOpenings(room.properties.windows);
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

    const footprintDimensions = getFootprintLengthWidth(housePoints);
    const width = roundValue(footprintDimensions.width, 2);
    const height = roundValue(footprintDimensions.length, 2);
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
    const interiorDesigns = getInteriorDesignObjects();
    const hasFloorShell = Boolean(housePlan) && Array.isArray(state.assessment.house_plan_points) && state.assessment.house_plan_points.length >= 3;
    let floorPlans = [];
    if (hasFloorShell) {
        try {
            floorPlans = ["basement", "first-floor", "second-floor"]
                .map((levelKey) => buildFloorPlanSelection(levelKey))
                .filter(Boolean);
        } catch (error) {
            console.error("Unable to build floor plan catalog items", error);
            floorPlans = [];
        }
    }
    const patioFeatures = getPatioFeatures();
    document.getElementById("parcel-count").textContent = "1";
    document.getElementById("contour-count").textContent = String(contours.length);
    document.getElementById("edge-count").textContent = String(edges.length);
    document.getElementById("vertex-count").textContent = String(vertices.length);
    document.getElementById("house-plan-count").textContent = String((housePlan ? 1 : 0) + floorPlans.length);
    document.getElementById("house-vertex-count").textContent = String(houseVertices.length);
    document.getElementById("room-count").textContent = String(rooms.length);
    document.getElementById("interior-design-count").textContent = String(interiorDesigns.length);
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
        ? [renderCatalogItem(housePlan), ...floorPlans.map(renderCatalogItem)].join("")
        : '<div class="placeholder">Add a house object to start editing the footprint.</div>';
    document.getElementById("house-vertex-list").innerHTML = houseVertices.length
        ? houseVertices.map(renderCatalogItem).join("")
        : '<div class="placeholder">House footprint vertices will appear here.</div>';
    document.getElementById("room-list").innerHTML = rooms.length
        ? rooms.map(renderCatalogItem).join("")
        : '<div class="placeholder">Room objects will appear here.</div>';
    document.getElementById("interior-design-list").innerHTML = interiorDesigns.length
        ? interiorDesigns.map(renderCatalogItem).join("")
        : '<div class="placeholder">Add room objects to generate interior design schemes.</div>';
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
    if (kind !== "room" || state.selectedKind !== "room" || state.selectedId !== id) {
        state.selectedRoomVertexIndex = null;
    }
    if (kind === "interior-design" && (state.selectedKind !== kind || state.selectedId !== id)) {
        state.selectedInteriorFixtureId = null;
        state.selectedInteriorSegmentKind = null;
        state.selectedInteriorSegmentIndex = null;
    }
    state.selectedKind = kind;
    state.selectedId = id;
    if (kind === "feature") {
        state.activeView = isPatioFeature(id) ? "patio" : "garden";
    } else if (kind === "interior-design") {
        state.activeView = "interior-design";
    } else if (kind === "room") {
        const room = state.assessment?.objects.rooms.find((item) => item.id === id) || null;
        state.activeView = room ? mapLevelNameToView(room.properties.level_name) : "first-floor";
    } else if (kind === "floor-plan") {
        state.activeView = id;
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
    const isInteriorDesign = state.activeView === "interior-design";
    const isBasement = state.activeView === "basement";
    const isFirstFloor = state.activeView === "first-floor";
    const isSecondFloor = state.activeView === "second-floor";
    document.getElementById("view-parcel").classList.toggle("active", isParcel);
    document.getElementById("view-garden").classList.toggle("active", isGarden);
    document.getElementById("view-patio").classList.toggle("active", isPatio);
    document.getElementById("view-interior-design").classList.toggle("active", isInteriorDesign);
    document.getElementById("view-basement").classList.toggle("active", isBasement);
    document.getElementById("view-first-floor").classList.toggle("active", isFirstFloor);
    document.getElementById("view-second-floor").classList.toggle("active", isSecondFloor);
    document.getElementById("parcel-view-panel").classList.toggle("active", isParcel);
    document.getElementById("garden-view-panel").classList.toggle("active", isGarden);
    document.getElementById("patio-view-panel").classList.toggle("active", isPatio);
    document.getElementById("interior-design-view-panel").classList.toggle("active", isInteriorDesign);
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
    const interiorDesignCanvas = document.getElementById("interior-design-canvas");
    const basementCanvas = document.getElementById("basement-canvas");
    const firstFloorCanvas = document.getElementById("first-floor-canvas");
    const secondFloorCanvas = document.getElementById("second-floor-canvas");
    parcelCanvas.innerHTML = buildParcelSvg(state.assessment);
    gardenCanvas.innerHTML = buildGardenSvg(state.assessment);
    patioCanvas.innerHTML = buildPatioSvg(state.assessment);
    interiorDesignCanvas.innerHTML = buildInteriorDesignView();
    basementCanvas.innerHTML = buildFloorPlanSvg(state.assessment, "basement");
    firstFloorCanvas.innerHTML = buildFloorPlanSvg(state.assessment, "first-floor");
    secondFloorCanvas.innerHTML = buildFloorPlanSvg(state.assessment, "second-floor");

    [parcelCanvas, gardenCanvas, patioCanvas, interiorDesignCanvas, basementCanvas, firstFloorCanvas, secondFloorCanvas].forEach((canvas) => {
        canvas.querySelectorAll("[data-kind][data-id]").forEach((element) => {
            element.addEventListener("click", () => {
                setSelection(element.dataset.kind, element.dataset.id);
            });
        });
    });

    updateZoomControls();
}

function buildInteriorDesignView() {
    const designs = getInteriorDesignObjects();
    if (!designs.length) {
        return '<div class="placeholder">Add room objects to populate room design schemes.</div>';
    }

    const selectedId = state.selectedKind === "interior-design" ? state.selectedId : "";
    const selectedDesign = selectedId ? designs.find((item) => item.id === selectedId) : null;
    const totalBudget = designs.reduce((sum, item) => sum + Number(item.properties.estimated_budget || 0), 0);
    const paletteNames = Array.from(new Set(designs.map((item) => item.properties.palette_name))).join(", ");
    const cards = designs.map((item) => buildInteriorDesignCard(item, selectedId)).join("");

    return `
        <div class="interior-design-board">
            ${selectedDesign ? buildInteriorRoomDesignWindow(selectedDesign) : ""}
            <div class="interior-design-summary">
                <div>
                    <span class="metric-label">Room Designs</span>
                    <strong>${escapeHtml(String(designs.length))}</strong>
                </div>
                <div>
                    <span class="metric-label">Budget</span>
                    <strong>${escapeHtml(formatCurrency(totalBudget, "USD"))}</strong>
                </div>
                <div>
                    <span class="metric-label">Palettes</span>
                    <strong>${escapeHtml(paletteNames || "Unassigned")}</strong>
                </div>
            </div>
            <div class="interior-design-grid">${cards}</div>
        </div>
    `;
}

function buildInteriorRoomDesignWindow(item) {
    const hasEditableComponents = isEditableInteriorComponentRoom(item);
    const swatches = item.properties.palette_colors.map((color) => `
        <span class="interior-swatch" style="background:${escapeHtml(color.hex)}" title="${escapeHtml(color.name)}"></span>
    `).join("");
    const colorEditors = item.properties.palette_colors.map((color, index) => `
        <label class="interior-color-editor">
            <span>${escapeHtml(color.name)}</span>
            <input type="color" value="${escapeHtml(color.hex)}" data-interior-color-index="${index}" aria-label="${escapeHtml(color.name)} color">
        </label>
    `).join("");
    return `
        <section class="interior-room-window">
            <div class="interior-room-preview">
                ${hasEditableComponents ? buildInteriorComponentToolbar(item) : ""}
                <div class="interior-room-stage">${buildInteriorRoomFloorSvg(item)}</div>
                ${hasEditableComponents ? '<p class="interior-fixture-hint">Drag room components to place or resize them. Select a wall, door, or window to adjust its edge and span.</p>' : ""}
            </div>
            <div class="interior-room-spec">
                <span class="catalog-kind">${escapeHtml(item.properties.level_name)}</span>
                <h3>${escapeHtml(item.properties.room_label)}</h3>
                <p>${escapeHtml(item.properties.scheme_name)}</p>
                <div class="interior-card-row">${swatches}</div>
                ${buildInteriorRoomSizeEditor(item)}
                ${hasEditableComponents ? buildBathroomFixtureInspector(item) : ""}
                ${buildInteriorStructureInspector(item)}
                <div class="interior-edit-grid">
                    <label>
                        <span>Floor Finish</span>
                        <input type="text" value="${escapeHtml(item.properties.primary_finish)}" data-interior-field="primary_finish">
                    </label>
                    <label>
                        <span>Material</span>
                        <input type="text" value="${escapeHtml(item.properties.material_name)}" data-interior-field="material_name">
                    </label>
                    <label>
                        <span>Furniture</span>
                        <input type="text" value="${escapeHtml(item.properties.furniture_anchor)}" data-interior-field="furniture_anchor">
                    </label>
                    <label>
                        <span>Lighting</span>
                        <input type="text" value="${escapeHtml(item.properties.lighting_fixture)}" data-interior-field="lighting_fixture">
                    </label>
                    <label>
                        <span>Budget</span>
                        <input type="number" min="0" step="50" value="${escapeHtml(String(item.properties.estimated_budget))}" data-interior-field="estimated_budget">
                    </label>
                    <label>
                        <span>Status</span>
                        <select data-interior-field="procurement_status">
                            ${["candidate", "approved", "ordered", "delivered", "installed"].map((status) => `
                                <option value="${status}" ${status === item.properties.procurement_status ? "selected" : ""}>${titleCase(status)}</option>
                            `).join("")}
                        </select>
                    </label>
                </div>
                <div class="interior-color-grid">${colorEditors}</div>
                <dl class="interior-spec-list">
                    <div><dt>Floor</dt><dd data-interior-spec="primary_finish">${escapeHtml(item.properties.primary_finish)}</dd></div>
                    <div><dt>Material</dt><dd data-interior-spec="material_name">${escapeHtml(item.properties.material_name)}</dd></div>
                    <div><dt>Furniture</dt><dd data-interior-spec="furniture_anchor">${escapeHtml(item.properties.furniture_anchor)}</dd></div>
                    <div><dt>Lighting</dt><dd data-interior-spec="lighting_fixture">${escapeHtml(item.properties.lighting_fixture)}</dd></div>
                    <div><dt>Budget</dt><dd data-interior-spec="estimated_budget">${escapeHtml(formatCurrency(item.properties.estimated_budget, item.properties.cost_currency))}</dd></div>
                </dl>
            </div>
        </section>
    `;
}

function buildInteriorRoomSizeEditor(item) {
    const linearUnit = String(item?.properties?.linear_unit || "feet");
    const unitLabel = linearUnit === "feet" || linearUnit === "coordinate units"
        ? "ft"
        : linearUnit === "inches" ? "in" : linearUnit === "centimeters" ? "cm" : linearUnit === "meters" ? "m" : linearUnit;
    const step = linearUnit === "meters"
        ? 0.0254
        : linearUnit === "centimeters"
            ? 2.54
            : linearUnit === "inches" ? 1 : 0.083333;
    return `
        <section class="interior-room-size-editor">
            <div class="interior-fixture-inspector-title">Room size · 1 in increments</div>
            <div class="interior-fixture-fields">
                ${buildInteriorRoomDimensionField("Width", "width", item.properties.room_width, unitLabel, step)}
                ${buildInteriorRoomDimensionField("Depth", "height", item.properties.room_height, unitLabel, step)}
            </div>
        </section>
    `;
}

function buildInteriorRoomDimensionField(label, dimension, value, unitLabel, step) {
    return `
        <label>
            <span>${escapeHtml(label)}</span>
            <span class="interior-fixture-input">
                <input type="number" min="1" step="${step}" value="${escapeHtml(String(roundValue(Number(value || 0), 4)))}"
                    data-interior-room-dimension="${dimension}" aria-label="Room ${label.toLowerCase()}">
                <span>${escapeHtml(unitLabel)}</span>
            </span>
        </label>
    `;
}

const INTERIOR_COMPONENT_TYPES = {
    vanity: { label: "Vanity", widthInches: 48, depthInches: 22, rooms: ["bathroom"] },
    shower: { label: "Shower", widthInches: 30, depthInches: 30, rooms: ["bathroom"] },
    bathtub: { label: "Bathtub", widthInches: 60, depthInches: 36, rooms: ["bathroom"] },
    toilet: { label: "Toilet", widthInches: 30, depthInches: 48, rooms: ["bathroom"] },
    bed: { label: "Bed", widthInches: 60, depthInches: 80, rooms: ["bedroom"] },
    nightstand: { label: "Nightstand", widthInches: 24, depthInches: 20, rooms: ["bedroom"] },
    dresser: { label: "Dresser", widthInches: 60, depthInches: 20, rooms: ["bedroom"] },
    wardrobe: { label: "Wardrobe", widthInches: 48, depthInches: 24, rooms: ["bedroom"] },
    chair: { label: "Chair", widthInches: 30, depthInches: 30, rooms: ["bedroom", "general"] },
    sofa: { label: "Sofa", widthInches: 84, depthInches: 36, rooms: ["general"] },
    table: { label: "Table", widthInches: 48, depthInches: 30, rooms: ["general"] },
    storage: { label: "Storage", widthInches: 60, depthInches: 18, rooms: ["general"] },
};
const FIXTURE_SIZE_GRID_INCHES = 0.5;
const FIXTURE_DIRECTION_OPTIONS = [
    { value: 0, label: "Up" },
    { value: 90, label: "Right" },
    { value: 180, label: "Down" },
    { value: 270, label: "Left" },
];

function getInteriorComponentRoomCategory(item) {
    if (!item?.properties) {
        return "";
    }
    const roomType = String(item?.properties?.room_type || "").toLowerCase();
    if (roomType.includes("bath")) {
        return "bathroom";
    }
    if (roomType.includes("bed")) {
        return "bedroom";
    }
    return "general";
}

function isEditableInteriorComponentRoom(item) {
    return Boolean(getInteriorComponentRoomCategory(item));
}

function getInteriorComponentTypes(item) {
    const category = getInteriorComponentRoomCategory(item);
    return Object.entries(INTERIOR_COMPONENT_TYPES).filter(([, config]) => config.rooms.includes(category));
}

function buildInteriorComponentToolbar(item) {
    const buttons = getInteriorComponentTypes(item).map(([type, config]) => `
        <button type="button" data-fixture-add="${type}">+ ${escapeHtml(config.label)}</button>
    `).join("");
    return `
        <div class="interior-fixture-toolbar" aria-label="Add room component">
            <span>Components</span>
            ${buttons}
            <span class="interior-toolbar-section">Structure</span>
            <button type="button" data-interior-segment-add="walls">+ Wall</button>
            <button type="button" data-interior-segment-add="doors">+ Door</button>
            <button type="button" data-interior-segment-add="windows">+ Window</button>
        </div>
    `;
}

function buildBathroomFixtureInspector(item) {
    const fixtures = getBathroomFixtures(item);
    let selected = fixtures.find((fixture) => fixture.id === state.selectedInteriorFixtureId) || null;
    if (!selected && fixtures.length && !state.selectedInteriorSegmentKind) {
        selected = fixtures[0];
        state.selectedInteriorFixtureId = selected.id;
    }
    if (!selected) {
        return `
            <section class="interior-fixture-inspector">
                <div class="interior-fixture-inspector-title">Room component</div>
                <p>Add a component to begin.</p>
            </section>
        `;
    }
    return `
        <section class="interior-fixture-inspector">
            <div class="interior-fixture-inspector-heading">
                <div>
                    <span class="interior-fixture-inspector-title">Selected component</span>
                    <strong>${escapeHtml(selected.label)}</strong>
                </div>
                <button type="button" class="interior-fixture-remove" data-fixture-remove="${escapeHtml(selected.id)}">Remove</button>
            </div>
            <div class="interior-fixture-fields">
                ${buildBathroomFixtureNumberField("Width", "width_inches", selected.width_inches, 12)}
                ${buildBathroomFixtureNumberField("Depth", "depth_inches", selected.depth_inches, 12)}
                ${buildBathroomFixtureNumberField("Left", "x_inches", selected.x_inches, 0)}
                ${buildBathroomFixtureNumberField("Top", "y_inches", selected.y_inches, 0)}
                ${buildBathroomFixtureDirectionField(selected.direction_degrees)}
            </div>
        </section>
    `;
}

function buildBathroomFixtureDirectionField(value) {
    const direction = normalizeFixtureDirection(value);
    return `
        <label>
            <span>Direction</span>
            <select data-fixture-field="direction_degrees" aria-label="Fixture direction">
                ${FIXTURE_DIRECTION_OPTIONS.map((option) => `
                    <option value="${option.value}" ${direction === option.value ? "selected" : ""}>
                        ${option.label} (${option.value}°)
                    </option>
                `).join("")}
            </select>
        </label>
    `;
}

function buildInteriorStructureInspector(item) {
    const sourceRoom = getInteriorSourceRoom(item);
    const polygonPointCount = sourceRoom ? getRoomPolygonRatios(sourceRoom).length : 0;
    const kind = state.selectedInteriorSegmentKind;
    const index = Number(state.selectedInteriorSegmentIndex);
    const list = sourceRoom && ["walls", "doors", "windows"].includes(kind)
        ? (sourceRoom.properties[kind] || [])
        : [];
    const segment = Number.isInteger(index) ? list[index] : null;
    if (!segment) {
        return `
            <section class="interior-structure-inspector">
                <div class="interior-fixture-inspector-title">Room structure</div>
                <p>Add or select a wall, door, or window to adjust it.</p>
            </section>
        `;
    }
    const singular = titleCase(kind.slice(0, -1));
    return `
        <section class="interior-structure-inspector">
            <div class="interior-fixture-inspector-heading">
                <div>
                    <span class="interior-fixture-inspector-title">Selected structure</span>
                    <strong>${escapeHtml(singular)} ${index + 1}</strong>
                </div>
                <button type="button" class="interior-fixture-remove" data-interior-segment-remove>Remove</button>
            </div>
            <div class="interior-fixture-fields">
                <label>
                    <span>Wall edge</span>
                    <select data-interior-segment-field="edge">
                        ${polygonPointCount >= 3
                            ? Array.from({ length: polygonPointCount }, (_, edgeIndex) => `
                                <option value="polygon:${edgeIndex}" ${getPolygonSegmentEdgeIndex(segment, index, polygonPointCount) === edgeIndex ? "selected" : ""}>Edge ${edgeIndex + 1}</option>
                            `).join("")
                            : ["top", "right", "bottom", "left"].map((edge) => `
                                <option value="${edge}" ${segment.edge === edge ? "selected" : ""}>${titleCase(edge)}</option>
                            `).join("")}
                    </select>
                </label>
                ${buildInteriorSegmentNumberField("Start", "start_ratio", segment.start_ratio)}
                ${buildInteriorSegmentNumberField("End", "end_ratio", segment.end_ratio)}
                ${kind === "walls" ? buildInteriorWallThicknessField(segment) : ""}
                <div class="interior-segment-length">
                    <span>Span</span>
                    <strong>${Math.max(0, Math.round((Number(segment.end_ratio) - Number(segment.start_ratio)) * 100))}%</strong>
                </div>
            </div>
        </section>
    `;
}

function buildInteriorSegmentNumberField(label, field, ratio) {
    return `
        <label>
            <span>${escapeHtml(label)}</span>
            <span class="interior-fixture-input">
                <input type="number" min="0" max="100" step="1" value="${Math.round(Number(ratio || 0) * 100)}" data-interior-segment-field="${field}">
                <span>%</span>
            </span>
        </label>
    `;
}

function buildInteriorWallThicknessField(segment) {
    return `
        <label>
            <span>Thickness</span>
            <span class="interior-fixture-input">
                <input type="number" min="1" max="24" step="0.5"
                    value="${formatNumber(getWallThicknessInches(segment))}" data-interior-segment-field="thickness_inches">
                <span>in</span>
            </span>
        </label>
    `;
}

function buildBathroomFixtureNumberField(label, field, value, minimum) {
    const step = field === "width_inches" || field === "depth_inches" ? FIXTURE_SIZE_GRID_INCHES : 1;
    return `
        <label>
            <span>${escapeHtml(label)}</span>
            <span class="interior-fixture-input">
                <input type="number" min="${minimum}" step="${step}" value="${escapeHtml(String(roundValue(value, 1)))}" data-fixture-field="${field}">
                <span>in</span>
            </span>
        </label>
    `;
}

function buildDefaultInteriorComponents(item) {
    const roomDimensions = getInteriorRoomDimensionsInches(item);
    const roomWidthInches = roomDimensions.width;
    const roomDepthInches = roomDimensions.height;
    if (getInteriorComponentRoomCategory(item) === "bedroom") {
        const bedX = Math.max(6, (roomWidthInches - INTERIOR_COMPONENT_TYPES.bed.widthInches) / 2);
        return [
            createBathroomFixture("bed", bedX, 6, "bedroom-bed"),
            createBathroomFixture("nightstand", Math.max(6, bedX - 30), 6, "bedroom-nightstand"),
            createBathroomFixture("dresser", 6, Math.max(6, roomDepthInches - 26), "bedroom-dresser"),
            createBathroomFixture("wardrobe", Math.max(6, roomWidthInches - 54), Math.max(6, roomDepthInches - 30), "bedroom-wardrobe"),
        ];
    }
    if (getInteriorComponentRoomCategory(item) === "general") {
        return [
            createBathroomFixture("sofa", 6, 6, "room-sofa"),
            createBathroomFixture("table", Math.max(6, (roomWidthInches - 48) / 2), Math.max(6, (roomDepthInches - 30) / 2), "room-table"),
            createBathroomFixture("storage", Math.max(6, roomWidthInches - 66), Math.max(6, roomDepthInches - 24), "room-storage"),
        ];
    }
    const fixtures = [
        createBathroomFixture("bathtub", 6, 6, "bath-bathtub"),
        createBathroomFixture("shower", Math.max(6, roomWidthInches - 36), 6, "bath-shower"),
        createBathroomFixture("vanity", Math.max(6, roomWidthInches - 54), Math.max(6, roomDepthInches - 28), "bath-vanity"),
        createBathroomFixture("toilet", 6, Math.max(6, roomDepthInches - 54), "bath-toilet"),
    ];
    if (isMasterBathInteriorDesign(item)) {
        const shower = fixtures.find((fixture) => fixture.id === "bath-shower");
        if (shower) {
            shower.width_inches = 47.5;
            shower.depth_inches = 34.5;
        }
        const vanity = fixtures.find((fixture) => fixture.id === "bath-vanity");
        if (vanity) {
            vanity.width_inches = 54;
            vanity.depth_inches = 22;
        }
    }
    return fixtures;
}

function createBathroomFixture(type, xInches = 6, yInches = 6, id = "") {
    const config = INTERIOR_COMPONENT_TYPES[type] || INTERIOR_COMPONENT_TYPES.vanity;
    return {
        id: id || `interior-${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type,
        label: config.label,
        x_inches: snapInches(xInches),
        y_inches: snapInches(yInches),
        width_inches: snapInches(config.widthInches),
        depth_inches: snapInches(config.depthInches),
        direction_degrees: 0,
    };
}

function normalizeFixtureDirection(value) {
    const degrees = Number(value || 0);
    return ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
}

function getFixtureDirectionLabel(value) {
    const direction = normalizeFixtureDirection(value);
    return FIXTURE_DIRECTION_OPTIONS.find((option) => option.value === direction)?.label || "Up";
}

function normalizeBathroomFixtureLayout(value, item) {
    if (!Array.isArray(value)) {
        return buildDefaultInteriorComponents(item);
    }
    const roomDimensions = getInteriorRoomDimensionsInches(item);
    return value.filter((fixture) => fixture && typeof fixture === "object").map((fixture, index) => {
        const category = getInteriorComponentRoomCategory(item);
        const fallbackType = category === "bedroom" ? "bed" : category === "bathroom" ? "vanity" : "sofa";
        const type = INTERIOR_COMPONENT_TYPES[fixture.type] ? fixture.type : fallbackType;
        const config = INTERIOR_COMPONENT_TYPES[type];
        const id = String(fixture.id || `interior-${type}-${index + 1}`);
        let widthInches = Math.max(12, Number(fixture.width_inches || config.widthInches));
        let depthInches = Math.max(12, Number(fixture.depth_inches || config.depthInches));
        let xInches = Math.max(0, Number(fixture.x_inches || 0));
        let yInches = Math.max(0, Number(fixture.y_inches || 0));
        if (id === "bath-bathtub" && type === "bathtub" && widthInches === 36 && depthInches === 72) {
            widthInches = 60;
            depthInches = 36;
            xInches = Math.max(0, roomDimensions.width - widthInches);
            yInches = Math.max(0, roomDimensions.height - depthInches);
        }
        const isKnownMasterBathShower = isMasterBathInteriorDesign(item)
            && id === "bath-shower"
            && type === "shower"
            && ((widthInches === 50 && depthInches === 30)
                || (widthInches === 51.3 && depthInches === 29.9));
        if (isKnownMasterBathShower) {
            widthInches = 47.5;
            depthInches = 34.5;
        } else if (id === "bath-shower" && type === "shower" && widthInches === 51.3 && depthInches === 29.9) {
            widthInches = 30;
            depthInches = 30;
            xInches = Math.min(6, Math.max(0, roomDimensions.width - widthInches));
            yInches = Math.max(0, roomDimensions.height - depthInches);
        }
        if (isMasterBathInteriorDesign(item)
            && id === "bath-vanity"
            && type === "vanity"
            && widthInches === 54
            && depthInches === 30) {
            widthInches = 54;
            depthInches = 22;
        }
        widthInches = snapFixtureSizeInchesWithin(widthInches, 12, roomDimensions.width);
        depthInches = snapFixtureSizeInchesWithin(depthInches, 12, roomDimensions.height);
        const normalized = {
            id,
            type,
            label: String(fixture.label || config.label),
            x_inches: snapInchesWithin(xInches, 0, Math.max(0, roomDimensions.width - widthInches)),
            y_inches: snapInchesWithin(yInches, 0, Math.max(0, roomDimensions.height - depthInches)),
            width_inches: widthInches,
            depth_inches: depthInches,
            direction_degrees: normalizeFixtureDirection(fixture.direction_degrees),
        };
        return fitFixtureToInteriorRoom(normalized, item);
    });
}

function isMasterBathInteriorDesign(item) {
    return String(item?.properties?.room_label || "").trim().toLowerCase() === "master bath";
}

function getBathroomFixtures(item) {
    return normalizeBathroomFixtureLayout(item.properties.fixture_layout, item);
}

function getBathroomFixture(sourceRoom, fixtureId) {
    if (!sourceRoom) {
        return null;
    }
    const design = buildInteriorDesignObject(sourceRoom);
    return getBathroomFixtures(design).find((fixture) => fixture.id === fixtureId) || null;
}

function setBathroomFixtureLayout(sourceRoom, fixtures) {
    const current = normalizeInteriorDesignOverrides(sourceRoom.properties.interior_design);
    sourceRoom.properties.interior_design = sanitizeInteriorDesignOverrides({
        ...current,
        fixture_layout: fixtures,
    });
}

function getInteriorPixelsPerInch(item) {
    const roomDimensions = getInteriorRoomDimensionsInches(item);
    const canvasWidth = 560;
    const canvasHeight = 320;
    const margin = 34;
    return Math.min(
        (canvasWidth - margin * 2) / roomDimensions.width,
        (canvasHeight - margin * 2) / roomDimensions.height,
    );
}

function getInteriorRoomDimensionsInches(item) {
    const linearUnit = String(item?.properties?.linear_unit || "feet");
    return {
        width: Math.max(convertRoomLengthToInches(Number(item?.properties?.room_width || 1), linearUnit), 1),
        height: Math.max(convertRoomLengthToInches(Number(item?.properties?.room_height || 1), linearUnit), 1),
    };
}

function getInteriorRoomPolygonRatios(item) {
    const sourceRoom = getInteriorSourceRoom(item);
    const polygon = getRoomPolygonRatios(sourceRoom);
    if (polygon.length < 3) {
        return [];
    }
    const xs = polygon.map((point) => point[0]);
    const ys = polygon.map((point) => point[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(Math.max(...xs) - minX, 0.0001);
    const spanY = Math.max(Math.max(...ys) - minY, 0.0001);
    return polygon.map((point) => [
        clamp((point[0] - minX) / spanX, 0, 1),
        clamp((point[1] - minY) / spanY, 0, 1),
    ]);
}

function getInteriorRoomPolygonInches(item) {
    const dimensions = getInteriorRoomDimensionsInches(item);
    return getInteriorRoomPolygonRatios(item).map((point) => [
        point[0] * dimensions.width,
        point[1] * dimensions.height,
    ]);
}

function isPointOnPolygonEdge(point, start, end, tolerance = 0.01) {
    const cross = ((point[1] - start[1]) * (end[0] - start[0]))
        - ((point[0] - start[0]) * (end[1] - start[1]));
    if (Math.abs(cross) > tolerance) {
        return false;
    }
    const dot = ((point[0] - start[0]) * (end[0] - start[0]))
        + ((point[1] - start[1]) * (end[1] - start[1]));
    const squaredLength = ((end[0] - start[0]) ** 2) + ((end[1] - start[1]) ** 2);
    return dot >= -tolerance && dot <= squaredLength + tolerance;
}

function isPointInsidePolygon(point, polygon) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
        const start = polygon[previous];
        const end = polygon[index];
        if (isPointOnPolygonEdge(point, start, end)) {
            return true;
        }
        const intersects = ((end[1] > point[1]) !== (start[1] > point[1]))
            && (point[0] < ((start[0] - end[0]) * (point[1] - end[1]) / ((start[1] - end[1]) || 1e-9)) + end[0]);
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}

function isFixtureInsideInteriorRoom(fixture, item) {
    const polygon = getInteriorRoomPolygonInches(item);
    if (polygon.length < 3) {
        return true;
    }
    const left = Number(fixture.x_inches || 0);
    const top = Number(fixture.y_inches || 0);
    const right = left + Number(fixture.width_inches || 0);
    const bottom = top + Number(fixture.depth_inches || 0);
    return [[left, top], [right, top], [right, bottom], [left, bottom]]
        .every((point) => isPointInsidePolygon(point, polygon));
}

function fitFixtureToInteriorRoom(fixture, item, fallback = null) {
    const polygon = getInteriorRoomPolygonRatios(item);
    if (polygon.length < 3) {
        return fixture;
    }
    const dimensions = getInteriorRoomDimensionsInches(item);
    const maxX = Math.max(0, dimensions.width - fixture.width_inches);
    const maxY = Math.max(0, dimensions.height - fixture.depth_inches);
    const requested = {
        ...fixture,
        x_inches: snapInchesWithin(fixture.x_inches, 0, maxX),
        y_inches: snapInchesWithin(fixture.y_inches, 0, maxY),
    };
    if (isFixtureInsideInteriorRoom(requested, item)) {
        return requested;
    }

    const fallbackFixture = fallback ? {
        ...requested,
        x_inches: snapInchesWithin(fallback.x_inches, 0, maxX),
        y_inches: snapInchesWithin(fallback.y_inches, 0, maxY),
    } : null;
    const directCandidates = fallbackFixture ? [
        { ...requested, y_inches: fallbackFixture.y_inches },
        { ...requested, x_inches: fallbackFixture.x_inches },
        fallbackFixture,
    ] : [];
    const direct = directCandidates.find((candidate) => isFixtureInsideInteriorRoom(candidate, item));
    if (direct) {
        return direct;
    }

    const step = Math.max(DESIGN_GRID_INCHES, snapInches(Math.min(dimensions.width, dimensions.height) / 40));
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const xPositions = Array.from({ length: Math.floor(maxX / step) + 1 }, (_, index) => snapInches(index * step));
    const yPositions = Array.from({ length: Math.floor(maxY / step) + 1 }, (_, index) => snapInches(index * step));
    const maxGridX = Math.floor(maxX / DESIGN_GRID_INCHES) * DESIGN_GRID_INCHES;
    const maxGridY = Math.floor(maxY / DESIGN_GRID_INCHES) * DESIGN_GRID_INCHES;
    if (!xPositions.includes(maxGridX)) xPositions.push(maxGridX);
    if (!yPositions.includes(maxGridY)) yPositions.push(maxGridY);
    yPositions.forEach((candidateY) => xPositions.forEach((candidateX) => {
        const candidate = { ...requested, x_inches: candidateX, y_inches: candidateY };
        if (!isFixtureInsideInteriorRoom(candidate, item)) {
            return;
        }
        const distance = ((candidateX - requested.x_inches) ** 2) + ((candidateY - requested.y_inches) ** 2);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }));
    return best || requested;
}

function getInteriorRoomScreenPolygon(item, x, y, width, height) {
    const polygon = getInteriorRoomPolygonRatios(item);
    if (polygon.length < 3) {
        return [
            { x, y },
            { x: x + width, y },
            { x: x + width, y: y + height },
            { x, y: y + height },
        ];
    }
    return polygon.map((point) => ({
        x: x + (point[0] * width),
        y: y + (point[1] * height),
    }));
}

function formatSvgPolygonPoints(points, offsetX = 0, offsetY = 0) {
    return points.map((point) => `${(point.x + offsetX).toFixed(1)},${(point.y + offsetY).toFixed(1)}`).join(" ");
}

function buildInteriorRoomFloorSvg(item) {
    const colors = item.properties.palette_colors || [];
    const floorColor = colors[0]?.hex || "#ECE7DD";
    const accentColor = colors[1]?.hex || "#91A389";
    const darkColor = colors[2]?.hex || "#4B5357";
    const roomDimensions = getInteriorRoomDimensionsInches(item);
    const canvasWidth = 560;
    const canvasHeight = 320;
    const margin = 34;
    const ratio = getInteriorPixelsPerInch(item);
    const width = roomDimensions.width * ratio;
    const height = roomDimensions.height * ratio;
    const x = (canvasWidth - width) / 2;
    const y = (canvasHeight - height) / 2;
    const roomPolygon = getInteriorRoomScreenPolygon(item, x, y, width, height);
    const polygonPoints = formatSvgPolygonPoints(roomPolygon);
    const shadowPoints = formatSvgPolygonPoints(roomPolygon, 8, 8);
    const svgId = String(item.id || "room").replace(/[^A-Za-z0-9_-]/g, "-");
    const clipId = `interior-room-clip-${svgId}`;
    const gridId = `interior-floor-grid-${svgId}`;
    const majorGridId = `interior-floor-grid-major-${svgId}`;
    const minorGridSpacing = Math.max(ratio * DESIGN_GRID_INCHES, 0.01);
    const majorGridSpacing = Math.max(ratio * DESIGN_GRID_MAJOR_INCHES, 0.01);
    const furniture = buildInteriorFurnitureSvg(item, x, y, width, height, accentColor, darkColor);
    const structure = buildInteriorBoundarySvg(item, x, y, width, height, roomPolygon);
    const selectedLabel = `${item.properties.room_label} floor design`;
    const zoomPercent = Math.max(DETAIL_ZOOM_MIN, state.detailZoom || 1) * 100;

    return `
        <svg class="interior-floor-svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" role="img"
            aria-label="${escapeHtml(selectedLabel)}" style="width:${zoomPercent.toFixed(1)}%">
            <defs>
                <pattern id="${gridId}" x="${x.toFixed(4)}" y="${y.toFixed(4)}"
                    width="${minorGridSpacing.toFixed(6)}" height="${minorGridSpacing.toFixed(6)}" patternUnits="userSpaceOnUse">
                    <path d="M ${minorGridSpacing.toFixed(6)} 0 L 0 0 0 ${minorGridSpacing.toFixed(6)}" class="interior-floor-grid-line"></path>
                </pattern>
                <pattern id="${majorGridId}" x="${x.toFixed(4)}" y="${y.toFixed(4)}"
                    width="${majorGridSpacing.toFixed(6)}" height="${majorGridSpacing.toFixed(6)}" patternUnits="userSpaceOnUse">
                    <path d="M ${majorGridSpacing.toFixed(6)} 0 L 0 0 0 ${majorGridSpacing.toFixed(6)}" class="interior-floor-grid-major-line"></path>
                </pattern>
                <clipPath id="${clipId}">
                    <polygon points="${polygonPoints}"></polygon>
                </clipPath>
            </defs>
            <polygon class="interior-floor-shadow" points="${shadowPoints}"></polygon>
            <polygon class="interior-floor-fill" points="${polygonPoints}" style="fill:${escapeHtml(floorColor)}"></polygon>
            <polygon class="interior-floor-grid" points="${polygonPoints}" fill="url(#${gridId})"></polygon>
            <polygon class="interior-floor-grid interior-floor-grid-major" points="${polygonPoints}" fill="url(#${majorGridId})"></polygon>
            <polygon class="interior-floor-outline" points="${polygonPoints}"></polygon>
            <g clip-path="url(#${clipId})">${furniture}</g>
            ${structure}
            <text class="interior-floor-title" x="${x.toFixed(1)}" y="${Math.max(22, y - 12).toFixed(1)}">${escapeHtml(item.properties.room_label)}</text>
            <text class="interior-floor-note" x="${x.toFixed(1)}" y="${(y + height + 22).toFixed(1)}">${escapeHtml(`${item.properties.primary_finish} · 1 in grid`)}</text>
        </svg>
    `;
}

function buildInteriorBoundarySvg(item, x, y, width, height, roomPolygon = []) {
    const sourceRoom = getInteriorSourceRoom(item);
    if (!sourceRoom) {
        return "";
    }
    const polygon = getRoomPolygonRatios(sourceRoom);
    if (polygon.length >= 3 && roomPolygon.length >= 3) {
        return buildInteriorPolygonBoundarySvg(item, sourceRoom, roomPolygon);
    }
    const groups = [
        ["walls", normalizeRoomWalls(sourceRoom.properties.walls)],
        ["doors", normalizeRoomOpenings(sourceRoom.properties.doors)],
        ["windows", normalizeRoomOpenings(sourceRoom.properties.windows)],
    ];
    return groups.map(([kind, segments]) => segments.map((segment, index) => {
        const rect = kind === "walls"
            ? buildWallRectFromPlacement(sourceRoom, segment, x, y, width, height, 0.25)
            : buildOpeningRectFromPlacement(segment, x, y, width, height, sourceRoom, 0.25);
        if (!rect) {
            return "";
        }
        const selected = state.selectedInteriorSegmentKind === kind && state.selectedInteriorSegmentIndex === index;
        const typeClass = kind === "walls" ? "wall" : kind === "doors" ? "door" : "window";
        const dimension = kind === "walls"
            ? buildInteriorRectWallDimension(item, sourceRoom, segment, x, y, width, height, selected)
            : "";
        const openingStart = {
            x: rect.x + (rect.width >= rect.height ? 0 : rect.width / 2),
            y: rect.y + (rect.width >= rect.height ? rect.height / 2 : 0),
        };
        const openingEnd = {
            x: rect.x + (rect.width >= rect.height ? rect.width : rect.width / 2),
            y: rect.y + (rect.width >= rect.height ? rect.height / 2 : rect.height),
        };
        const openingLabel = kind === "walls"
            ? ""
            : buildInteriorOpeningLabel(typeClass, openingStart, openingEnd);
        const doorSwing = kind === "doors"
            ? buildInteriorDoorSwing(openingStart, openingEnd, getInteriorRectInwardNormal(segment.edge))
            : "";
        return `
            <rect class="interior-boundary-segment interior-${typeClass} ${selected ? "selected" : ""}"
                x="${rect.x.toFixed(1)}" y="${rect.y.toFixed(1)}" width="${rect.width.toFixed(1)}" height="${rect.height.toFixed(1)}"
                data-interior-segment-kind="${kind}" data-interior-segment-index="${index}"
                role="button" tabindex="0" aria-label="${titleCase(typeClass)} ${index + 1}"></rect>
            ${dimension}
            ${doorSwing}
            ${openingLabel}
        `;
    }).join("")).join("");
}

function buildInteriorPolygonBoundarySvg(item, sourceRoom, roomPolygon) {
    const pointCount = roomPolygon.length;
    const pixelsPerInch = getInteriorPixelsPerInch(item);
    const groups = [
        ["walls", normalizeRoomWalls(sourceRoom.properties.walls)],
        ["doors", normalizeRoomOpenings(sourceRoom.properties.doors)],
        ["windows", normalizeRoomOpenings(sourceRoom.properties.windows)],
    ];
    return groups.map(([kind, segments]) => segments.map((segment, index) => {
        const edgeIndex = getPolygonSegmentEdgeIndex(segment, index, pointCount);
        const edgeStart = roomPolygon[edgeIndex];
        const edgeEnd = roomPolygon[(edgeIndex + 1) % pointCount];
        const start = interpolateScreenPoint(edgeStart, edgeEnd, clamp(Number(segment.start_ratio ?? 0), 0, 1));
        const end = interpolateScreenPoint(edgeStart, edgeEnd, clamp(Number(segment.end_ratio ?? 1), 0, 1));
        const hostWall = kind === "walls" ? segment : findPolygonHostWall(sourceRoom, edgeIndex);
        const strokeWidth = Math.max(kind === "walls" ? 2 : 3, getWallThicknessInches(hostWall) * pixelsPerInch);
        const selected = state.selectedInteriorSegmentKind === kind && state.selectedInteriorSegmentIndex === index;
        const typeClass = kind === "walls" ? "wall" : kind === "doors" ? "door" : "window";
        const dimension = kind === "walls"
            ? buildInteriorPolygonWallDimension(sourceRoom, segment, edgeStart, edgeEnd, start, end, strokeWidth, selected)
            : "";
        const openingLabel = kind === "walls" ? "" : buildInteriorOpeningLabel(typeClass, start, end);
        const doorSwing = kind === "doors"
            ? buildInteriorDoorSwing(start, end, getInteriorPolygonInwardNormal(roomPolygon, start, end))
            : "";
        return `
            <line class="interior-boundary-segment interior-${typeClass} ${selected ? "selected" : ""}"
                x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}"
                style="stroke-width:${strokeWidth.toFixed(2)}px"
                data-interior-segment-kind="${kind}" data-interior-segment-index="${index}"
                role="button" tabindex="0" aria-label="${titleCase(typeClass)} ${index + 1}"></line>
            ${dimension}
            ${doorSwing}
            ${openingLabel}
        `;
    }).join("")).join("");
}

function buildInteriorOpeningLabel(typeClass, start, end) {
    const label = typeClass === "door" ? "Door" : "Window";
    const midpoint = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
    };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle > 90 || angle < -90) {
        angle += 180;
    }
    return `
        <text class="interior-opening-label interior-${typeClass}-label" text-anchor="middle"
            transform="translate(${midpoint.x.toFixed(2)} ${midpoint.y.toFixed(2)}) rotate(${angle.toFixed(2)}) translate(0 -4)"
            aria-hidden="true">${label}</text>
    `;
}

function getInteriorRectInwardNormal(edge) {
    const normals = {
        top: { x: 0, y: 1 },
        right: { x: -1, y: 0 },
        bottom: { x: 0, y: -1 },
        left: { x: 1, y: 0 },
    };
    return normals[String(edge || "top")] || normals.top;
}

function getInteriorPolygonInwardNormal(roomPolygon, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const candidate = { x: -dy / length, y: dx / length };
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const centroid = getScreenPolygonCentroid(roomPolygon);
    const pointsInward = (candidate.x * (centroid.x - midpoint.x)) + (candidate.y * (centroid.y - midpoint.y)) >= 0;
    return pointsInward ? candidate : { x: -candidate.x, y: -candidate.y };
}

function buildInteriorDoorSwing(start, end, inwardNormal) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const tangent = { x: dx / length, y: dy / length };
    const normalLength = Math.max(Math.hypot(inwardNormal.x, inwardNormal.y), 1);
    const normal = { x: inwardNormal.x / normalLength, y: inwardNormal.y / normalLength };
    const openEnd = {
        x: start.x + (normal.x * length),
        y: start.y + (normal.y * length),
    };
    const sweep = ((tangent.x * normal.y) - (tangent.y * normal.x)) >= 0 ? 1 : 0;
    return `
        <g class="interior-door-swing" aria-hidden="true">
            <line class="interior-door-leaf" x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}"
                x2="${openEnd.x.toFixed(2)}" y2="${openEnd.y.toFixed(2)}"></line>
            <path class="interior-door-swing-arc"
                d="M ${end.x.toFixed(2)} ${end.y.toFixed(2)} A ${length.toFixed(2)} ${length.toFixed(2)} 0 0 ${sweep} ${openEnd.x.toFixed(2)} ${openEnd.y.toFixed(2)}"></path>
            <circle class="interior-door-hinge" cx="${start.x.toFixed(2)}" cy="${start.y.toFixed(2)}" r="2"></circle>
        </g>
    `;
}

function buildInteriorRectWallDimension(item, sourceRoom, segment, x, y, width, height, selected) {
    const edge = String(segment.edge || "top");
    const startRatio = clamp(Math.min(Number(segment.start_ratio ?? 0), Number(segment.end_ratio ?? 1)), 0, 1);
    const endRatio = clamp(Math.max(Number(segment.start_ratio ?? 0), Number(segment.end_ratio ?? 1)), 0, 1);
    let start;
    let end;
    let normal;
    if (edge === "top") {
        start = { x: x + (width * startRatio), y };
        end = { x: x + (width * endRatio), y };
        normal = { x: 0, y: 1 };
    } else if (edge === "bottom") {
        start = { x: x + (width * startRatio), y: y + height };
        end = { x: x + (width * endRatio), y: y + height };
        normal = { x: 0, y: -1 };
    } else if (edge === "left") {
        start = { x, y: y + (height * startRatio) };
        end = { x, y: y + (height * endRatio) };
        normal = { x: 1, y: 0 };
    } else {
        start = { x: x + width, y: y + (height * startRatio) };
        end = { x: x + width, y: y + (height * endRatio) };
        normal = { x: -1, y: 0 };
    }
    const offset = Math.max(14, (getWallThicknessInches(segment) * getInteriorPixelsPerInch(item)) / 2 + 9);
    return buildInteriorWallDimensionMarkup(sourceRoom, segment, start, end, normal, offset, selected);
}

function buildInteriorPolygonWallDimension(sourceRoom, segment, edgeStart, edgeEnd, start, end, strokeWidth, selected) {
    const dx = edgeEnd.x - edgeStart.x;
    const dy = edgeEnd.y - edgeStart.y;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const normal = { x: -dy / length, y: dx / length };
    const offset = Math.max(14, (strokeWidth / 2) + 9);
    return buildInteriorWallDimensionMarkup(sourceRoom, segment, start, end, normal, offset, selected);
}

function buildInteriorWallDimensionMarkup(sourceRoom, segment, start, end, normal, offset, selected) {
    const label = `${formatRoomWallLength(sourceRoom, segment)} · t ${formatNumber(getWallThicknessInches(segment))}\"`;
    const dimensionStart = { x: start.x + (normal.x * offset), y: start.y + (normal.y * offset) };
    const dimensionEnd = { x: end.x + (normal.x * offset), y: end.y + (normal.y * offset) };
    const midpoint = { x: (dimensionStart.x + dimensionEnd.x) / 2, y: (dimensionStart.y + dimensionEnd.y) / 2 };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const edgeLength = Math.max(Math.hypot(dx, dy), 1);
    const tangent = { x: dx / edgeLength, y: dy / edgeLength };
    const capLength = 5;
    const arrowLength = Math.min(7, edgeLength / 4);
    const arrowWidth = Math.min(3.5, edgeLength / 8);
    const startArrowBase = {
        x: dimensionStart.x + (tangent.x * arrowLength),
        y: dimensionStart.y + (tangent.y * arrowLength),
    };
    const endArrowBase = {
        x: dimensionEnd.x - (tangent.x * arrowLength),
        y: dimensionEnd.y - (tangent.y * arrowLength),
    };
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle > 90 || angle < -90) {
        angle += 180;
    }
    return `
        <g class="interior-wall-dimension-group ${selected ? "selected" : ""}" aria-label="Wall dimension ${escapeHtml(label)}">
            <line class="interior-wall-dimension-extension" x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}" x2="${dimensionStart.x.toFixed(2)}" y2="${dimensionStart.y.toFixed(2)}"></line>
            <line class="interior-wall-dimension-extension" x1="${end.x.toFixed(2)}" y1="${end.y.toFixed(2)}" x2="${dimensionEnd.x.toFixed(2)}" y2="${dimensionEnd.y.toFixed(2)}"></line>
            <line class="interior-wall-dimension-line" x1="${dimensionStart.x.toFixed(2)}" y1="${dimensionStart.y.toFixed(2)}" x2="${dimensionEnd.x.toFixed(2)}" y2="${dimensionEnd.y.toFixed(2)}"></line>
            <line class="interior-wall-dimension-cap" x1="${(dimensionStart.x - (normal.x * capLength)).toFixed(2)}" y1="${(dimensionStart.y - (normal.y * capLength)).toFixed(2)}" x2="${(dimensionStart.x + (normal.x * capLength)).toFixed(2)}" y2="${(dimensionStart.y + (normal.y * capLength)).toFixed(2)}"></line>
            <line class="interior-wall-dimension-cap" x1="${(dimensionEnd.x - (normal.x * capLength)).toFixed(2)}" y1="${(dimensionEnd.y - (normal.y * capLength)).toFixed(2)}" x2="${(dimensionEnd.x + (normal.x * capLength)).toFixed(2)}" y2="${(dimensionEnd.y + (normal.y * capLength)).toFixed(2)}"></line>
            <path class="interior-wall-dimension-arrow" d="M ${(startArrowBase.x - (normal.x * arrowWidth)).toFixed(2)} ${(startArrowBase.y - (normal.y * arrowWidth)).toFixed(2)} L ${dimensionStart.x.toFixed(2)} ${dimensionStart.y.toFixed(2)} L ${(startArrowBase.x + (normal.x * arrowWidth)).toFixed(2)} ${(startArrowBase.y + (normal.y * arrowWidth)).toFixed(2)}"></path>
            <path class="interior-wall-dimension-arrow" d="M ${(endArrowBase.x - (normal.x * arrowWidth)).toFixed(2)} ${(endArrowBase.y - (normal.y * arrowWidth)).toFixed(2)} L ${dimensionEnd.x.toFixed(2)} ${dimensionEnd.y.toFixed(2)} L ${(endArrowBase.x + (normal.x * arrowWidth)).toFixed(2)} ${(endArrowBase.y + (normal.y * arrowWidth)).toFixed(2)}"></path>
            <text class="interior-wall-dimension" text-anchor="middle" transform="translate(${midpoint.x.toFixed(2)} ${midpoint.y.toFixed(2)}) rotate(${angle.toFixed(2)}) translate(0 -4)">${escapeHtml(label)}</text>
        </g>
    `;
}

function buildInteriorFurnitureSvg(item, x, y, width, height, accentColor, darkColor) {
    const roomType = String(item.properties.room_type || "").toLowerCase();
    if (isEditableInteriorComponentRoom(item)) {
        return buildBathroomFixturesSvg(item, x, y, width, accentColor, darkColor);
    }
    if (roomType.includes("kitchen")) {
        return `
            <rect class="interior-fixture" x="${(x + width * 0.05).toFixed(1)}" y="${(y + height * 0.08).toFixed(1)}" width="${(width * 0.9).toFixed(1)}" height="${(height * 0.16).toFixed(1)}" rx="6" style="fill:${escapeHtml(darkColor)}"></rect>
            <rect class="interior-furniture" x="${(x + width * 0.32).toFixed(1)}" y="${(y + height * 0.42).toFixed(1)}" width="${(width * 0.36).toFixed(1)}" height="${(height * 0.22).toFixed(1)}" rx="8" style="fill:${escapeHtml(accentColor)}"></rect>
            <circle class="interior-light" cx="${(x + width * 0.42).toFixed(1)}" cy="${(y + height * 0.32).toFixed(1)}" r="8"></circle>
            <circle class="interior-light" cx="${(x + width * 0.58).toFixed(1)}" cy="${(y + height * 0.32).toFixed(1)}" r="8"></circle>
        `;
    }
    if (roomType.includes("garage")) {
        return `
            <rect class="interior-fixture" x="${(x + width * 0.06).toFixed(1)}" y="${(y + height * 0.08).toFixed(1)}" width="${(width * 0.16).toFixed(1)}" height="${(height * 0.84).toFixed(1)}" rx="5" style="fill:${escapeHtml(darkColor)}"></rect>
            <rect class="interior-furniture" x="${(x + width * 0.52).toFixed(1)}" y="${(y + height * 0.16).toFixed(1)}" width="${(width * 0.36).toFixed(1)}" height="${(height * 0.22).toFixed(1)}" rx="6" style="fill:${escapeHtml(accentColor)}"></rect>
            <line class="interior-light-line" x1="${(x + width * 0.34).toFixed(1)}" y1="${(y + height * 0.28).toFixed(1)}" x2="${(x + width * 0.46).toFixed(1)}" y2="${(y + height * 0.28).toFixed(1)}"></line>
            <line class="interior-light-line" x1="${(x + width * 0.34).toFixed(1)}" y1="${(y + height * 0.62).toFixed(1)}" x2="${(x + width * 0.46).toFixed(1)}" y2="${(y + height * 0.62).toFixed(1)}"></line>
        `;
    }
    if (roomType.includes("stair")) {
        const steps = Array.from({ length: 7 }, (_, index) => {
            const stepY = y + height * (0.16 + index * 0.1);
            return `<line class="interior-stair-step" x1="${(x + width * 0.24).toFixed(1)}" y1="${stepY.toFixed(1)}" x2="${(x + width * 0.76).toFixed(1)}" y2="${stepY.toFixed(1)}"></line>`;
        }).join("");
        return `
            <rect class="interior-furniture" x="${(x + width * 0.22).toFixed(1)}" y="${(y + height * 0.1).toFixed(1)}" width="${(width * 0.56).toFixed(1)}" height="${(height * 0.8).toFixed(1)}" rx="8" style="fill:${escapeHtml(accentColor)}"></rect>
            ${steps}
            <path class="interior-stair-arrow" d="M ${(x + width * 0.5).toFixed(1)} ${(y + height * 0.82).toFixed(1)} L ${(x + width * 0.5).toFixed(1)} ${(y + height * 0.22).toFixed(1)} M ${(x + width * 0.45).toFixed(1)} ${(y + height * 0.3).toFixed(1)} L ${(x + width * 0.5).toFixed(1)} ${(y + height * 0.22).toFixed(1)} L ${(x + width * 0.55).toFixed(1)} ${(y + height * 0.3).toFixed(1)}"></path>
        `;
    }
    return `
        <rect class="interior-rug" x="${(x + width * 0.18).toFixed(1)}" y="${(y + height * 0.24).toFixed(1)}" width="${(width * 0.64).toFixed(1)}" height="${(height * 0.5).toFixed(1)}" rx="12" style="fill:${escapeHtml(accentColor)}"></rect>
        <rect class="interior-furniture" x="${(x + width * 0.16).toFixed(1)}" y="${(y + height * 0.12).toFixed(1)}" width="${(width * 0.3).toFixed(1)}" height="${(height * 0.18).toFixed(1)}" rx="8" style="fill:${escapeHtml(darkColor)}"></rect>
        <rect class="interior-furniture" x="${(x + width * 0.58).toFixed(1)}" y="${(y + height * 0.56).toFixed(1)}" width="${(width * 0.24).toFixed(1)}" height="${(height * 0.18).toFixed(1)}" rx="8" style="fill:${escapeHtml(darkColor)}"></rect>
        <circle class="interior-light" cx="${(x + width * 0.78).toFixed(1)}" cy="${(y + height * 0.22).toFixed(1)}" r="8"></circle>
    `;
}

function buildBathroomFixturesSvg(item, roomX, roomY, roomWidth, accentColor, darkColor) {
    const pixelsPerInch = roomWidth / getInteriorRoomDimensionsInches(item).width;
    return getBathroomFixtures(item).map((fixture) => {
        const fixtureX = roomX + fixture.x_inches * pixelsPerInch;
        const fixtureY = roomY + fixture.y_inches * pixelsPerInch;
        const fixtureWidth = fixture.width_inches * pixelsPerInch;
        const fixtureDepth = fixture.depth_inches * pixelsPerInch;
        const direction = normalizeFixtureDirection(fixture.direction_degrees);
        const swapsAxes = direction % 180 !== 0;
        const symbolWidth = swapsAxes ? fixtureDepth : fixtureWidth;
        const symbolDepth = swapsAxes ? fixtureWidth : fixtureDepth;
        const selected = fixture.id === state.selectedInteriorFixtureId;
        const fill = fixture.type === "shower" || fixture.type === "vanity" ? darkColor : accentColor;
        const content = buildBathroomFixtureSymbol(fixture, symbolWidth, symbolDepth);
        const symbolTransform = `translate(${(fixtureWidth / 2).toFixed(1)} ${(fixtureDepth / 2).toFixed(1)}) rotate(${direction}) translate(${(-symbolWidth / 2).toFixed(1)} ${(-symbolDepth / 2).toFixed(1)})`;
        const directionLabel = getFixtureDirectionLabel(direction);
        return `
            <g class="interior-fixture-component ${selected ? "selected" : ""}"
                transform="translate(${fixtureX.toFixed(1)} ${fixtureY.toFixed(1)})"
                data-fixture-id="${escapeHtml(fixture.id)}"
                data-fixture-action="move"
                role="button" tabindex="0"
                aria-label="${escapeHtml(fixture.label)}, ${formatNumber(fixture.width_inches)} by ${formatNumber(fixture.depth_inches)} inches, facing ${directionLabel}">
                <rect class="interior-fixture-hitbox" width="${fixtureWidth.toFixed(1)}" height="${fixtureDepth.toFixed(1)}" rx="5" style="fill:${escapeHtml(fill)}"></rect>
                <g transform="${symbolTransform}">${content}</g>
                <g class="interior-fixture-direction" transform="translate(11 11) rotate(${direction})" aria-hidden="true">
                    <line x1="0" y1="5" x2="0" y2="-5"></line>
                    <path d="M -4 -1 L 0 -5 L 4 -1"></path>
                </g>
                <text class="interior-fixture-label" x="${(fixtureWidth / 2).toFixed(1)}" y="${(fixtureDepth / 2 + 4).toFixed(1)}">${escapeHtml(fixture.label)}</text>
                <text class="interior-fixture-size" x="${(fixtureWidth / 2).toFixed(1)}" y="${Math.max(11, fixtureDepth - 6).toFixed(1)}">${formatNumber(fixture.width_inches)}×${formatNumber(fixture.depth_inches)} in</text>
                ${selected ? `
                    <rect class="interior-fixture-selection" x="-3" y="-3" width="${(fixtureWidth + 6).toFixed(1)}" height="${(fixtureDepth + 6).toFixed(1)}" rx="6"></rect>
                    <rect class="interior-fixture-resize" x="${(fixtureWidth - 6).toFixed(1)}" y="${(fixtureDepth - 6).toFixed(1)}" width="12" height="12" rx="2"
                        data-fixture-id="${escapeHtml(fixture.id)}" data-fixture-action="resize"></rect>
                ` : ""}
            </g>
        `;
    }).join("");
}

function buildBathroomFixtureSymbol(fixture, width, depth) {
    if (fixture.type === "sofa") {
        return `
            <rect class="interior-fixture-symbol" x="${(width * 0.08).toFixed(1)}" y="${(depth * 0.16).toFixed(1)}" width="${(width * 0.84).toFixed(1)}" height="${(depth * 0.68).toFixed(1)}" rx="6"></rect>
            <line class="interior-fixture-symbol" x1="${(width * 0.34).toFixed(1)}" y1="${(depth * 0.18).toFixed(1)}" x2="${(width * 0.34).toFixed(1)}" y2="${(depth * 0.82).toFixed(1)}"></line>
            <line class="interior-fixture-symbol" x1="${(width * 0.66).toFixed(1)}" y1="${(depth * 0.18).toFixed(1)}" x2="${(width * 0.66).toFixed(1)}" y2="${(depth * 0.82).toFixed(1)}"></line>
        `;
    }
    if (fixture.type === "table") {
        return `<rect class="interior-fixture-symbol" x="${(width * 0.12).toFixed(1)}" y="${(depth * 0.16).toFixed(1)}" width="${(width * 0.76).toFixed(1)}" height="${(depth * 0.68).toFixed(1)}" rx="5"></rect>`;
    }
    if (fixture.type === "storage") {
        return `
            <line class="interior-fixture-symbol" x1="${(width / 3).toFixed(1)}" y1="4" x2="${(width / 3).toFixed(1)}" y2="${Math.max(4, depth - 4).toFixed(1)}"></line>
            <line class="interior-fixture-symbol" x1="${(width * 2 / 3).toFixed(1)}" y1="4" x2="${(width * 2 / 3).toFixed(1)}" y2="${Math.max(4, depth - 4).toFixed(1)}"></line>
        `;
    }
    if (fixture.type === "bed") {
        return `
            <rect class="interior-fixture-symbol" x="${(width * 0.08).toFixed(1)}" y="${(depth * 0.08).toFixed(1)}" width="${(width * 0.84).toFixed(1)}" height="${(depth * 0.84).toFixed(1)}" rx="5"></rect>
            <line class="interior-fixture-symbol" x1="${(width * 0.1).toFixed(1)}" y1="${(depth * 0.28).toFixed(1)}" x2="${(width * 0.9).toFixed(1)}" y2="${(depth * 0.28).toFixed(1)}"></line>
        `;
    }
    if (fixture.type === "nightstand") {
        return `<circle class="interior-fixture-symbol" cx="${(width / 2).toFixed(1)}" cy="${(depth / 2).toFixed(1)}" r="${Math.max(2, Math.min(width, depth) * 0.1).toFixed(1)}"></circle>`;
    }
    if (fixture.type === "dresser" || fixture.type === "wardrobe") {
        return `
            <line class="interior-fixture-symbol" x1="${(width / 2).toFixed(1)}" y1="4" x2="${(width / 2).toFixed(1)}" y2="${Math.max(4, depth - 4).toFixed(1)}"></line>
            <line class="interior-fixture-symbol" x1="4" y1="${(depth / 2).toFixed(1)}" x2="${Math.max(4, width - 4).toFixed(1)}" y2="${(depth / 2).toFixed(1)}"></line>
        `;
    }
    if (fixture.type === "chair") {
        return `<rect class="interior-fixture-symbol" x="${(width * 0.2).toFixed(1)}" y="${(depth * 0.2).toFixed(1)}" width="${(width * 0.6).toFixed(1)}" height="${(depth * 0.6).toFixed(1)}" rx="6"></rect>`;
    }
    if (fixture.type === "bathtub") {
        return `<rect class="interior-fixture-symbol" x="${(width * 0.1).toFixed(1)}" y="${(depth * 0.14).toFixed(1)}" width="${(width * 0.8).toFixed(1)}" height="${(depth * 0.72).toFixed(1)}" rx="8"></rect>`;
    }
    if (fixture.type === "shower") {
        return `
            <line class="interior-fixture-symbol" x1="5" y1="5" x2="${Math.max(5, width - 5).toFixed(1)}" y2="${Math.max(5, depth - 5).toFixed(1)}"></line>
            <line class="interior-fixture-symbol" x1="${Math.max(5, width - 5).toFixed(1)}" y1="5" x2="5" y2="${Math.max(5, depth - 5).toFixed(1)}"></line>
        `;
    }
    if (fixture.type === "toilet") {
        return `<ellipse class="interior-fixture-symbol" cx="${(width / 2).toFixed(1)}" cy="${(depth * 0.58).toFixed(1)}" rx="${(width * 0.28).toFixed(1)}" ry="${(depth * 0.25).toFixed(1)}"></ellipse>`;
    }
    return `<line class="interior-fixture-symbol" x1="${(width * 0.12).toFixed(1)}" y1="${(depth * 0.5).toFixed(1)}" x2="${(width * 0.88).toFixed(1)}" y2="${(depth * 0.5).toFixed(1)}"></line>`;
}

function buildInteriorDesignCard(item, selectedId) {
    const selected = item.id === selectedId ? "selected" : "";
    const swatches = item.properties.palette_colors.map((color) => `
        <span class="interior-swatch" style="background:${escapeHtml(color.hex)}" title="${escapeHtml(color.name)}"></span>
    `).join("");
    return `
        <button class="interior-design-card ${selected}" data-kind="interior-design" data-id="${escapeHtml(item.id)}" type="button">
            <span class="catalog-kind">${escapeHtml(item.properties.level_name)}</span>
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.properties.scheme_name)}</span>
            <span class="interior-card-row">${swatches}</span>
            <span class="interior-card-row">${escapeHtml(item.properties.primary_finish)} | ${escapeHtml(item.properties.furniture_anchor)}</span>
            <span class="interior-card-row">${escapeHtml(formatCurrency(item.properties.estimated_budget, item.properties.cost_currency))} | ${escapeHtml(item.properties.procurement_status)}</span>
        </button>
    `;
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
    const shellShape = buildFloorShellShape(shellBox, allRooms, levelKey);
    const grid = getFloorGridMetrics(shellShape);
    const shellVertexCount = shellShape.vertexPoints.length;
    const roomMarkup = buildFloorRoomMarkup(levelRooms, shellShape);
    const virtualGarageMarkup = buildVirtualGarageMarkup(shellShape, levelKey);
    const note = levelRooms.length
        ? `${levelRooms.length} rooms loaded | ${shellVertexCount} walls`
        : `No rooms loaded yet | ${shellVertexCount} walls`;

    return buildSvgFrame(shellBox.canvasWidth, shellBox.canvasHeight, `
        <defs>
            <pattern id="floor-grid-${levelKey}" x="${shellShape.x.toFixed(4)}" y="${shellShape.y.toFixed(4)}"
                width="${grid.xSpacing.toFixed(6)}" height="${grid.ySpacing.toFixed(6)}" patternUnits="userSpaceOnUse">
                <path d="M ${grid.xSpacing.toFixed(6)} 0 L 0 0 0 ${grid.ySpacing.toFixed(6)}" class="floor-grid-minor"></path>
            </pattern>
            <pattern id="floor-grid-major-${levelKey}" x="${shellShape.x.toFixed(4)}" y="${shellShape.y.toFixed(4)}"
                width="${grid.majorXSpacing.toFixed(6)}" height="${grid.majorYSpacing.toFixed(6)}" patternUnits="userSpaceOnUse">
                <path d="M ${grid.majorXSpacing.toFixed(6)} 0 L 0 0 0 ${grid.majorYSpacing.toFixed(6)}" class="floor-grid-major"></path>
            </pattern>
            <clipPath id="floor-shell-clip-${levelKey}">
                <polygon points="${shellShape.polygonPoints}"></polygon>
            </clipPath>
        </defs>
        <g clip-path="url(#floor-shell-clip-${levelKey})">
            <rect class="floor-grid-surface" width="${shellBox.canvasWidth}" height="${shellBox.canvasHeight}" fill="url(#floor-grid-${levelKey})"></rect>
            <rect class="floor-grid-major-surface" width="${shellBox.canvasWidth}" height="${shellBox.canvasHeight}" fill="url(#floor-grid-major-${levelKey})"></rect>
        </g>
        <polygon class="floor-shell" data-kind="floor-plan" data-id="${levelKey}" points="${shellShape.polygonPoints}"></polygon>
        ${virtualGarageMarkup}
        <g clip-path="url(#floor-shell-clip-${levelKey})">
            ${roomMarkup}
        </g>
        <text class="floor-level-label zoom-stable-label" transform="${buildStableLabelTransform(84, 34)}">${escapeHtml(levelConfig.label)}</text>
        <text class="floor-note zoom-stable-label" transform="${buildStableLabelTransform(84, 54)}">${escapeHtml(`${note} | 1 in grid`)}</text>
    `);
}

function buildFloorRoomMarkup(rooms, shellBox) {
    if (!rooms.length) {
        return "";
    }

    return rooms.map((room, index) => {
        const geometry = getFloorRoomGeometry(room, shellBox);
        const { x, y, width: roomWidth, height: roomHeight } = geometry;
        const selected = state.selectedKind === "room" && state.selectedId === room.id ? "selected" : "";
        const label = room.label.length > 18 ? `${room.label.slice(0, 18)}...` : room.label;
        const controls = selected
            ? (geometry.isPolygon
                ? buildFloorRoomPolygonControls(room.id, geometry.points)
                : buildFloorRoomControls(room.id, x, y, roomWidth, roomHeight))
            : "";
        const openingMarkup = geometry.isPolygon
            ? buildPolygonRoomBoundaryMarkup(room, geometry.points, shellBox)
            : buildRoomOpeningMarkup(room, x, y, roomWidth, roomHeight);
        const stairMarkup = buildStairMarkup(room, x, y, roomWidth, roomHeight);
        const stairClass = String(room.properties.room_type || "").toLowerCase() === "stair" ? "stair-room" : "";
        const roomShape = geometry.isPolygon
            ? `<polygon class="floor-room floor-room-polygon ${stairClass} ${selected}" data-kind="room" data-id="${escapeHtml(room.id)}" data-floor-action="move-room" points="${geometry.pointText}"></polygon>`
            : `<rect class="floor-room ${stairClass} ${selected}" data-kind="room" data-id="${escapeHtml(room.id)}" data-floor-action="move-room"
                x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${roomWidth.toFixed(3)}" height="${roomHeight.toFixed(3)}"></rect>`;
        return `
            ${roomShape}
            ${openingMarkup}
            ${stairMarkup}
            ${controls}
            <text class="floor-room-label zoom-stable-label" text-anchor="middle"
                transform="${buildStableLabelTransform(geometry.center.x, geometry.center.y)}">${escapeHtml(label)}</text>
        `;
    }).join("");
}

function getFloorRoomGeometry(room, shellBox) {
    const ratios = getRoomPolygonRatios(room);
    if (ratios.length >= 3) {
        const points = ratios.map(([xRatio, yRatio]) => ({
            x: shellBox.x + (shellBox.width * xRatio),
            y: shellBox.y + (shellBox.height * yRatio),
        }));
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const width = Math.max(Math.max(...xs) - x, 1);
        const height = Math.max(Math.max(...ys) - y, 1);
        return {
            isPolygon: true,
            points,
            pointText: points.map((point) => `${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(" "),
            x,
            y,
            width,
            height,
            center: getScreenPolygonCentroid(points),
        };
    }

    const x = shellBox.x + (shellBox.width * Number(room.properties.floor_x_ratio || 0.1));
    const y = shellBox.y + (shellBox.height * Number(room.properties.floor_y_ratio || 0.1));
    const width = shellBox.width * Number(room.properties.floor_width_ratio || 0.3);
    const height = shellBox.height * Number(room.properties.floor_height_ratio || 0.2);
    return {
        isPolygon: false,
        points: [],
        pointText: "",
        x,
        y,
        width,
        height,
        center: { x: x + (width / 2), y: y + (height / 2) },
    };
}

function getScreenPolygonCentroid(points) {
    if (!points.length) {
        return { x: 0, y: 0 };
    }
    const total = points.reduce((memo, point) => ({ x: memo.x + point.x, y: memo.y + point.y }), { x: 0, y: 0 });
    return { x: total.x / points.length, y: total.y / points.length };
}

function buildFloorRoomPolygonControls(roomId, points) {
    const pointText = points.map((point) => `${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(" ");
    return `
        <polygon class="floor-room-outline floor-room-polygon-outline" points="${pointText}"></polygon>
        ${points.map((point, index) => `
            <circle class="floor-room-polygon-handle ${state.selectedRoomVertexIndex === index ? "selected" : ""}"
                data-kind="room" data-id="${escapeHtml(roomId)}" data-floor-action="move-room-vertex" data-index="${index}"
                cx="${point.x.toFixed(4)}" cy="${point.y.toFixed(4)}" r="${buildStableCircleRadius(6)}"></circle>
        `).join("")}
    `;
}

function buildPolygonRoomBoundaryMarkup(room, points, shellBox) {
    const pointCount = points.length;
    const walls = normalizeRoomWalls(room.properties.walls).map((wall, index) => ({
        ...wall,
        edge_index: getPolygonSegmentEdgeIndex(wall, index, pointCount),
    }));
    const coveredEdges = new Set(walls.map((wall) => wall.edge_index));
    for (let index = 0; index < pointCount; index += 1) {
        if (!coveredEdges.has(index)) {
            walls.push({ edge_index: index, start_ratio: 0, end_ratio: 1, thickness_inches: DEFAULT_WALL_THICKNESS_INCHES });
        }
    }

    const wallMarkup = walls.map((wall) => buildPolygonRoomSegmentLine(room, wall, points, shellBox, "room-wall-segment-line")).join("");
    const doorMarkup = normalizeRoomOpenings(room.properties.doors)
        .map((door, index) => buildPolygonRoomSegmentLine(room, {
            ...door,
            edge_index: getPolygonSegmentEdgeIndex(door, index, pointCount),
        }, points, shellBox, "room-door-line"))
        .join("");
    const windowMarkup = normalizeRoomOpenings(room.properties.windows)
        .map((windowItem, index) => buildPolygonRoomSegmentLine(room, {
            ...windowItem,
            edge_index: getPolygonSegmentEdgeIndex(windowItem, index, pointCount),
        }, points, shellBox, "room-window-line"))
        .join("");
    return `${wallMarkup}${doorMarkup}${windowMarkup}`;
}

function buildPolygonRoomSegmentLine(room, segment, points, shellBox, className) {
    const edgeIndex = clamp(Number(segment.edge_index || 0), 0, points.length - 1);
    const edgeStart = points[edgeIndex];
    const edgeEnd = points[(edgeIndex + 1) % points.length];
    if (!edgeStart || !edgeEnd) {
        return "";
    }
    const startRatio = clamp(Number(segment.start_ratio ?? 0), 0, 1);
    const endRatio = clamp(Number(segment.end_ratio ?? 1), 0, 1);
    const start = interpolateScreenPoint(edgeStart, edgeEnd, Math.min(startRatio, endRatio));
    const end = interpolateScreenPoint(edgeStart, edgeEnd, Math.max(startRatio, endRatio));
    const hostWall = findPolygonHostWall(room, edgeIndex);
    const thicknessInches = getWallThicknessInches(hostWall);
    const strokeWidth = Math.max(0.75, getFloorPixelsPerInch(shellBox) * thicknessInches);
    const dimension = className === "room-wall-segment-line" && state.selectedKind === "room" && state.selectedId === room.id
        ? buildPolygonWallDimension(room, segment, edgeStart, edgeEnd, start, end, shellBox, thicknessInches)
        : "";
    return `
        <line class="${className}" x1="${start.x.toFixed(3)}" y1="${start.y.toFixed(3)}"
            x2="${end.x.toFixed(3)}" y2="${end.y.toFixed(3)}" style="stroke-width:${strokeWidth.toFixed(2)}px"></line>
        ${dimension}
    `;
}

function interpolateScreenPoint(start, end, ratio) {
    return {
        x: start.x + ((end.x - start.x) * ratio),
        y: start.y + ((end.y - start.y) * ratio),
    };
}

function getPolygonSegmentEdgeIndex(segment, fallbackIndex, pointCount) {
    if (Number.isInteger(Number(segment?.edge_index))) {
        return clamp(Number(segment.edge_index), 0, pointCount - 1);
    }
    const legacyEdges = { top: 0, right: 1, bottom: 2, left: 3 };
    const mapped = legacyEdges[String(segment?.edge || "")];
    return mapped === undefined ? fallbackIndex % pointCount : clamp(mapped, 0, pointCount - 1);
}

function findPolygonHostWall(room, edgeIndex) {
    const walls = normalizeRoomWalls(room.properties.walls);
    return walls.find((wall, index) => getPolygonSegmentEdgeIndex(wall, index, Math.max(getRoomPolygonRatios(room).length, 3)) === edgeIndex)
        || { thickness_inches: DEFAULT_WALL_THICKNESS_INCHES };
}

function getFloorPixelsPerInch(shellBox) {
    const house = state.assessment?.objects?.housePlan?.properties || {};
    const linearUnit = String(house.linear_unit || "feet");
    const widthInches = Math.max(convertRoomLengthToInches(Number(house.width || 1), linearUnit), 1);
    const heightInches = Math.max(convertRoomLengthToInches(Number(house.height || 1), linearUnit), 1);
    return Math.min(shellBox.width / widthInches, shellBox.height / heightInches);
}

function getFloorGridMetrics(shellBox) {
    const dimensions = getHouseDimensionsInches();
    const widthInches = dimensions.width;
    const heightInches = dimensions.height;
    const xSpacing = Math.max(shellBox.width / widthInches * DESIGN_GRID_INCHES, 0.01);
    const ySpacing = Math.max(shellBox.height / heightInches * DESIGN_GRID_INCHES, 0.01);
    return {
        widthInches,
        heightInches,
        xSpacing,
        ySpacing,
        majorXSpacing: xSpacing * DESIGN_GRID_MAJOR_INCHES,
        majorYSpacing: ySpacing * DESIGN_GRID_MAJOR_INCHES,
    };
}

function buildPolygonWallDimension(room, segment, edgeStart, edgeEnd, start, end, shellBox, thicknessInches) {
    const dx = edgeEnd.x - edgeStart.x;
    const dy = edgeEnd.y - edgeStart.y;
    const screenLength = Math.max(Math.hypot(dx, dy), 1);
    const normal = { x: -dy / screenLength, y: dx / screenLength };
    const inverseZoom = 1 / (state.detailZoom || 1);
    const offset = Math.max(13, (getFloorPixelsPerInch(shellBox) * thicknessInches / 2) + 8) * inverseZoom;
    return buildFloorArchitectureDimension(room, segment, start, end, normal, offset);
}

function formatLinearRoomLength(length, unit) {
    if (unit === "feet") {
        const totalInches = Math.max(0, Math.round(length * 12));
        return `${Math.floor(totalInches / 12)}'-${totalInches % 12}\"`;
    }
    return `${formatNumber(length)} ${unit}`;
}

function buildStairMarkup(room, x, y, width, height) {
    if (String(room.properties.room_type || "").toLowerCase() !== "stair") {
        return "";
    }
    const roomId = escapeHtml(room.id);
    const direction = String(room.properties.stair_direction || "up");
    const longSpan = direction === "left" || direction === "right" ? width : height;
    const stepCount = Math.max(4, Math.min(10, Math.round(longSpan / 28)));
    const steps = [];

    for (let index = 1; index < stepCount; index += 1) {
        const ratio = index / stepCount;
        if (direction === "up" || direction === "down") {
            const lineY = direction === "up" ? y + height - (height * ratio) : y + (height * ratio);
            steps.push(`<line class="stair-step" data-kind="room" data-id="${roomId}" data-floor-action="move-room" x1="${(x + 4).toFixed(1)}" y1="${lineY.toFixed(1)}" x2="${(x + width - 4).toFixed(1)}" y2="${lineY.toFixed(1)}"></line>`);
        } else {
            const lineX = direction === "right" ? x + (width * ratio) : x + width - (width * ratio);
            steps.push(`<line class="stair-step" data-kind="room" data-id="${roomId}" data-floor-action="move-room" x1="${lineX.toFixed(1)}" y1="${(y + 4).toFixed(1)}" x2="${lineX.toFixed(1)}" y2="${(y + height - 4).toFixed(1)}"></line>`);
        }
    }
    return `${steps.join("")}${buildStairArrow(roomId, direction, x, y, width, height)}${buildStairRotateHandle(roomId, x, y, width, height)}`;
}

function buildStairArrow(roomId, direction, x, y, width, height) {
    const cx = x + (width / 2);
    const cy = y + (height / 2);
    if (direction === "up") {
        return `<path class="stair-arrow" data-kind="room" data-id="${roomId}" data-floor-action="move-room" d="M ${cx.toFixed(1)} ${(y + height - 10).toFixed(1)} L ${cx.toFixed(1)} ${(y + 12).toFixed(1)} M ${(cx - 6).toFixed(1)} ${(y + 20).toFixed(1)} L ${cx.toFixed(1)} ${(y + 12).toFixed(1)} L ${(cx + 6).toFixed(1)} ${(y + 20).toFixed(1)}"></path>`;
    }
    if (direction === "down") {
        return `<path class="stair-arrow" data-kind="room" data-id="${roomId}" data-floor-action="move-room" d="M ${cx.toFixed(1)} ${(y + 10).toFixed(1)} L ${cx.toFixed(1)} ${(y + height - 12).toFixed(1)} M ${(cx - 6).toFixed(1)} ${(y + height - 20).toFixed(1)} L ${cx.toFixed(1)} ${(y + height - 12).toFixed(1)} L ${(cx + 6).toFixed(1)} ${(y + height - 20).toFixed(1)}"></path>`;
    }
    if (direction === "left") {
        return `<path class="stair-arrow" data-kind="room" data-id="${roomId}" data-floor-action="move-room" d="M ${(x + width - 10).toFixed(1)} ${cy.toFixed(1)} L ${(x + 12).toFixed(1)} ${cy.toFixed(1)} M ${(x + 20).toFixed(1)} ${(cy - 6).toFixed(1)} L ${(x + 12).toFixed(1)} ${cy.toFixed(1)} L ${(x + 20).toFixed(1)} ${(cy + 6).toFixed(1)}"></path>`;
    }
    return `<path class="stair-arrow" data-kind="room" data-id="${roomId}" data-floor-action="move-room" d="M ${(x + 10).toFixed(1)} ${cy.toFixed(1)} L ${(x + width - 12).toFixed(1)} ${cy.toFixed(1)} M ${(x + width - 20).toFixed(1)} ${(cy - 6).toFixed(1)} L ${(x + width - 12).toFixed(1)} ${cy.toFixed(1)} L ${(x + width - 20).toFixed(1)} ${(cy + 6).toFixed(1)}"></path>`;
}

function buildStairRotateHandle(roomId, x, y, width, height) {
    return `<circle class="floor-room-edge-handle" data-kind="room" data-id="${roomId}" data-floor-action="rotate-stair-inline" cx="${(x + width - 10).toFixed(1)}" cy="${(y + 10).toFixed(1)}" r="${buildStableCircleRadius(5)}"></circle>`;
}

function buildVirtualGarageMarkup(shellShape, levelKey) {
    if (levelKey === "first-floor" || !shellShape.virtualLine) {
        return "";
    }

    return `
        <line class="floor-virtual-line"
            x1="${shellShape.virtualLine.x1.toFixed(1)}" y1="${shellShape.virtualLine.y.toFixed(1)}"
            x2="${shellShape.virtualLine.x2.toFixed(1)}" y2="${shellShape.virtualLine.y.toFixed(1)}"></line>
    `;
}

function buildFloorShellShape(shellBox, allRooms, levelKey) {
    const baseShape = {
        ...shellBox,
        polygonPoints: shellBox.polygonPoints,
        vertexPoints: shellBox.vertexPoints,
        virtualLine: null,
    };
    if (levelKey === "first-floor") {
        return baseShape;
    }

    const garageRoom = allRooms.find((room) => String(room?.properties?.room_type || "").trim().toLowerCase() === "garage");
    if (!garageRoom) {
        return baseShape;
    }

    const cutY = shellBox.y + (shellBox.height * Number(garageRoom.properties.floor_y_ratio || 0));
    const clippedPoints = clipPolygonToTop(shellBox.vertexPoints, cutY);
    if (clippedPoints.length < 3) {
        return baseShape;
    }

    const onCutLine = clippedPoints.filter((point) => Math.abs(point.y - cutY) < 0.2);
    const lineXs = onCutLine.map((point) => point.x);
    const virtualLine = lineXs.length >= 2
        ? { x1: Math.min(...lineXs), x2: Math.max(...lineXs), y: cutY }
        : null;

    return {
        ...shellBox,
        vertexPoints: clippedPoints,
        polygonPoints: clippedPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
        height: Math.max(cutY - shellBox.y, 1),
        virtualLine,
    };
}

function clipPolygonToTop(points, maxY) {
    if (!points.length) {
        return [];
    }

    const output = [];
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const previous = points[(index + points.length - 1) % points.length];
        const currentInside = current.y <= maxY;
        const previousInside = previous.y <= maxY;

        if (currentInside) {
            if (!previousInside) {
                output.push(intersectHorizontal(previous, current, maxY));
            }
            output.push(current);
        } else if (previousInside) {
            output.push(intersectHorizontal(previous, current, maxY));
        }
    }
    return output;
}

function intersectHorizontal(start, end, y) {
    const dy = end.y - start.y;
    if (Math.abs(dy) < 1e-9) {
        return { x: end.x, y };
    }
    const ratio = (y - start.y) / dy;
    return {
        x: start.x + ((end.x - start.x) * ratio),
        y,
    };
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
    const midX = x + (width / 2);
    const midY = y + (height / 2);
    return `
        <rect class="floor-room-outline" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}"></rect>
        <circle class="floor-room-edge-handle" data-kind="room" data-id="${escapeHtml(roomId)}" data-floor-action="resize-left"
            cx="${x.toFixed(1)}" cy="${midY.toFixed(1)}" r="${buildStableCircleRadius(5)}"></circle>
        <circle class="floor-room-edge-handle" data-kind="room" data-id="${escapeHtml(roomId)}" data-floor-action="resize-right"
            cx="${(x + width).toFixed(1)}" cy="${midY.toFixed(1)}" r="${buildStableCircleRadius(5)}"></circle>
        <circle class="floor-room-edge-handle" data-kind="room" data-id="${escapeHtml(roomId)}" data-floor-action="resize-top"
            cx="${midX.toFixed(1)}" cy="${y.toFixed(1)}" r="${buildStableCircleRadius(5)}"></circle>
        <circle class="floor-room-edge-handle" data-kind="room" data-id="${escapeHtml(roomId)}" data-floor-action="resize-bottom"
            cx="${midX.toFixed(1)}" cy="${(y + height).toFixed(1)}" r="${buildStableCircleRadius(5)}"></circle>
        <circle class="floor-room-handle" data-kind="room" data-id="${escapeHtml(roomId)}" data-floor-action="resize-room"
            cx="${(x + width).toFixed(1)}" cy="${(y + height).toFixed(1)}" r="${buildStableCircleRadius(6)}"></circle>
    `;
}

function buildRoomOpeningMarkup(room, x, y, width, height) {
    const walls = Array.isArray(room.properties.walls) ? room.properties.walls : [];
    const doors = Array.isArray(room.properties.doors) ? room.properties.doors : [];
    const windows = Array.isArray(room.properties.windows) ? room.properties.windows : [];
    const wallMarkup = walls.map((wall) => buildWallSegmentMarkup(room, wall, x, y, width, height)).join("");
    const doorMarkup = doors.map((door) => buildOpeningSegmentMarkup(door, x, y, width, height, "room-door", room)).join("");
    const windowMarkup = windows.map((windowItem) => buildOpeningSegmentMarkup(windowItem, x, y, width, height, "room-window", room)).join("");
    return `${wallMarkup}${doorMarkup}${windowMarkup}`;
}

function buildWallSegmentMarkup(room, wall, x, y, width, height) {
    const rect = buildWallRectFromPlacement(room, wall, x, y, width, height);
    if (!rect) {
        return "";
    }
    const hasSelectedRoom = state.selectedKind === "room";
    const showDimension = !hasSelectedRoom || state.selectedId === room.id;
    const lengthLabel = showDimension ? buildFloorWallLengthLabel(room, wall, x, y, width, height) : "";
    return `<rect class="room-wall-segment" x="${rect.x.toFixed(1)}" y="${rect.y.toFixed(1)}" width="${rect.width.toFixed(1)}" height="${rect.height.toFixed(1)}"></rect>${lengthLabel}`;
}

function buildFloorWallLengthLabel(room, wall, x, y, width, height) {
    const edge = String(wall.edge || "top");
    const start = Math.min(
        clamp(Number(wall.start_ratio ?? 0), 0, 1),
        clamp(Number(wall.end_ratio ?? 1), 0, 1),
    );
    const end = Math.max(
        clamp(Number(wall.start_ratio ?? 0), 0, 1),
        clamp(Number(wall.end_ratio ?? 1), 0, 1),
    );
    const inverseZoom = 1 / (state.detailZoom || 1);
    const dimensionOffset = 12 * inverseZoom;
    if (edge === "top") {
        return buildFloorArchitectureDimension(room, wall,
            { x: x + (width * start), y }, { x: x + (width * end), y },
            { x: 0, y: 1 }, dimensionOffset, edge);
    }
    if (edge === "bottom") {
        return buildFloorArchitectureDimension(room, wall,
            { x: x + (width * start), y: y + height }, { x: x + (width * end), y: y + height },
            { x: 0, y: -1 }, dimensionOffset, edge);
    }
    if (edge === "left") {
        return buildFloorArchitectureDimension(room, wall,
            { x, y: y + (height * start) }, { x, y: y + (height * end) },
            { x: 1, y: 0 }, dimensionOffset, edge);
    }
    return buildFloorArchitectureDimension(room, wall,
        { x: x + width, y: y + (height * start) }, { x: x + width, y: y + (height * end) },
        { x: -1, y: 0 }, dimensionOffset, edge);
}

function buildFloorArchitectureDimension(room, wall, start, end, normal, offset, edge = "polygon") {
    const inverseZoom = 1 / (state.detailZoom || 1);
    const label = `${formatRoomWallLength(room, wall)} · t ${formatWallThickness(wall)}`;
    const dimensionStart = { x: start.x + (normal.x * offset), y: start.y + (normal.y * offset) };
    const dimensionEnd = { x: end.x + (normal.x * offset), y: end.y + (normal.y * offset) };
    const midpoint = { x: (dimensionStart.x + dimensionEnd.x) / 2, y: (dimensionStart.y + dimensionEnd.y) / 2 };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const tangent = { x: dx / length, y: dy / length };
    const capLength = 5 * inverseZoom;
    const arrowLength = Math.min(7 * inverseZoom, length / 4);
    const arrowWidth = Math.min(3.5 * inverseZoom, length / 8);
    const startArrowBase = { x: dimensionStart.x + (tangent.x * arrowLength), y: dimensionStart.y + (tangent.y * arrowLength) };
    const endArrowBase = { x: dimensionEnd.x - (tangent.x * arrowLength), y: dimensionEnd.y - (tangent.y * arrowLength) };
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle > 90 || angle < -90) {
        angle += 180;
    }
    return `
        <g class="room-wall-dimension" data-wall-edge="${edge}" aria-label="Wall dimension ${escapeHtml(label)}">
            <line class="room-wall-extension" x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}" x2="${dimensionStart.x.toFixed(2)}" y2="${dimensionStart.y.toFixed(2)}"></line>
            <line class="room-wall-extension" x1="${end.x.toFixed(2)}" y1="${end.y.toFixed(2)}" x2="${dimensionEnd.x.toFixed(2)}" y2="${dimensionEnd.y.toFixed(2)}"></line>
            <line class="room-wall-dimension-line" x1="${dimensionStart.x.toFixed(2)}" y1="${dimensionStart.y.toFixed(2)}" x2="${dimensionEnd.x.toFixed(2)}" y2="${dimensionEnd.y.toFixed(2)}"></line>
            <line class="room-wall-dimension-cap" x1="${(dimensionStart.x - (normal.x * capLength)).toFixed(2)}" y1="${(dimensionStart.y - (normal.y * capLength)).toFixed(2)}" x2="${(dimensionStart.x + (normal.x * capLength)).toFixed(2)}" y2="${(dimensionStart.y + (normal.y * capLength)).toFixed(2)}"></line>
            <line class="room-wall-dimension-cap" x1="${(dimensionEnd.x - (normal.x * capLength)).toFixed(2)}" y1="${(dimensionEnd.y - (normal.y * capLength)).toFixed(2)}" x2="${(dimensionEnd.x + (normal.x * capLength)).toFixed(2)}" y2="${(dimensionEnd.y + (normal.y * capLength)).toFixed(2)}"></line>
            <path class="room-wall-dimension-arrow" d="M ${(startArrowBase.x - (normal.x * arrowWidth)).toFixed(2)} ${(startArrowBase.y - (normal.y * arrowWidth)).toFixed(2)} L ${dimensionStart.x.toFixed(2)} ${dimensionStart.y.toFixed(2)} L ${(startArrowBase.x + (normal.x * arrowWidth)).toFixed(2)} ${(startArrowBase.y + (normal.y * arrowWidth)).toFixed(2)}"></path>
            <path class="room-wall-dimension-arrow" d="M ${(endArrowBase.x - (normal.x * arrowWidth)).toFixed(2)} ${(endArrowBase.y - (normal.y * arrowWidth)).toFixed(2)} L ${dimensionEnd.x.toFixed(2)} ${dimensionEnd.y.toFixed(2)} L ${(endArrowBase.x + (normal.x * arrowWidth)).toFixed(2)} ${(endArrowBase.y + (normal.y * arrowWidth)).toFixed(2)}"></path>
            <text class="room-wall-length" text-anchor="middle" transform="translate(${midpoint.x.toFixed(2)} ${midpoint.y.toFixed(2)}) rotate(${angle.toFixed(2)}) scale(${inverseZoom.toFixed(4)}) translate(0 -5)">${escapeHtml(label)}</text>
        </g>
    `;
}

function buildOpeningSegmentMarkup(item, x, y, width, height, className, room) {
    const rect = buildOpeningRectFromPlacement(item, x, y, width, height, room);
    if (!rect) {
        return "";
    }
    return `<rect class="${className}" x="${rect.x.toFixed(1)}" y="${rect.y.toFixed(1)}" width="${rect.width.toFixed(1)}" height="${rect.height.toFixed(1)}"></rect>`;
}

function buildOpeningRectFromPlacement(item, x, y, width, height, room = null, minimumThickness = 1) {
    const edge = String(item?.edge || "top");
    const start = clamp(Number(item?.start_ratio ?? 0.15), 0, 1);
    const end = clamp(Number(item?.end_ratio ?? 0.85), 0, 1);
    const matchingWall = room ? findOpeningHostWall(room, item) : null;
    const wallRect = matchingWall
        ? buildWallRectFromPlacement(room, matchingWall, x, y, width, height, minimumThickness)
        : null;
    const thickness = wallRect
        ? (edge === "top" || edge === "bottom" ? wallRect.height : wallRect.width)
        : 6;
    const inset = thickness / 2;

    if (edge === "top") {
        const startX = Math.max(x, x + (width * start) - inset);
        const endX = Math.min(x + width, x + (width * end) + inset);
        return { x: startX, y: wallRect?.y ?? y, width: Math.max(endX - startX, 1), height: thickness };
    }
    if (edge === "bottom") {
        const startX = Math.max(x, x + (width * start) - inset);
        const endX = Math.min(x + width, x + (width * end) + inset);
        return { x: startX, y: wallRect?.y ?? y + height - thickness, width: Math.max(endX - startX, 1), height: thickness };
    }
    if (edge === "left") {
        const startY = Math.max(y, y + (height * start) - inset);
        const endY = Math.min(y + height, y + (height * end) + inset);
        return { x: wallRect?.x ?? x, y: startY, width: thickness, height: Math.max(endY - startY, 1) };
    }
    if (edge === "right") {
        const startY = Math.max(y, y + (height * start) - inset);
        const endY = Math.min(y + height, y + (height * end) + inset);
        return { x: wallRect?.x ?? x + width - thickness, y: startY, width: thickness, height: Math.max(endY - startY, 1) };
    }
    return null;
}

function findOpeningHostWall(room, opening) {
    const edge = String(opening?.edge || "top");
    const openingStart = Math.min(Number(opening?.start_ratio ?? 0), Number(opening?.end_ratio ?? 1));
    const openingEnd = Math.max(Number(opening?.start_ratio ?? 0), Number(opening?.end_ratio ?? 1));
    const walls = normalizeRoomWalls(room?.properties?.walls);
    return walls.find((wall) => {
        if (String(wall.edge || "top") !== edge) {
            return false;
        }
        const wallStart = Math.min(Number(wall.start_ratio ?? 0), Number(wall.end_ratio ?? 1));
        const wallEnd = Math.max(Number(wall.start_ratio ?? 0), Number(wall.end_ratio ?? 1));
        return wallStart <= openingEnd && wallEnd >= openingStart;
    }) || { edge, start_ratio: 0, end_ratio: 1, thickness_inches: DEFAULT_WALL_THICKNESS_INCHES };
}

function buildWallRectFromPlacement(room, wall, x, y, width, height, minimumThickness = 1) {
    const edge = String(wall?.edge || "top");
    const start = clamp(Number(wall?.start_ratio ?? 0), 0, 1);
    const end = clamp(Number(wall?.end_ratio ?? 1), 0, 1);
    const linearUnit = String(room?.properties?.linear_unit || "feet");
    const roomWidthInches = Math.max(convertRoomLengthToInches(Number(room?.properties?.width || 0), linearUnit), 0.01);
    const roomHeightInches = Math.max(convertRoomLengthToInches(Number(room?.properties?.height || 0), linearUnit), 0.01);
    const wallThicknessInches = getWallThicknessInches(wall);
    const thicknessX = Math.max((width / roomWidthInches) * wallThicknessInches, minimumThickness);
    const thicknessY = Math.max((height / roomHeightInches) * wallThicknessInches, minimumThickness);
    const insetX = thicknessX / 2;
    const insetY = thicknessY / 2;

    if (edge === "top") {
        const startX = Math.max(x, x + (width * start) - insetX);
        const endX = Math.min(x + width, x + (width * end) + insetX);
        return {
            x: startX,
            y,
            width: Math.max(endX - startX, 1),
            height: thicknessY,
        };
    }
    if (edge === "bottom") {
        const startX = Math.max(x, x + (width * start) - insetX);
        const endX = Math.min(x + width, x + (width * end) + insetX);
        return {
            x: startX,
            y: y + height - thicknessY,
            width: Math.max(endX - startX, 1),
            height: thicknessY,
        };
    }
    if (edge === "left") {
        const startY = Math.max(y, y + (height * start) - insetY);
        const endY = Math.min(y + height, y + (height * end) + insetY);
        return {
            x,
            y: startY,
            width: thicknessX,
            height: Math.max(endY - startY, 1),
        };
    }
    if (edge === "right") {
        const startY = Math.max(y, y + (height * start) - insetY);
        const endY = Math.min(y + height, y + (height * end) + insetY);
        return {
            x: x + width - thicknessX,
            y: startY,
            width: thicknessX,
            height: Math.max(endY - startY, 1),
        };
    }
    return null;
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
    state.gardenInteraction.startPointer = pointer;
    state.gardenInteraction.startProperties = {
        anchor_x_ratio: feature.properties.anchor_x_ratio,
        anchor_y_ratio: feature.properties.anchor_y_ratio,
        width_ratio: feature.properties.width_ratio,
        height_ratio: feature.properties.height_ratio,
        rotation_degrees: feature.properties.rotation_degrees,
    };
    renderInteractiveDiagram();
}

function stopGardenInteraction(event) {
    if (event && state.gardenInteraction && event.pointerId !== state.gardenInteraction.pointerId) {
        return;
    }
    if (state.gardenInteraction && state.selectedKind === "feature" && state.selectedId === state.gardenInteraction.featureId) {
        renderSelection();
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

    const deltaX = (pointer.x - state.floorPlanInteraction.startPointer.x) / state.floorPlanInteraction.shellShape.width;
    const deltaY = (pointer.y - state.floorPlanInteraction.startPointer.y) / state.floorPlanInteraction.shellShape.height;
    const polygon = state.floorPlanInteraction.rawPolygon || state.floorPlanInteraction.startPolygon || [];
    if (polygon.length >= 3 && ["move-room", "move-room-vertex"].includes(state.floorPlanInteraction.mode)) {
        let nextPolygon = polygon.map((point) => [...point]);
        if (state.floorPlanInteraction.mode === "move-room-vertex") {
            const pointIndex = state.floorPlanInteraction.pointIndex;
            if (Number.isInteger(pointIndex) && nextPolygon[pointIndex]) {
                nextPolygon[pointIndex] = [
                    roundValue(clamp(nextPolygon[pointIndex][0] + deltaX, 0, 1), 8),
                    roundValue(clamp(nextPolygon[pointIndex][1] + deltaY, 0, 1), 8),
                ];
            }
        } else {
            const xs = nextPolygon.map((point) => point[0]);
            const ys = nextPolygon.map((point) => point[1]);
            const translatedX = clamp(deltaX, -Math.min(...xs), 1 - Math.max(...xs));
            const translatedY = clamp(deltaY, -Math.min(...ys), 1 - Math.max(...ys));
            nextPolygon = nextPolygon.map((point) => [
                roundValue(point[0] + translatedX, 8),
                roundValue(point[1] + translatedY, 8),
            ]);
        }
        const snappedPolygon = snapFloorPolygonToInchGrid(nextPolygon);
        room.properties.floor_polygon_ratios = snappedPolygon;
        syncRoomPolygonBounds(room, snappedPolygon);
        state.floorPlanInteraction.startPointer = pointer;
        state.floorPlanInteraction.rawPolygon = nextPolygon.map((point) => [...point]);
        renderInteractiveDiagram();
        return;
    }
    const rawLayout = state.floorPlanInteraction.rawLayout || state.floorPlanInteraction.startLayout;
    let nextX = rawLayout.x;
    let nextY = rawLayout.y;
    let nextWidth = rawLayout.width;
    let nextHeight = rawLayout.height;
    const sizeLimits = getRoomResizeLimits(room);

    if (state.floorPlanInteraction.mode === "move-room") {
        nextX = clamp(nextX + deltaX, 0, 1 - nextWidth);
        nextY = clamp(nextY + deltaY, 0, 1 - nextHeight);
    } else if (state.floorPlanInteraction.mode === "resize-left") {
        const right = nextX + nextWidth;
        const newLeft = clamp(
            nextX + deltaX,
            Math.max(0, right - sizeLimits.maxWidthRatio),
            right - sizeLimits.minWidth,
        );
        nextWidth = (nextX + nextWidth) - newLeft;
        nextX = newLeft;
    } else if (state.floorPlanInteraction.mode === "resize-right") {
        nextWidth = clamp(nextWidth + deltaX, sizeLimits.minWidth, sizeLimits.maxWidth(nextX));
    } else if (state.floorPlanInteraction.mode === "resize-top") {
        const bottom = nextY + nextHeight;
        const newTop = clamp(
            nextY + deltaY,
            Math.max(0, bottom - sizeLimits.maxHeightRatio),
            bottom - sizeLimits.minHeight,
        );
        nextHeight = (nextY + nextHeight) - newTop;
        nextY = newTop;
    } else if (state.floorPlanInteraction.mode === "resize-bottom") {
        nextHeight = clamp(nextHeight + deltaY, sizeLimits.minHeight, sizeLimits.maxHeight(nextY));
    } else if (state.floorPlanInteraction.mode === "resize-room") {
        nextWidth = clamp(nextWidth + deltaX, sizeLimits.minWidth, sizeLimits.maxWidth(nextX));
        nextHeight = clamp(nextHeight + deltaY, sizeLimits.minHeight, sizeLimits.maxHeight(nextY));
    }

    state.floorPlanInteraction.rawLayout = {
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
    };
    const snappedLayout = snapRoomLayoutToInchGrid(state.floorPlanInteraction.rawLayout);
    room.properties.floor_x_ratio = snappedLayout.x;
    room.properties.floor_y_ratio = snappedLayout.y;
    room.properties.floor_width_ratio = snappedLayout.width;
    room.properties.floor_height_ratio = snappedLayout.height;

    state.floorPlanInteraction.startPointer = pointer;
    renderInteractiveDiagram();
}

function snapRoomPositionToShellEdges(shellShape, position, widthRatio, heightRatio) {
    const snapPixels = 6;
    const snapX = snapPixels / Math.max(shellShape.width, 1);
    const snapY = snapPixels / Math.max(shellShape.height, 1);
    let nextX = position.x;
    let nextY = position.y;
    const right = nextX + widthRatio;
    const bottom = nextY + heightRatio;

    if (Math.abs(nextX) <= snapX) {
        nextX = 0;
    }
    if (Math.abs(nextY) <= snapY) {
        nextY = 0;
    }
    if (Math.abs(1 - right) <= snapX) {
        nextX = 1 - widthRatio;
    }
    if (Math.abs(1 - bottom) <= snapY) {
        nextY = 1 - heightRatio;
    }

    return { x: roundValue(nextX, 4), y: roundValue(nextY, 4) };
}

function getRoomResizeLimits(room) {
    const defaultMin = 0.12;
    const maxBound = 1;
    const house = state.assessment?.objects?.housePlan?.properties || {};
    const houseWidth = Math.max(Number(house.width || 0), 1);
    const houseHeight = Math.max(Number(house.height || 0), 1);
    const isStair = String(room?.properties?.room_type || "").toLowerCase() === "stair";
    const direction = String(room?.properties?.stair_direction || "up");

    let minWidth = defaultMin;
    let minHeight = defaultMin;
    let maxWidthRatio = maxBound;
    let maxHeightRatio = maxBound;

    if (isStair) {
        if (direction === "up" || direction === "down") {
            minWidth = Math.min(maxBound, 3 / houseWidth);
            maxWidthRatio = Math.min(maxBound, 6 / houseWidth);
        } else {
            minHeight = Math.min(maxBound, 3 / houseHeight);
            maxHeightRatio = Math.min(maxBound, 6 / houseHeight);
        }
    }

    return {
        minWidth,
        minHeight,
        maxWidthRatio,
        maxHeightRatio,
        maxWidth: (x) => Math.min(maxWidthRatio, maxBound - x),
        maxHeight: (y) => Math.min(maxHeightRatio, maxBound - y),
    };
}

function stopFloorPlanInteraction(event) {
    if (event && state.floorPlanInteraction && event.pointerId !== state.floorPlanInteraction.pointerId) {
        return;
    }
    if (state.floorPlanInteraction && state.assessment) {
        const room = state.assessment.objects.rooms.find((item) => item.id === state.floorPlanInteraction.roomId);
        if (room) {
            syncRoomPhysicalProperties(room);
        }
        if (room && state.selectedKind === "room" && state.selectedId === room.id) {
            renderSelection();
        } else {
            renderInteractiveDiagram();
        }
    }
    state.floorPlanInteraction = null;
}

function handleInteriorFixturePointerMove(event) {
    const interaction = state.interiorFixtureInteraction;
    if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
    }
    const design = getSelectedObject();
    const sourceRoom = getInteriorSourceRoom(design);
    const svg = document.querySelector("#interior-design-canvas .interior-floor-svg");
    if (!design || !sourceRoom || !svg) {
        return;
    }

    const pointer = clientPointToSvg(svg, event.clientX, event.clientY);
    const deltaX = (pointer.x - interaction.startPointer.x) / interaction.pixelsPerInch;
    const deltaY = (pointer.y - interaction.startPointer.y) / interaction.pixelsPerInch;
    const fixtures = getBathroomFixtures(design).map((fixture) => ({ ...fixture }));
    const fixture = fixtures.find((item) => item.id === interaction.fixtureId);
    if (!fixture) {
        return;
    }

    if (interaction.mode === "resize") {
        fixture.width_inches = snapInchesWithin(
            interaction.startFixture.width_inches + deltaX,
            12,
            Math.max(12, interaction.roomWidthInches - interaction.startFixture.x_inches),
        );
        fixture.depth_inches = snapInchesWithin(
            interaction.startFixture.depth_inches + deltaY,
            12,
            Math.max(12, interaction.roomDepthInches - interaction.startFixture.y_inches),
        );
    } else {
        fixture.x_inches = snapInchesWithin(
            interaction.startFixture.x_inches + deltaX,
            0,
            Math.max(0, interaction.roomWidthInches - interaction.startFixture.width_inches),
        );
        fixture.y_inches = snapInchesWithin(
            interaction.startFixture.y_inches + deltaY,
            0,
            Math.max(0, interaction.roomDepthInches - interaction.startFixture.depth_inches),
        );
    }

    Object.assign(fixture, fitFixtureToInteriorRoom(fixture, design, interaction.startFixture));

    setBathroomFixtureLayout(sourceRoom, fixtures);
    refreshInteriorDesignWindow();
}

function stopInteriorFixtureInteraction(event) {
    if (event && state.interiorFixtureInteraction && event.pointerId !== state.interiorFixtureInteraction.pointerId) {
        return;
    }
    state.interiorFixtureInteraction = null;
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
        state.assessment.house_plan_points = clampTranslatedHousePlan(startPoints, deltaX, deltaY, bounds);
    } else if (mode === "move-vertex") {
        const nextPoints = startPoints.map((point) => [...point]);
        nextPoints[pointIndex] = [
            roundValue(clamp(startPoints[pointIndex][0] + deltaX, bounds.minX, bounds.maxX), 4),
            roundValue(clamp(startPoints[pointIndex][1] + deltaY, bounds.minY, bounds.maxY), 4),
        ];
        state.assessment.house_plan_points = nextPoints;
    }

    state.housePlanInteraction.startPointer = pointer;
    state.housePlanInteraction.startPoints = state.assessment.house_plan_points.map((point) => [...point]);
    renderInteractiveDiagram();
}

function stopHousePlanInteraction(event) {
    if (event && state.housePlanInteraction && event.pointerId !== state.housePlanInteraction.pointerId) {
        return;
    }
    if (state.housePlanInteraction && state.assessment) {
        syncHousePlanObjects(state.assessment);
        renderSelection();
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

function snapInches(value) {
    return Math.round(Number(value || 0) / DESIGN_GRID_INCHES) * DESIGN_GRID_INCHES;
}

function snapInchesWithin(value, minimum, maximum) {
    const lower = Math.ceil(Number(minimum || 0) / DESIGN_GRID_INCHES) * DESIGN_GRID_INCHES;
    const upper = Math.floor(Number(maximum || 0) / DESIGN_GRID_INCHES) * DESIGN_GRID_INCHES;
    if (upper < lower) {
        return clamp(snapInches(value), Number(minimum || 0), Number(maximum || 0));
    }
    return clamp(snapInches(value), lower, upper);
}

function snapFixtureSizeInchesWithin(value, minimum, maximum) {
    const lower = Math.ceil(Number(minimum || 0) / FIXTURE_SIZE_GRID_INCHES) * FIXTURE_SIZE_GRID_INCHES;
    const upper = Math.floor(Number(maximum || 0) / FIXTURE_SIZE_GRID_INCHES) * FIXTURE_SIZE_GRID_INCHES;
    const snapped = Math.round(Number(value || 0) / FIXTURE_SIZE_GRID_INCHES) * FIXTURE_SIZE_GRID_INCHES;
    if (upper < lower) {
        return clamp(snapped, Number(minimum || 0), Number(maximum || 0));
    }
    return clamp(snapped, lower, upper);
}

function getHouseDimensionsInches() {
    const house = state.assessment?.objects?.housePlan?.properties || {};
    const linearUnit = String(house.linear_unit || "feet");
    return {
        width: Math.max(convertRoomLengthToInches(Number(house.width || 1), linearUnit), 1),
        height: Math.max(convertRoomLengthToInches(Number(house.height || 1), linearUnit), 1),
    };
}

function snapFloorRatioToInchGrid(value, axis) {
    const dimensions = getHouseDimensionsInches();
    const totalInches = axis === "y" ? dimensions.height : dimensions.width;
    return roundValue(clamp(snapInches(Number(value || 0) * totalInches) / totalInches, 0, 1), 6);
}

function snapFloorPolygonToInchGrid(points) {
    return points.map((point) => [
        snapFloorRatioToInchGrid(point[0], "x"),
        snapFloorRatioToInchGrid(point[1], "y"),
    ]);
}

function snapRoomLayoutToInchGrid(layout) {
    const left = snapFloorRatioToInchGrid(layout.x, "x");
    const top = snapFloorRatioToInchGrid(layout.y, "y");
    const right = Math.max(left, snapFloorRatioToInchGrid(layout.x + layout.width, "x"));
    const bottom = Math.max(top, snapFloorRatioToInchGrid(layout.y + layout.height, "y"));
    return {
        x: left,
        y: top,
        width: roundValue(right - left, 6),
        height: roundValue(bottom - top, 6),
    };
}

function snapRoomGeometryToInchGrid(room) {
    const polygon = getRoomPolygonRatios(room);
    if (polygon.length >= 3) {
        syncRoomPolygonBounds(room, snapFloorPolygonToInchGrid(polygon));
        return;
    }
    const snapped = snapRoomLayoutToInchGrid({
        x: Number(room?.properties?.floor_x_ratio || 0),
        y: Number(room?.properties?.floor_y_ratio || 0),
        width: Number(room?.properties?.floor_width_ratio || 0),
        height: Number(room?.properties?.floor_height_ratio || 0),
    });
    room.properties.floor_x_ratio = snapped.x;
    room.properties.floor_y_ratio = snapped.y;
    room.properties.floor_width_ratio = snapped.width;
    room.properties.floor_height_ratio = snapped.height;
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

function getFootprintLengthWidth(points) {
    const normalized = normalizePolygonPoints(points);
    if (normalized.length < 3) {
        return { width: 0, length: 0 };
    }

    const centroid = getPolygonCentroid(normalized);
    const angle = getLongestEdgeAngle(normalized);
    const rotated = rotateSourcePoints(normalized, -angle, centroid);
    const bounds = getSourceBounds(rotated);
    const spanX = Math.max(bounds.maxX - bounds.minX, 0);
    const spanY = Math.max(bounds.maxY - bounds.minY, 0);

    return spanX >= spanY
        ? { width: spanY, length: spanX }
        : { width: spanX, length: spanY };
}

function computePolygonArea(points) {
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
        const [x1, y1] = getPointCoordinates(points[index]);
        const [x2, y2] = getPointCoordinates(points[(index + 1) % points.length]);
        sum += (x1 * y2) - (x2 * y1);
    }
    return Math.abs(sum) / 2;
}

function computePolygonPerimeter(points) {
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
        const [x1, y1] = getPointCoordinates(points[index]);
        const [x2, y2] = getPointCoordinates(points[(index + 1) % points.length]);
        sum += Math.hypot(x2 - x1, y2 - y1);
    }
    return sum;
}

function getPointCoordinates(point) {
    return Array.isArray(point)
        ? [Number(point[0]), Number(point[1])]
        : [Number(point?.x || 0), Number(point?.y || 0)];
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

function addSelectedPlanVertex() {
    const room = state.selectedKind === "room" ? getSelectedObject() : null;
    if (room) {
        addRoomPolygonVertex(room);
        return;
    }
    addHousePlanVertex();
}

function removeSelectedPlanVertex() {
    const room = state.selectedKind === "room" ? getSelectedObject() : null;
    if (room) {
        removeRoomPolygonVertex(room);
        return;
    }
    removeHousePlanVertex();
}

function addRoomPolygonVertex(room) {
    const points = ensureRoomPolygon(room).map((point) => [...point]);
    let insertAfterIndex = 0;
    let longestEdge = -1;
    points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
        if (length > longestEdge) {
            longestEdge = length;
            insertAfterIndex = index;
        }
    });
    const current = points[insertAfterIndex];
    const next = points[(insertAfterIndex + 1) % points.length];
    splitPolygonRoomEdgeSegments(room, insertAfterIndex, points.length);
    points.splice(insertAfterIndex + 1, 0, [
        snapFloorRatioToInchGrid((current[0] + next[0]) / 2, "x"),
        snapFloorRatioToInchGrid((current[1] + next[1]) / 2, "y"),
    ]);
    room.properties.floor_polygon_ratios = points;
    state.selectedRoomVertexIndex = insertAfterIndex + 1;
    syncRoomPhysicalProperties(room);
    renderSelection();
}

function removeRoomPolygonVertex(room) {
    const points = getRoomPolygonRatios(room).map((point) => [...point]);
    if (points.length <= 3 || !Number.isInteger(state.selectedRoomVertexIndex)) {
        return;
    }
    mergePolygonRoomVertexSegments(room, state.selectedRoomVertexIndex, points.length);
    points.splice(state.selectedRoomVertexIndex, 1);
    room.properties.floor_polygon_ratios = points;
    state.selectedRoomVertexIndex = Math.min(state.selectedRoomVertexIndex, points.length - 1);
    syncRoomPhysicalProperties(room);
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
    } else if (item.kind === "floor-plan") {
        tags.push(`<span class="detail-chip">${escapeHtml(String(item.properties.room_count))} rooms</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(formatNumber(item.properties.total_area_square_feet))} sq ft</span>`);
    } else if (item.kind === "house") {
        tags.push(`<span class="detail-chip">${escapeHtml(String(item.properties.vertex_count))} vertices</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(formatAreaValue(item.properties.area, item.properties.area_unit))}</span>`);
    } else if (item.kind === "house-vertex") {
        tags.push(`<span class="detail-chip">Vertex ${escapeHtml(String(item.properties.vertex_index))}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.linear_unit)}</span>`);
    } else if (item.kind === "room") {
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.room_type)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(formatAreaValue(item.properties.area, item.properties.area_unit))}</span>`);
    } else if (item.kind === "interior-design") {
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.room_type)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.scheme_name)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(formatCurrency(item.properties.estimated_budget, item.properties.cost_currency))}</span>`);
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
                <li>Length: ${escapeHtml(formatNumber(item.properties.height))} ${escapeHtml(item.properties.linear_unit)}</li>
                <li>Area: ${escapeHtml(formatAreaValue(item.properties.area, item.properties.area_unit))}</li>
            </ul>
        `;
    }

    if (item.kind === "floor-plan") {
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>Level: ${escapeHtml(item.properties.level_name)}</li>
                <li>Total area: ${escapeHtml(formatNumber(item.properties.total_area_square_feet))} sq ft</li>
                <li>Rooms: ${escapeHtml(String(item.properties.room_count))}</li>
                <li>Stairs: ${escapeHtml(String(item.properties.stair_count))}</li>
                <li>Footprint walls: ${escapeHtml(String(item.properties.wall_count))}</li>
                <li>Shell size: ${escapeHtml(formatNumber(item.properties.shell_width))} x ${escapeHtml(formatNumber(item.properties.shell_height))} ${escapeHtml(item.properties.linear_unit)}</li>
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

    if (item.kind === "interior-design") {
        const palette = item.properties.palette_colors.map((color) => `
            <li>${escapeHtml(color.name)} (${escapeHtml(color.hex)})</li>
        `).join("");
        const selections = [
            `Finish: ${item.properties.primary_finish}`,
            `Material: ${item.properties.material_name}`,
            `Furniture: ${item.properties.furniture_anchor}`,
            `Lighting: ${item.properties.lighting_fixture}`,
            `Textile: ${item.properties.textile_selection}`,
            `Window treatment: ${item.properties.window_treatment}`,
        ].map((value) => `<li>${escapeHtml(value)}</li>`).join("");
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>Room: ${escapeHtml(item.properties.room_label)}</li>
                <li>Level: ${escapeHtml(item.properties.level_name)}</li>
                <li>Budget: ${escapeHtml(formatCurrency(item.properties.estimated_budget, item.properties.cost_currency))}</li>
                <li>Status: ${escapeHtml(item.properties.procurement_status)}</li>
            </ul>
            <p><strong>Palette</strong></p>
            <ul class="selection-list">${palette}</ul>
            <p><strong>Selections</strong></p>
            <ul class="selection-list">${selections}</ul>
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
    const entries = Object.entries(propertiesData).filter(([key]) => shouldDisplayProperty(item, key));
    const properties = document.getElementById("properties-list");
    properties.innerHTML = entries.map(([key, value]) => renderPropertyEntry(item, key, value, propertiesData)).join("");
}

function renderPropertyEntry(item, key, value, properties) {
    const propertyLabel = item.kind === "room" && key === "height" ? "Depth" : formatPropertyLabel(key);
    const label = escapeHtml(propertyLabel);
    if (item.kind === "room" && (key === "width" || key === "height")) {
        return `<dt>${label}</dt><dd>${buildRoomDimensionEditor(item, key, value, properties)}</dd>`;
    }
    if (item.kind === "room" && key === "room_name") {
        return `<dt>${label}</dt><dd>${buildRoomNameEditor(value)}</dd>`;
    }
    if (item.kind === "room" && key === "room_type") {
        return `<dt>${label}</dt><dd>${buildRoomTypeEditor(value)}</dd>`;
    }
    if (item.kind === "room" && key === "room_shape") {
        return `<dt>${label}</dt><dd>${buildRoomShapeEditor(value)}</dd>`;
    }
    if (item.kind === "room" && key === "stair_clear_width_feet") {
        return `<dt>${label}</dt><dd>${buildStairWidthEditor(value)}</dd>`;
    }
    if (item.kind === "room" && ["walls", "doors", "windows"].includes(key)) {
        return `<dt>${label}</dt><dd>${buildRoomSegmentEditor(key, value, item)}</dd>`;
    }
    return `<dt>${label}</dt><dd>${escapeHtml(formatPropertyValue(key, value, properties))}</dd>`;
}

function buildDisplayProperties(item) {
    const roomPolygon = item.kind === "room" ? getRoomPolygonRatios(item) : [];
    const baseProperties = item.kind === "room"
        ? {
            room_name: item.label,
            room_shape: roomPolygon.length >= 3 ? "polygon" : "rectangle",
            room_vertex_count: roomPolygon.length >= 3 ? roomPolygon.length : 4,
            ...(item.properties || {}),
        }
        : { ...(item.properties || {}) };
    if (item.kind === "room" && String(baseProperties.room_type || "").toLowerCase() === "stair") {
        const direction = String(baseProperties.stair_direction || "up");
        const widthValue = direction === "left" || direction === "right"
            ? Number(baseProperties.height || 0)
            : Number(baseProperties.width || 0);
        const widthFeet = convertLengthToFeet(widthValue, baseProperties.linear_unit);
        return {
            ...baseProperties,
            stair_clear_width_feet: roundValue(widthFeet, 2),
            stair_width_range: "3 to 6 ft",
        };
    }
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
        <p>${escapeHtml(String(state.assessment.landscape_features.length))} garden features are mapped onto the current parcel.</p>
        <p><strong>Garden Program</strong></p>
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
    if (state.selectedKind === "floor-plan") {
        return buildFloorPlanSelection(state.selectedId);
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
    if (state.selectedKind === "interior-design") {
        return getInteriorDesignObjects().find((item) => item.id === state.selectedId) || null;
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

function getInteriorDesignObjects() {
    const rooms = state.assessment?.objects?.rooms || [];
    return rooms
        .filter((room) => !room.properties?.generated_floor_room)
        .map(buildInteriorDesignObject);
}

function buildInteriorDesignObject(room) {
    const roomType = String(room.properties.room_type || "room").toLowerCase();
    const spec = getInteriorDesignSpec(roomType);
    const budget = estimateInteriorDesignBudget(room, spec);
    const defaults = {
        room_design_id: `interior-${room.properties.room_id || room.id}`,
        target_room_id: room.properties.room_id || room.id,
        source_room_id: room.id,
        room_label: room.label,
        room_type: room.properties.room_type || "room",
        level_name: room.properties.level_name || "Main Level",
        room_width: room.properties.width || 0,
        room_height: room.properties.height || 0,
        linear_unit: room.properties.linear_unit || "feet",
        scheme_name: spec.schemeName,
        palette_name: spec.paletteName,
        palette_colors: spec.paletteColors,
        primary_finish: spec.primaryFinish,
        surface_type: spec.surfaceType,
        material_name: spec.materialName,
        color_name: spec.paletteColors[0]?.name || spec.paletteName,
        furniture_anchor: spec.furnitureAnchor,
        lighting_fixture: spec.lightingFixture,
        textile_selection: spec.textileSelection,
        window_treatment: spec.windowTreatment,
        category: spec.category,
        quantity: spec.quantity,
        estimated_budget: budget,
        cost_currency: "USD",
        vendor_name: "TBD",
        procurement_status: "candidate",
        priority: spec.priority,
        notes: spec.notes,
    };
    if (isEditableInteriorComponentRoom({ properties: defaults })) {
        defaults.fixture_layout = buildDefaultInteriorComponents({ properties: defaults });
    }
    const overrides = normalizeInteriorDesignOverrides(room.properties.interior_design);
    const properties = {
        ...defaults,
        ...overrides,
        palette_colors: overrides.palette_colors || defaults.palette_colors,
        source_room_id: room.id,
        target_room_id: room.properties.room_id || room.id,
        room_label: room.label,
        room_type: room.properties.room_type || "room",
        level_name: room.properties.level_name || "Main Level",
        room_width: room.properties.width || 0,
        room_height: room.properties.height || 0,
        linear_unit: room.properties.linear_unit || "feet",
    };
    if (isEditableInteriorComponentRoom({ properties })) {
        properties.fixture_layout = normalizeBathroomFixtureLayout(
            overrides.fixture_layout === undefined ? defaults.fixture_layout : overrides.fixture_layout,
            { properties },
        );
        if (overrides.fixture_layout !== undefined
            && JSON.stringify(overrides.fixture_layout) !== JSON.stringify(properties.fixture_layout)) {
            room.properties.interior_design = sanitizeInteriorDesignOverrides({
                ...overrides,
                fixture_layout: properties.fixture_layout,
            });
        }
    }
    return {
        id: `interior-${room.id}`,
        kind: "interior-design",
        label: `${room.label} Design`,
        subtitle: `${properties.scheme_name} | ${formatCurrency(properties.estimated_budget, properties.cost_currency)}`,
        description: `Interior design specification for ${room.label}, linked to the existing room object and organized around finishes, palette, furniture, lighting, textile, budget, and procurement selections.`,
        properties,
    };
}

function normalizeInteriorDesignOverrides(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    const overrides = { ...value };
    if (Array.isArray(overrides.palette_colors)) {
        overrides.palette_colors = overrides.palette_colors
            .filter((color) => color && typeof color === "object")
            .map((color) => ({
                name: String(color.name || "Color"),
                hex: normalizeHexColor(color.hex),
            }));
    }
    if (overrides.estimated_budget !== undefined) {
        overrides.estimated_budget = Math.max(0, Number(overrides.estimated_budget || 0));
    }
    return overrides;
}

function normalizeHexColor(value) {
    const text = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : "#ECE7DD";
}

function getInteriorDesignSpec(roomType) {
    const specs = {
        kitchen: {
            schemeName: "Durable warm modern kitchen",
            paletteName: "Warm White + Natural Wood",
            paletteColors: [
                { name: "Warm White", hex: "#F4EFE5" },
                { name: "Natural Oak", hex: "#B98555" },
                { name: "Soft Graphite", hex: "#4B5357" },
            ],
            primaryFinish: "Porcelain tile floor with washable satin wall paint",
            surfaceType: "floor, wall, cabinet, countertop",
            materialName: "Porcelain tile, oak veneer, quartz",
            furnitureAnchor: "Counter stools and compact breakfast table",
            lightingFixture: "Layered recessed, under-cabinet, and pendant lighting",
            textileSelection: "Washable runner with low pile",
            windowTreatment: "Moisture-resistant woven shade",
            category: "kitchen selections",
            quantity: 1,
            priority: "high",
            budgetFactor: 95,
            notes: "Prioritize cleanability, task lighting, and durable work surfaces.",
        },
        bathroom: {
            schemeName: "Calm spa bath",
            paletteName: "Stone + Mist",
            paletteColors: [
                { name: "Limestone", hex: "#D8D2C4" },
                { name: "Mist Blue", hex: "#A9BDC5" },
                { name: "Brushed Nickel", hex: "#8F9698" },
            ],
            primaryFinish: "Slip-resistant porcelain floor and ceramic wet-wall tile",
            surfaceType: "floor, wall, vanity",
            materialName: "Porcelain, ceramic tile, sealed wood",
            furnitureAnchor: "Floating vanity with closed storage",
            lightingFixture: "Dimmable vanity sconces and wet-rated ceiling light",
            textileSelection: "Cotton bath linens and washable bath mat",
            windowTreatment: "Privacy shade with moisture-safe fabric",
            category: "bath selections",
            quantity: 1,
            priority: "high",
            budgetFactor: 85,
            notes: "Use moisture-safe finishes and layered glare-free lighting.",
        },
        bedroom: {
            schemeName: "Quiet layered bedroom",
            paletteName: "Clay + Linen",
            paletteColors: [
                { name: "Soft Linen", hex: "#E7DDCE" },
                { name: "Muted Clay", hex: "#B47B64" },
                { name: "Deep Olive", hex: "#5F6652" },
            ],
            primaryFinish: "Engineered wood floor with matte low-VOC wall paint",
            surfaceType: "floor, wall, trim",
            materialName: "Engineered oak, wool, linen",
            furnitureAnchor: "Bed, nightstands, dresser, and reading chair",
            lightingFixture: "Warm bedside sconces and dimmable ceiling fixture",
            textileSelection: "Layered linen bedding and wool area rug",
            windowTreatment: "Blackout drapery with woven shade",
            category: "bedroom furnishings",
            quantity: 1,
            priority: "medium",
            budgetFactor: 55,
            notes: "Balance storage, softness, and evening lighting.",
        },
        garage: {
            schemeName: "Utility storage garage",
            paletteName: "Concrete + Signal",
            paletteColors: [
                { name: "Sealed Concrete", hex: "#A5A8A4" },
                { name: "Tool Red", hex: "#B94A3D" },
                { name: "Charcoal", hex: "#3F4547" },
            ],
            primaryFinish: "Sealed concrete floor and washable wall finish",
            surfaceType: "floor, wall, storage",
            materialName: "Concrete sealer, powder-coated steel",
            furnitureAnchor: "Wall-mounted storage, workbench, and utility shelving",
            lightingFixture: "High-output linear LED task lighting",
            textileSelection: "Entry mat and utility runner",
            windowTreatment: "Simple privacy film or roller shade",
            category: "garage storage",
            quantity: 1,
            priority: "medium",
            budgetFactor: 22,
            notes: "Keep circulation clear and make storage visible.",
        },
        stair: {
            schemeName: "Safe vertical circulation",
            paletteName: "Oak + Contrast",
            paletteColors: [
                { name: "Clear Oak", hex: "#C99A63" },
                { name: "Soft Black", hex: "#24282B" },
                { name: "Warm White", hex: "#F2EDE4" },
            ],
            primaryFinish: "Durable stair tread finish with high-contrast nosing",
            surfaceType: "stair tread, railing, wall",
            materialName: "Oak, steel, washable paint",
            furnitureAnchor: "Integrated landing console or wall hooks",
            lightingFixture: "Step lights and wall sconces",
            textileSelection: "Optional bound stair runner",
            windowTreatment: "None unless adjacent window requires privacy",
            category: "stair finishes",
            quantity: 1,
            priority: "high",
            budgetFactor: 40,
            notes: "Prioritize code-safe lighting, grip, and visible nosing.",
        },
        default: {
            schemeName: "Flexible residential room",
            paletteName: "Sage + Walnut",
            paletteColors: [
                { name: "Sage", hex: "#91A389" },
                { name: "Walnut", hex: "#6B4D3E" },
                { name: "Soft Chalk", hex: "#ECE7DD" },
            ],
            primaryFinish: "Engineered wood floor with washable matte wall paint",
            surfaceType: "floor, wall, trim",
            materialName: "Engineered wood, washable paint, wool blend",
            furnitureAnchor: "Flexible seating, storage, and task surface",
            lightingFixture: "Dimmable ceiling fixture with task lamp",
            textileSelection: "Wool-blend rug and durable upholstery",
            windowTreatment: "Layered woven shade and soft panel",
            category: "room package",
            quantity: 1,
            priority: "medium",
            budgetFactor: 45,
            notes: "Keep the room adaptable while selecting durable finishes.",
        },
    };

    if (roomType.includes("kitchen")) {
        return specs.kitchen;
    }
    if (roomType.includes("bath")) {
        return specs.bathroom;
    }
    if (roomType.includes("bed")) {
        return specs.bedroom;
    }
    if (roomType.includes("garage")) {
        return specs.garage;
    }
    if (roomType.includes("stair")) {
        return specs.stair;
    }
    return specs.default;
}

function estimateInteriorDesignBudget(room, spec) {
    const area = Number(room.properties.area || 0);
    const normalizedArea = room.properties.area_unit === "square feet" ? area : area;
    const base = Math.max(normalizedArea, 80) * Number(spec.budgetFactor || 45);
    return Math.round(base / 50) * 50;
}

function buildFloorPlanSelection(levelKey) {
    if (
        !state.assessment
        || !["basement", "first-floor", "second-floor"].includes(levelKey)
        || !state.assessment.objects?.housePlan
        || !Array.isArray(state.assessment.house_plan_points)
        || state.assessment.house_plan_points.length < 3
    ) {
        return null;
    }

    const levelLabel = getFloorLevelLabel(levelKey);
    const rooms = (state.assessment.objects.rooms || []).filter((room) => roomBelongsToFloor(room, levelKey));
    const stairCount = rooms.filter((room) => String(room.properties.room_type || "").toLowerCase() === "stair").length;
    const shellBox = buildFloorShellBox(state.assessment.house_plan_points || []);
    const shellShape = buildFloorShellShape(shellBox, state.assessment.objects.rooms || [], levelKey);
    const houseLinearUnit = state.assessment.objects.housePlan?.properties?.linear_unit || "feet";
    const houseArea = Number(state.assessment.objects.housePlan?.properties?.area || 0);
    const fullFootprintWidth = Number(state.assessment.objects.housePlan?.properties?.width || 0);
    const fullFootprintHeight = Number(state.assessment.objects.housePlan?.properties?.height || 0);
    const levelShellWidth = shellBox.width > 0 ? fullFootprintWidth * (shellShape.width / shellBox.width) : fullFootprintWidth;
    const levelShellHeight = shellBox.height > 0 ? fullFootprintHeight * (shellShape.height / shellBox.height) : fullFootprintHeight;
    const fullShellArea = computePolygonArea(shellBox.vertexPoints || []);
    const levelShellAreaRatio = fullShellArea > 0 ? computePolygonArea(shellShape.vertexPoints || []) / fullShellArea : 0;
    const totalAreaSquareFeet = houseArea * levelShellAreaRatio;

    return {
        id: levelKey,
        kind: "floor-plan",
        label: `${levelLabel} Plan`,
        subtitle: `${rooms.length} rooms | ${formatNumber(totalAreaSquareFeet)} sq ft`,
        description: `Blueprint overview for the ${levelLabel.toLowerCase()} floor.`,
        properties: {
            level_name: levelLabel,
            total_area_square_feet: roundValue(totalAreaSquareFeet, 2),
            room_count: rooms.length,
            stair_count: stairCount,
            wall_count: shellShape.vertexPoints.length,
            shell_width: roundValue(levelShellWidth, 2),
            shell_height: roundValue(levelShellHeight, 2),
            linear_unit: houseLinearUnit,
            room_names: rooms.map((room) => room.label),
        },
    };
}

function updateFeatureActions() {
    const loadHouseGisButton = document.getElementById("load-house-gis");
    const addHousePlanButton = document.getElementById("add-house-plan");
    const removeHousePlanButton = document.getElementById("remove-house-plan");
    const addRoomButton = document.getElementById("add-room");
    const removeRoomButton = document.getElementById("remove-room");
    const rotateStairButton = document.getElementById("rotate-stair");
    const addHouseVertexButton = document.getElementById("add-house-vertex");
    const removeHouseVertexButton = document.getElementById("remove-house-vertex");
    const saveButton = document.getElementById("save-features");
    const removeButton = document.getElementById("remove-feature");
    const hasAssessment = Boolean(state.assessment);
    const hasHousePlan = hasAssessment && Boolean(state.assessment.objects.housePlan);
    const isHouseVertexSelected = hasAssessment && state.selectedKind === "house-vertex" && Boolean(getSelectedObject());
    const isFeatureSelected = hasAssessment && state.selectedKind === "feature" && Boolean(getSelectedObject());
    const selectedRoom = hasAssessment && state.selectedKind === "room" ? getSelectedObject() : null;
    const selectedRoomPolygon = selectedRoom ? getRoomPolygonRatios(selectedRoom) : [];
    const isRoomVertexSelected = Boolean(selectedRoom)
        && selectedRoomPolygon.length > 3
        && Number.isInteger(state.selectedRoomVertexIndex);
    const isStairSelected = Boolean(selectedRoom) && String(selectedRoom.properties.room_type || "").toLowerCase() === "stair";
    const isFloorView = ["basement", "first-floor", "second-floor"].includes(state.activeView);

    const isNeo4jBacked = state.persistenceMode === "neo4j" && Boolean(state.currentNeo4jParcelId);
    loadHouseGisButton.disabled = !isNeo4jBacked;
    addHousePlanButton.disabled = !hasAssessment || hasHousePlan;
    removeHousePlanButton.disabled = !hasHousePlan;
    addRoomButton.disabled = !hasAssessment || !hasHousePlan || !isFloorView;
    removeRoomButton.disabled = !selectedRoom;
    rotateStairButton.disabled = !isStairSelected;
    addHouseVertexButton.disabled = !hasHousePlan;
    addHouseVertexButton.textContent = selectedRoom ? "Add Room Vertex" : "Add Vertex";
    removeHouseVertexButton.textContent = selectedRoom ? "Remove Room Vertex" : "Remove Vertex";
    removeHouseVertexButton.disabled = selectedRoom
        ? !isRoomVertexSelected
        : !isHouseVertexSelected || state.assessment.house_plan_points.length <= 3;
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
            floor_polygon_ratios: [],
            stair_direction: "up",
            walls: buildDefaultRoomWalls(),
            doors: buildDefaultRoomDoors(),
            windows: buildDefaultRoomWindows(),
        },
    };

    syncRoomPhysicalProperties(newRoom);
    state.assessment.objects.rooms.push(newRoom);
    state.selectedKind = "room";
    state.selectedId = newRoom.id;
    renderCatalog();
    renderSelection();
}

function removeSelectedRoom() {
    if (!state.assessment || state.selectedKind !== "room") {
        return;
    }

    const roomIndex = state.assessment.objects.rooms.findIndex((room) => room.id === state.selectedId);
    if (roomIndex < 0) {
        return;
    }

    const [removedRoom] = state.assessment.objects.rooms.splice(roomIndex, 1);
    const fallbackLevel = removedRoom ? mapLevelNameToView(removedRoom.properties.level_name) : state.activeView;
    state.selectedKind = "floor-plan";
    state.selectedId = fallbackLevel;
    state.activeView = fallbackLevel;
    state.selectedRoomVertexIndex = null;
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
    snapRoomGeometryToInchGrid(room);
    const polygon = getRoomPolygonRatios(room);
    if (polygon.length >= 3) {
        syncRoomPolygonBounds(room, polygon);
    }
    let widthRatio = Number(room.properties.floor_width_ratio || 0);
    let heightRatio = Number(room.properties.floor_height_ratio || 0);

    room.properties.width = roundValue(houseWidth * widthRatio, 4);
    room.properties.height = roundValue(houseHeight * heightRatio, 4);
    if (String(room.properties.room_type || "").toLowerCase() === "stair") {
        enforceStairConstraints(room, houseWidth, houseHeight);
        widthRatio = Number(room.properties.floor_width_ratio || 0);
        heightRatio = Number(room.properties.floor_height_ratio || 0);
    }
    room.properties.area = roundValue(houseArea * (
        polygon.length >= 3 ? computePolygonArea(polygon) : widthRatio * heightRatio
    ), 2);
    room.properties.walls = normalizeRoomWalls(room.properties.walls);
    room.properties.doors = normalizeRoomOpenings(room.properties.doors);
    room.properties.windows = normalizeRoomOpenings(room.properties.windows);
}

function normalizeRoomPolygonRatios(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const points = value.filter((point) => Array.isArray(point) && point.length >= 2).map((point) => [
        roundValue(clamp(Number(point[0]), 0, 1), 6),
        roundValue(clamp(Number(point[1]), 0, 1), 6),
    ]);
    return points.length >= 3 ? points : [];
}

function getRoomPolygonRatios(room) {
    return normalizeRoomPolygonRatios(room?.properties?.floor_polygon_ratios);
}

function buildRoomRectanglePolygon(room) {
    const x = clamp(Number(room.properties.floor_x_ratio || 0.1), 0, 1);
    const y = clamp(Number(room.properties.floor_y_ratio || 0.1), 0, 1);
    const width = clamp(Number(room.properties.floor_width_ratio || 0.3), 0.01, 1 - x);
    const height = clamp(Number(room.properties.floor_height_ratio || 0.2), 0.01, 1 - y);
    return [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
    ].map((point) => point.map((value) => roundValue(value, 6)));
}

function ensureRoomPolygon(room) {
    const existing = getRoomPolygonRatios(room);
    if (existing.length >= 3) {
        assignPolygonSegmentEdges(room, existing.length);
        return existing;
    }
    const polygon = snapFloorPolygonToInchGrid(buildRoomRectanglePolygon(room));
    room.properties.floor_polygon_ratios = polygon;
    assignPolygonSegmentEdges(room, polygon.length);
    syncRoomPolygonBounds(room, polygon);
    return polygon;
}

function assignPolygonSegmentEdges(room, pointCount) {
    ["walls", "doors", "windows"].forEach((kind) => {
        const list = Array.isArray(room.properties[kind]) ? room.properties[kind] : [];
        room.properties[kind] = list.map((segment, index) => ({
            ...segment,
            edge_index: getPolygonSegmentEdgeIndex(segment, index, pointCount),
        }));
    });
}

function splitPolygonRoomEdgeSegments(room, edgeIndex, pointCount) {
    ["walls", "doors", "windows"].forEach((kind) => {
        const source = Array.isArray(room.properties[kind]) ? room.properties[kind] : [];
        const next = [];
        source.forEach((segment, index) => {
            const currentEdge = getPolygonSegmentEdgeIndex(segment, index, pointCount);
            if (currentEdge > edgeIndex) {
                next.push({ ...segment, edge_index: currentEdge + 1 });
                return;
            }
            if (currentEdge < edgeIndex) {
                next.push({ ...segment, edge_index: currentEdge });
                return;
            }
            const start = clamp(Number(segment.start_ratio ?? 0), 0, 1);
            const end = clamp(Number(segment.end_ratio ?? 1), 0, 1);
            if (end <= 0.5) {
                next.push({ ...segment, edge_index: edgeIndex, start_ratio: start * 2, end_ratio: end * 2 });
            } else if (start >= 0.5) {
                next.push({ ...segment, edge_index: edgeIndex + 1, start_ratio: (start - 0.5) * 2, end_ratio: (end - 0.5) * 2 });
            } else {
                next.push({ ...segment, edge_index: edgeIndex, start_ratio: start * 2, end_ratio: 1 });
                next.push({ ...segment, edge_index: edgeIndex + 1, start_ratio: 0, end_ratio: (end - 0.5) * 2 });
            }
        });
        room.properties[kind] = kind === "walls" ? normalizeRoomWalls(next) : normalizeRoomOpenings(next);
    });
}

function mergePolygonRoomVertexSegments(room, vertexIndex, pointCount) {
    const previousEdge = (vertexIndex - 1 + pointCount) % pointCount;
    const removedEdge = vertexIndex;
    const mergedEdge = vertexIndex === 0 ? pointCount - 2 : previousEdge;
    ["walls", "doors", "windows"].forEach((kind) => {
        const source = Array.isArray(room.properties[kind]) ? room.properties[kind] : [];
        const next = source.map((segment, index) => {
            const currentEdge = getPolygonSegmentEdgeIndex(segment, index, pointCount);
            if (currentEdge === previousEdge) {
                return {
                    ...segment,
                    edge_index: mergedEdge,
                    start_ratio: Number(segment.start_ratio ?? 0) / 2,
                    end_ratio: Number(segment.end_ratio ?? 1) / 2,
                };
            }
            if (currentEdge === removedEdge) {
                return {
                    ...segment,
                    edge_index: mergedEdge,
                    start_ratio: 0.5 + (Number(segment.start_ratio ?? 0) / 2),
                    end_ratio: 0.5 + (Number(segment.end_ratio ?? 1) / 2),
                };
            }
            return { ...segment, edge_index: currentEdge > removedEdge ? currentEdge - 1 : currentEdge };
        });
        room.properties[kind] = kind === "walls" ? normalizeRoomWalls(next) : normalizeRoomOpenings(next);
    });
}

function syncRoomPolygonBounds(room, points = getRoomPolygonRatios(room)) {
    if (points.length < 3) {
        return;
    }
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    room.properties.floor_x_ratio = roundValue(minX, 6);
    room.properties.floor_y_ratio = roundValue(minY, 6);
    room.properties.floor_width_ratio = roundValue(Math.max(...xs) - minX, 6);
    room.properties.floor_height_ratio = roundValue(Math.max(...ys) - minY, 6);
    room.properties.floor_polygon_ratios = points.map((point) => point.map((value) => roundValue(value, 6)));
}

function convertRoomToRectangle(room) {
    const points = getRoomPolygonRatios(room);
    if (points.length >= 3) {
        syncRoomPolygonBounds(room, points);
    }
    room.properties.floor_polygon_ratios = [];
    const rectangleEdges = ["top", "right", "bottom", "left"];
    ["walls", "doors", "windows"].forEach((kind) => {
        const list = Array.isArray(room.properties[kind]) ? room.properties[kind] : [];
        room.properties[kind] = list.filter((segment, index) => (
            getPolygonSegmentEdgeIndex(segment, index, Math.max(points.length, 4)) < 4
        )).map((segment, index) => {
            const next = { ...segment, edge: rectangleEdges[getPolygonSegmentEdgeIndex(segment, index, Math.max(points.length, 4))] };
            delete next.edge_index;
            return next;
        });
    });
    state.selectedRoomVertexIndex = null;
    syncRoomPhysicalProperties(room);
}

function buildDefaultRoomWalls() {
    return [
        { edge: "top", start_ratio: 0, end_ratio: 1, thickness_inches: DEFAULT_WALL_THICKNESS_INCHES },
        { edge: "right", start_ratio: 0, end_ratio: 1, thickness_inches: DEFAULT_WALL_THICKNESS_INCHES },
        { edge: "bottom", start_ratio: 0, end_ratio: 1, thickness_inches: DEFAULT_WALL_THICKNESS_INCHES },
        { edge: "left", start_ratio: 0, end_ratio: 1, thickness_inches: DEFAULT_WALL_THICKNESS_INCHES },
    ];
}

function buildDefaultRoomDoors() {
    return [{ edge: "bottom", start_ratio: 0.38, end_ratio: 0.62 }];
}

function buildDefaultRoomWindows() {
    return [{ edge: "top", start_ratio: 0.2, end_ratio: 0.8 }];
}

function normalizeRoomWalls(items) {
    const list = Array.isArray(items) ? items : buildDefaultRoomWalls();
    const migrateLegacyDefaults = isLegacyDefaultWallSet(list);
    return list.map((item) => ({
        edge: String(item.edge || "top"),
        ...(Number.isInteger(Number(item.edge_index)) ? { edge_index: Number(item.edge_index) } : {}),
        start_ratio: roundValue(Number(item.start_ratio ?? 0), 4),
        end_ratio: roundValue(Number(item.end_ratio ?? 1), 4),
        thickness_inches: migrateLegacyDefaults
            ? DEFAULT_WALL_THICKNESS_INCHES
            : roundValue(getWallThicknessInches(item), 2),
    }));
}

function isLegacyDefaultWallSet(items) {
    if (!Array.isArray(items) || items.length !== 4) {
        return false;
    }
    const expectedEdges = new Set(["top", "right", "bottom", "left"]);
    return items.every((item) => {
        const edge = String(item?.edge || "top");
        const start = Number(item?.start_ratio ?? 0);
        const end = Number(item?.end_ratio ?? 1);
        const thickness = Number(item?.thickness_inches ?? LEGACY_DEFAULT_WALL_THICKNESS_INCHES);
        expectedEdges.delete(edge);
        return start === 0 && end === 1 && thickness === LEGACY_DEFAULT_WALL_THICKNESS_INCHES;
    }) && expectedEdges.size === 0;
}

function normalizeRoomOpenings(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map((item) => ({
        edge: String(item.edge || "top"),
        ...(Number.isInteger(Number(item.edge_index)) ? { edge_index: Number(item.edge_index) } : {}),
        start_ratio: roundValue(Number(item.start_ratio ?? 0.2), 4),
        end_ratio: roundValue(Number(item.end_ratio ?? 0.8), 4),
    }));
}

function enforceStairConstraints(room, houseWidth, houseHeight) {
    const direction = String(room.properties.stair_direction || "up");
    const minFeet = 3;
    const maxFeet = 6;
    if (direction === "up" || direction === "down") {
        const clamped = clamp(Number(room.properties.width || 0), minFeet, maxFeet);
        room.properties.width = roundValue(clamped, 2);
        const ratio = snapFloorRatioToInchGrid(clamped / Math.max(houseWidth, 1), "x");
        if (getRoomPolygonRatios(room).length >= 3) {
            scaleRoomPolygonDimension(room, true, ratio);
        } else {
            room.properties.floor_width_ratio = ratio;
        }
    } else {
        const clamped = clamp(Number(room.properties.height || 0), minFeet, maxFeet);
        room.properties.height = roundValue(clamped, 2);
        const ratio = snapFloorRatioToInchGrid(clamped / Math.max(houseHeight, 1), "y");
        if (getRoomPolygonRatios(room).length >= 3) {
            scaleRoomPolygonDimension(room, false, ratio);
        } else {
            room.properties.floor_height_ratio = ratio;
        }
    }
}

function rotateSelectedStair() {
    const room = state.selectedKind === "room" ? getSelectedObject() : null;
    if (!room || String(room.properties.room_type || "").toLowerCase() !== "stair") {
        return;
    }
    rotateRoomDirection(room);
    renderSelection();
}

function rotateRoomDirection(room) {
    const directions = ["up", "right", "down", "left"];
    const current = String(room.properties.stair_direction || "up");
    const currentIndex = directions.indexOf(current);
    const next = directions[(currentIndex + 1 + directions.length) % directions.length];
    room.properties.stair_direction = next;
    syncRoomPhysicalProperties(room);
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
    document.getElementById("interior-design-count").textContent = "0";
    document.getElementById("utility-count").textContent = "0";
    document.getElementById("feature-count").textContent = "0";
    document.getElementById("patio-count").textContent = "0";
    document.getElementById("parcel-list").innerHTML = '<div class="placeholder">Load a parcel to populate the catalog.</div>';
    document.getElementById("edge-list").innerHTML = '<div class="placeholder">Boundary edges will appear here.</div>';
    document.getElementById("vertex-list").innerHTML = '<div class="placeholder">Corner vertices will appear here.</div>';
    document.getElementById("house-plan-list").innerHTML = '<div class="placeholder">Editable house footprint will appear here.</div>';
    document.getElementById("house-vertex-list").innerHTML = '<div class="placeholder">House footprint vertices will appear here.</div>';
    document.getElementById("room-list").innerHTML = '<div class="placeholder">Room objects will appear here.</div>';
    document.getElementById("interior-design-list").innerHTML = '<div class="placeholder">Room design schemes will appear here.</div>';
    document.getElementById("utility-list").innerHTML = '<div class="placeholder">Utility connections will appear here.</div>';
    document.getElementById("feature-list").innerHTML = '<div class="placeholder">Garden features will appear here.</div>';
    document.getElementById("patio-list").innerHTML = '<div class="placeholder">Patio features will appear here.</div>';
    document.getElementById("assumptions-list").innerHTML = '<li class="placeholder-line">No assumptions loaded yet.</li>';
    document.getElementById("recommendations-list").innerHTML = '<li class="placeholder-line">No recommendations loaded yet.</li>';
    document.getElementById("detail-title").textContent = "Parcel";
    document.getElementById("detail-subtitle").textContent = "Select a parcel object from the left panel or the diagram.";
    document.getElementById("detail-tags").innerHTML = '<span class="detail-chip">No object selected</span>';
    document.getElementById("detail-canvas").innerHTML = '<div class="placeholder">Parcel view will appear here.</div>';
    document.getElementById("garden-canvas").innerHTML = '<div class="placeholder">Garden view will appear here.</div>';
    document.getElementById("patio-canvas").innerHTML = '<div class="placeholder">Patio view will appear here.</div>';
    document.getElementById("interior-design-canvas").innerHTML = '<div class="placeholder">Interior design schedule will appear here.</div>';
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
                        floor_polygon_ratios: getRoomPolygonRatios(room),
                        stair_direction: room.properties.stair_direction || "up",
                        walls: room.properties.walls || [],
                        doors: room.properties.doors || [],
                        windows: room.properties.windows || [],
                        interior_design: room.properties.interior_design || {},
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

function formatRoomSegmentSummary(items, kind) {
    if (!Array.isArray(items) || !items.length) {
        return `No ${kind}`;
    }
    return items.map((item, index) => {
        const edge = Number.isInteger(Number(item.edge_index))
            ? `Edge ${Number(item.edge_index) + 1}`
            : titleCase(String(item.edge || "top"));
        const start = `${Math.round(Number(item.start_ratio ?? 0) * 100)}%`;
        const end = `${Math.round(Number(item.end_ratio ?? 1) * 100)}%`;
        return `${index + 1}. ${edge} ${start}-${end}`;
    }).join(" | ");
}

function getRoomWallLength(room, wall) {
    const edge = String(wall?.edge || "top");
    const house = state.assessment?.objects?.housePlan?.properties || {};
    const polygon = getRoomPolygonRatios(room);
    if (polygon.length >= 3) {
        const edgeIndex = getPolygonSegmentEdgeIndex(wall, 0, polygon.length);
        const startPoint = polygon[edgeIndex];
        const endPoint = polygon[(edgeIndex + 1) % polygon.length];
        const physicalWidth = Number(house.width || room?.properties?.width || 0);
        const physicalHeight = Number(house.height || room?.properties?.height || 0);
        const edgeLength = Math.hypot(
            (endPoint[0] - startPoint[0]) * physicalWidth,
            (endPoint[1] - startPoint[1]) * physicalHeight,
        );
        const start = clamp(Number(wall?.start_ratio ?? 0), 0, 1);
        const end = clamp(Number(wall?.end_ratio ?? 1), 0, 1);
        return Math.abs(end - start) * edgeLength;
    }
    const isHorizontal = edge === "top" || edge === "bottom";
    const ratioKey = isHorizontal ? "floor_width_ratio" : "floor_height_ratio";
    const dimensionKey = isHorizontal ? "width" : "height";
    const ratio = Number(room?.properties?.[ratioKey] || 0);
    const houseSpan = Number(house[dimensionKey] || 0);
    const fallbackSpan = Number(room?.properties?.[dimensionKey] || 0);
    const roomSpan = houseSpan > 0 && ratio > 0 ? houseSpan * ratio : fallbackSpan;
    const start = clamp(Number(wall?.start_ratio ?? 0), 0, 1);
    const end = clamp(Number(wall?.end_ratio ?? 1), 0, 1);
    return Math.abs(end - start) * roomSpan;
}

function formatRoomWallLength(room, wall) {
    const unit = String(room?.properties?.linear_unit || "feet");
    const length = getRoomWallLength(room, wall);
    if (unit === "feet") {
        const totalInches = Math.max(0, Math.round(length * 12));
        const feet = Math.floor(totalInches / 12);
        const inches = totalInches % 12;
        return `${feet}'-${inches}\"`;
    }
    return `${formatNumber(length)} ${unit}`;
}

function getWallThicknessInches(wall) {
    return clamp(Number(wall?.thickness_inches ?? DEFAULT_WALL_THICKNESS_INCHES), 1, 24);
}

function formatWallThickness(wall) {
    return `${formatNumber(getWallThicknessInches(wall))}\"`;
}

function convertRoomLengthToInches(value, linearUnit) {
    if (linearUnit === "meters") {
        return value * 39.3701;
    }
    if (linearUnit === "centimeters") {
        return value * 0.393701;
    }
    if (linearUnit === "inches") {
        return value;
    }
    return value * 12;
}

function buildRoomSegmentEditor(kind, items, room) {
    const list = Array.isArray(items) ? items : [];
    const polygonPointCount = getRoomPolygonRatios(room).length;
    const rows = list.map((item, index) => {
        const length = kind === "walls"
            ? `<span class="segment-length">
                Length: <strong>${escapeHtml(formatRoomWallLength(room, item))}</strong>
                <label>Thickness:
                    <input class="segment-thickness-editor" type="number" min="1" max="24" step="0.5"
                        value="${formatNumber(getWallThicknessInches(item))}" data-segment-kind="${kind}"
                        data-segment-index="${index}" data-segment-field="thickness_inches" aria-label="Wall thickness in inches" /> in
                </label>
            </span>`
            : "";
        return `
        <div class="segment-item">
            <div class="segment-row">
                <select data-segment-kind="${kind}" data-segment-index="${index}" data-segment-field="edge">
                    ${polygonPointCount >= 3
                        ? Array.from({ length: polygonPointCount }, (_, edgeIndex) => (
                            `<option value="polygon:${edgeIndex}" ${getPolygonSegmentEdgeIndex(item, index, polygonPointCount) === edgeIndex ? "selected" : ""}>Edge ${edgeIndex + 1}</option>`
                        )).join("")
                        : ["top", "right", "bottom", "left"].map((edge) => (
                            `<option value="${edge}" ${String(item.edge || "top") === edge ? "selected" : ""}>${escapeHtml(titleCase(edge))}</option>`
                        )).join("")}
                </select>
                <input type="number" min="0" max="100" step="1"
                    value="${Math.round(Number(item.start_ratio ?? 0) * 100)}"
                    data-segment-kind="${kind}" data-segment-index="${index}" data-segment-field="start_ratio" />
                <span class="segment-separator">to</span>
                <input type="number" min="0" max="100" step="1"
                    value="${Math.round(Number(item.end_ratio ?? 1) * 100)}"
                    data-segment-kind="${kind}" data-segment-index="${index}" data-segment-field="end_ratio" />
                <button type="button" class="segment-remove"
                    data-segment-action="remove" data-segment-kind="${kind}" data-segment-index="${index}">Remove</button>
            </div>
            ${length}
        </div>
    `;
    }).join("");
    const totalLength = kind === "walls" && list.length
        ? ` | Total: ${formatNumber(list.reduce((sum, wall) => sum + getRoomWallLength(room, wall), 0))} ${room.properties.linear_unit || "feet"}`
        : "";
    return `
        <div class="segment-editor">
            <div class="segment-editor-summary">${escapeHtml(formatPropertyValue(kind, list, {}))}${escapeHtml(totalLength)}</div>
            <div class="segment-editor-list">${rows || `<div class="segment-empty">No ${escapeHtml(kind)}</div>`}</div>
            <button type="button" class="segment-add" data-segment-action="add" data-segment-kind="${kind}">Add ${escapeHtml(titleCase(kind.slice(0, -1) || kind))}</button>
        </div>
    `;
}

function buildStairWidthEditor(value) {
    return `
        <div class="stair-width-editor">
            <input type="number" min="3" max="6" step="0.1" value="${Number(value).toFixed(1)}"
                data-property-editor="stair-width" aria-label="Stair width in feet" />
            <span class="stair-width-unit">ft</span>
        </div>
    `;
}

function buildRoomDimensionEditor(room, dimension, value, properties) {
    const house = state.assessment?.objects?.housePlan?.properties || {};
    const limits = getRoomResizeLimits(room);
    const isWidth = dimension === "width";
    const houseDimension = Math.max(Number(isWidth ? house.width : house.height) || 0, 1);
    const position = Number(room.properties[isWidth ? "floor_x_ratio" : "floor_y_ratio"] || 0);
    const minRatio = isWidth ? limits.minWidth : limits.minHeight;
    const maxRatio = isWidth ? limits.maxWidth(position) : limits.maxHeight(position);
    const unit = String(properties.linear_unit || room.properties.linear_unit || "feet");
    const numericValue = Number(value || 0);
    return `
        <div class="room-dimension-editor">
            <input type="number" min="${roundValue(minRatio * houseDimension, 2)}"
                max="${roundValue(maxRatio * houseDimension, 2)}" step="0.1"
                value="${numericValue.toFixed(2)}" data-property-editor="room-dimension"
                data-room-dimension="${dimension}" aria-label="Room ${dimension} in ${escapeHtml(unit)}" />
            <span class="room-dimension-unit">${escapeHtml(unit)}</span>
        </div>
    `;
}

function buildRoomTypeEditor(value) {
    const currentType = String(value || "room").trim().toLowerCase();
    const types = ROOM_TYPE_OPTIONS.includes(currentType)
        ? ROOM_TYPE_OPTIONS
        : [currentType, ...ROOM_TYPE_OPTIONS];
    const options = types.map((roomType) => `
        <option value="${escapeHtml(roomType)}"${roomType === currentType ? " selected" : ""}>
            ${escapeHtml(titleCase(roomType.replaceAll("_", " ")))}
        </option>
    `).join("");
    return `
        <select class="room-type-editor" data-property-editor="room-type" aria-label="Room type">
            ${options}
        </select>
    `;
}

function buildRoomNameEditor(value) {
    return `
        <input class="room-name-editor" type="text" maxlength="80" required
            value="${escapeHtml(String(value || "Room"))}" data-property-editor="room-name"
            aria-label="Room name" />
    `;
}

function buildRoomShapeEditor(value) {
    const shape = value === "polygon" ? "polygon" : "rectangle";
    return `
        <select class="room-type-editor" data-property-editor="room-shape" aria-label="Room shape">
            <option value="rectangle" ${shape === "rectangle" ? "selected" : ""}>Rectangle</option>
            <option value="polygon" ${shape === "polygon" ? "selected" : ""}>Polygon</option>
        </select>
    `;
}

function handlePropertyEditorChange(event) {
    const target = event.target;
    if (target.dataset.interiorRoomDimension) {
        window.clearTimeout(state.interiorFixtureEditTimer);
        state.interiorFixtureEditTimer = null;
        applyInteriorRoomDimensionField(target.dataset.interiorRoomDimension, target.value);
        return;
    }
    if (target.dataset.interiorSegmentField) {
        applyInteriorSegmentField(target.dataset.interiorSegmentField, target.value);
        return;
    }
    if (target.dataset.fixtureField) {
        window.clearTimeout(state.interiorFixtureEditTimer);
        state.interiorFixtureEditTimer = null;
        applyBathroomFixtureField(target.dataset.fixtureField, target.value);
        return;
    }
    if (target.dataset.interiorField || target.dataset.interiorColorIndex) {
        applyInteriorDesignEdit(target);
        return;
    }
    if (target.dataset.propertyEditor === "stair-width") {
        const room = state.selectedKind === "room" ? getSelectedObject() : null;
        if (!room) {
            return;
        }
        applyStairWidthValue(room, Number(target.value || 3));
        renderSelection();
        return;
    }
    if (target.dataset.propertyEditor === "room-dimension") {
        const room = state.selectedKind === "room" ? getSelectedObject() : null;
        if (!room) {
            return;
        }
        applyRoomDimensionValue(room, target.dataset.roomDimension, Number(target.value));
        renderSelection();
        return;
    }
    if (target.dataset.propertyEditor === "room-type") {
        const room = state.selectedKind === "room" ? getSelectedObject() : null;
        if (!room) {
            return;
        }
        applyRoomTypeValue(room, target.value);
        renderCatalog();
        renderSelection();
        return;
    }
    if (target.dataset.propertyEditor === "room-shape") {
        const room = state.selectedKind === "room" ? getSelectedObject() : null;
        if (!room) {
            return;
        }
        applyRoomShapeValue(room, target.value);
        renderSelection();
        return;
    }
    if (target.dataset.propertyEditor === "room-name") {
        const room = state.selectedKind === "room" ? getSelectedObject() : null;
        if (!room) {
            return;
        }
        applyRoomNameValue(room, target.value);
        renderCatalog();
        renderSelection();
        return;
    }
    if (!target.dataset.segmentKind || !target.dataset.segmentField) {
        return;
    }
    const room = state.selectedKind === "room" ? getSelectedObject() : null;
    if (!room) {
        return;
    }
    const kind = target.dataset.segmentKind;
    const index = Number(target.dataset.segmentIndex);
    const field = target.dataset.segmentField;
    const list = Array.isArray(room.properties[kind]) ? room.properties[kind].map((item) => ({ ...item })) : [];
    if (!list[index]) {
        return;
    }
    if (field === "edge") {
        const edgeValue = String(target.value || "top");
        if (edgeValue.startsWith("polygon:")) {
            list[index].edge_index = Number(edgeValue.split(":")[1]);
        } else {
            list[index].edge = edgeValue;
            delete list[index].edge_index;
        }
    } else if (field === "thickness_inches" && kind === "walls") {
        list[index].thickness_inches = roundValue(clamp(Number(target.value || 6), 1, 24), 2);
    } else {
        const rawValue = clamp(Number(target.value || 0), 0, 100) / 100;
        list[index][field] = roundValue(rawValue, 4);
        if (field === "start_ratio" && list[index].end_ratio < list[index].start_ratio) {
            list[index].end_ratio = list[index].start_ratio;
        }
        if (field === "end_ratio" && list[index].start_ratio > list[index].end_ratio) {
            list[index].start_ratio = list[index].end_ratio;
        }
    }
    room.properties[kind] = kind === "walls" ? normalizeRoomWalls(list) : normalizeRoomOpenings(list);
    renderSelection();
}

function applyInteriorRoomDimensionField(dimension, rawValue) {
    const design = state.selectedKind === "interior-design" ? getSelectedObject() : null;
    const sourceRoom = getInteriorSourceRoom(design);
    if (!design || !sourceRoom) {
        return;
    }
    applyRoomDimensionValue(sourceRoom, dimension, Number(rawValue));
    renderCatalog();
    renderSelection();
}

function addBathroomFixture(type) {
    const design = getSelectedObject();
    const sourceRoom = getInteriorSourceRoom(design);
    const allowedTypes = design ? getInteriorComponentTypes(design).map(([key]) => key) : [];
    if (!design || !sourceRoom || !allowedTypes.includes(type)) {
        return;
    }
    const fixtures = getBathroomFixtures(design).map((fixture) => ({ ...fixture }));
    const offset = 6 + (fixtures.length % 6) * 6;
    const fixture = fitFixtureToInteriorRoom(createBathroomFixture(type, offset, offset), design);
    fixtures.push(fixture);
    state.selectedInteriorFixtureId = fixture.id;
    state.selectedInteriorSegmentKind = null;
    state.selectedInteriorSegmentIndex = null;
    setBathroomFixtureLayout(sourceRoom, fixtures);
    refreshInteriorDesignWindow();
}

function addInteriorRoomSegment(kind) {
    if (!["walls", "doors", "windows"].includes(kind)) {
        return;
    }
    const design = getSelectedObject();
    const sourceRoom = getInteriorSourceRoom(design);
    if (!design || !sourceRoom) {
        return;
    }
    const list = Array.isArray(sourceRoom.properties[kind])
        ? sourceRoom.properties[kind].map((segment) => ({ ...segment }))
        : [];
    list.push(buildDefaultSegment(kind, sourceRoom));
    sourceRoom.properties[kind] = kind === "walls" ? normalizeRoomWalls(list) : normalizeRoomOpenings(list);
    state.selectedInteriorFixtureId = null;
    state.selectedInteriorSegmentKind = kind;
    state.selectedInteriorSegmentIndex = list.length - 1;
    refreshInteriorDesignWindow();
}

function removeSelectedInteriorRoomSegment() {
    const design = getSelectedObject();
    const sourceRoom = getInteriorSourceRoom(design);
    const kind = state.selectedInteriorSegmentKind;
    const index = Number(state.selectedInteriorSegmentIndex);
    if (!design || !sourceRoom || !["walls", "doors", "windows"].includes(kind) || !Number.isInteger(index)) {
        return;
    }
    const list = Array.isArray(sourceRoom.properties[kind])
        ? sourceRoom.properties[kind].map((segment) => ({ ...segment }))
        : [];
    if (!list[index]) {
        return;
    }
    list.splice(index, 1);
    sourceRoom.properties[kind] = kind === "walls" ? normalizeRoomWalls(list) : normalizeRoomOpenings(list);
    state.selectedInteriorSegmentIndex = list.length ? Math.min(index, list.length - 1) : null;
    if (!list.length) {
        state.selectedInteriorSegmentKind = null;
    }
    refreshInteriorDesignWindow();
}

function applyInteriorSegmentField(field, rawValue) {
    if (!["edge", "start_ratio", "end_ratio", "thickness_inches"].includes(field)) {
        return;
    }
    const design = getSelectedObject();
    const sourceRoom = getInteriorSourceRoom(design);
    const kind = state.selectedInteriorSegmentKind;
    const index = Number(state.selectedInteriorSegmentIndex);
    if (!design || !sourceRoom || !["walls", "doors", "windows"].includes(kind) || !Number.isInteger(index)) {
        return;
    }
    const list = Array.isArray(sourceRoom.properties[kind])
        ? sourceRoom.properties[kind].map((segment) => ({ ...segment }))
        : [];
    const segment = list[index];
    if (!segment) {
        return;
    }
    if (field === "edge") {
        if (String(rawValue).startsWith("polygon:")) {
            segment.edge_index = Number(String(rawValue).split(":")[1]);
        } else {
            segment.edge = ["top", "right", "bottom", "left"].includes(rawValue) ? rawValue : "top";
            delete segment.edge_index;
        }
    } else if (field === "thickness_inches" && kind === "walls") {
        segment.thickness_inches = roundValue(clamp(Number(rawValue || 6), 1, 24), 2);
    } else {
        segment[field] = roundValue(clamp(Number(rawValue || 0), 0, 100) / 100, 4);
        if (field === "start_ratio" && segment.end_ratio < segment.start_ratio) {
            segment.end_ratio = segment.start_ratio;
        }
        if (field === "end_ratio" && segment.start_ratio > segment.end_ratio) {
            segment.start_ratio = segment.end_ratio;
        }
    }
    sourceRoom.properties[kind] = kind === "walls" ? normalizeRoomWalls(list) : normalizeRoomOpenings(list);
    refreshInteriorDesignWindow();
}

function removeSelectedBathroomFixture() {
    const design = getSelectedObject();
    const sourceRoom = getInteriorSourceRoom(design);
    if (!design || !sourceRoom || !state.selectedInteriorFixtureId) {
        return;
    }
    const fixtures = getBathroomFixtures(design).filter((fixture) => fixture.id !== state.selectedInteriorFixtureId);
    setBathroomFixtureLayout(sourceRoom, fixtures);
    state.selectedInteriorFixtureId = fixtures[0]?.id || null;
    refreshInteriorDesignWindow();
}

function applyBathroomFixtureField(field, rawValue) {
    const editableFields = new Set(["width_inches", "depth_inches", "x_inches", "y_inches", "direction_degrees"]);
    if (!editableFields.has(field) || !state.selectedInteriorFixtureId) {
        return;
    }
    const design = getSelectedObject();
    const sourceRoom = getInteriorSourceRoom(design);
    if (!design || !sourceRoom) {
        return;
    }
    const roomDimensions = getInteriorRoomDimensionsInches(design);
    const roomWidthInches = roomDimensions.width;
    const roomDepthInches = roomDimensions.height;
    const fixtures = getBathroomFixtures(design).map((fixture) => ({ ...fixture }));
    const fixture = fixtures.find((item) => item.id === state.selectedInteriorFixtureId);
    if (!fixture) {
        return;
    }

    const value = Number(rawValue || 0);
    if (field === "width_inches") {
        fixture.width_inches = snapFixtureSizeInchesWithin(value, 12, Math.max(12, roomWidthInches));
        fixture.x_inches = snapInchesWithin(fixture.x_inches, 0, Math.max(0, roomWidthInches - fixture.width_inches));
    } else if (field === "depth_inches") {
        fixture.depth_inches = snapFixtureSizeInchesWithin(value, 12, Math.max(12, roomDepthInches));
        fixture.y_inches = snapInchesWithin(fixture.y_inches, 0, Math.max(0, roomDepthInches - fixture.depth_inches));
    } else if (field === "x_inches") {
        fixture.x_inches = snapInchesWithin(value, 0, Math.max(0, roomWidthInches - fixture.width_inches));
    } else if (field === "y_inches") {
        fixture.y_inches = snapInchesWithin(value, 0, Math.max(0, roomDepthInches - fixture.depth_inches));
    } else if (field === "direction_degrees") {
        const currentDirection = normalizeFixtureDirection(fixture.direction_degrees);
        const nextDirection = normalizeFixtureDirection(value);
        if ((currentDirection % 180) !== (nextDirection % 180)) {
            const nextWidth = fixture.depth_inches;
            const nextDepth = fixture.width_inches;
            fixture.width_inches = snapFixtureSizeInchesWithin(nextWidth, 12, Math.max(12, roomWidthInches));
            fixture.depth_inches = snapFixtureSizeInchesWithin(nextDepth, 12, Math.max(12, roomDepthInches));
        }
        fixture.direction_degrees = nextDirection;
        fixture.x_inches = snapInchesWithin(fixture.x_inches, 0, Math.max(0, roomWidthInches - fixture.width_inches));
        fixture.y_inches = snapInchesWithin(fixture.y_inches, 0, Math.max(0, roomDepthInches - fixture.depth_inches));
    }
    Object.assign(fixture, fitFixtureToInteriorRoom(fixture, design));
    setBathroomFixtureLayout(sourceRoom, fixtures);
    refreshInteriorDesignWindow();
}

function applyInteriorDesignEdit(target, options = {}) {
    if (state.selectedKind !== "interior-design") {
        return;
    }
    const design = getSelectedObject();
    const sourceRoom = getInteriorSourceRoom(design);
    if (!design || !sourceRoom) {
        return;
    }

    const current = normalizeInteriorDesignOverrides(sourceRoom.properties.interior_design);
    const next = {
        ...design.properties,
        ...current,
        palette_colors: (current.palette_colors || design.properties.palette_colors).map((color) => ({ ...color })),
    };

    if (target.dataset.interiorColorIndex) {
        const index = Number(target.dataset.interiorColorIndex);
        if (next.palette_colors[index]) {
            next.palette_colors[index].hex = normalizeHexColor(target.value);
        }
    } else if (target.dataset.interiorField) {
        const field = target.dataset.interiorField;
        next[field] = field === "estimated_budget"
            ? Math.max(0, Number(target.value || 0))
            : String(target.value || "");
    }

    sourceRoom.properties.interior_design = sanitizeInteriorDesignOverrides(next);
    if (options.refreshOnly) {
        refreshInteriorDesignWindow();
        renderProperties(getSelectedObject());
        return;
    }
    renderCatalog();
    renderSelection();
}

function refreshInteriorDesignWindow() {
    const design = getSelectedObject();
    if (!design) {
        return;
    }
    const stage = document.querySelector(".interior-room-stage");
    if (stage) {
        stage.innerHTML = buildInteriorRoomFloorSvg(design);
    }
    const fixtureInspector = document.querySelector(".interior-fixture-inspector");
    if (fixtureInspector && isEditableInteriorComponentRoom(design)) {
        fixtureInspector.outerHTML = buildBathroomFixtureInspector(design);
    }
    const structureInspector = document.querySelector(".interior-structure-inspector");
    if (structureInspector) {
        structureInspector.outerHTML = buildInteriorStructureInspector(design);
    }
    const floorValue = document.querySelector("[data-interior-spec='primary_finish']");
    if (floorValue) {
        floorValue.textContent = design.properties.primary_finish;
    }
    const materialValue = document.querySelector("[data-interior-spec='material_name']");
    if (materialValue) {
        materialValue.textContent = design.properties.material_name;
    }
    const furnitureValue = document.querySelector("[data-interior-spec='furniture_anchor']");
    if (furnitureValue) {
        furnitureValue.textContent = design.properties.furniture_anchor;
    }
    const lightingValue = document.querySelector("[data-interior-spec='lighting_fixture']");
    if (lightingValue) {
        lightingValue.textContent = design.properties.lighting_fixture;
    }
    const budgetValue = document.querySelector("[data-interior-spec='estimated_budget']");
    if (budgetValue) {
        budgetValue.textContent = formatCurrency(design.properties.estimated_budget, design.properties.cost_currency);
    }
}

function sanitizeInteriorDesignOverrides(value) {
    const editableFields = [
        "primary_finish",
        "material_name",
        "furniture_anchor",
        "lighting_fixture",
        "textile_selection",
        "window_treatment",
        "estimated_budget",
        "procurement_status",
        "palette_colors",
        "fixture_layout",
    ];
    return editableFields.reduce((memo, key) => {
        if (value[key] !== undefined) {
            if (key === "palette_colors") {
                memo[key] = value[key].map((color) => ({ name: String(color.name || "Color"), hex: normalizeHexColor(color.hex) }));
            } else if (key === "fixture_layout") {
                memo[key] = Array.isArray(value[key]) ? value[key].map((fixture) => ({ ...fixture })) : [];
            } else {
                memo[key] = value[key];
            }
        }
        return memo;
    }, {});
}

function getInteriorSourceRoom(design) {
    if (!design || !state.assessment?.objects?.rooms) {
        return null;
    }
    return state.assessment.objects.rooms.find((room) => room.id === design.properties.source_room_id) || null;
}

function handlePropertyEditorClick(event) {
    const actionTarget = event.target.closest("[data-segment-action]");
    if (!actionTarget) {
        return;
    }
    const room = state.selectedKind === "room" ? getSelectedObject() : null;
    if (!room) {
        return;
    }
    const action = actionTarget.dataset.segmentAction;
    const kind = actionTarget.dataset.segmentKind;
    const list = Array.isArray(room.properties[kind]) ? room.properties[kind].map((item) => ({ ...item })) : [];
    if (action === "add") {
        list.push(buildDefaultSegment(kind, room));
    } else if (action === "remove") {
        const index = Number(actionTarget.dataset.segmentIndex);
        list.splice(index, 1);
    }
    room.properties[kind] = kind === "walls" ? normalizeRoomWalls(list) : normalizeRoomOpenings(list);
    renderSelection();
}

function buildDefaultSegment(kind, room = null) {
    const polygonEdge = room && getRoomPolygonRatios(room).length >= 3 ? { edge_index: 0 } : {};
    if (kind === "walls") {
        return { edge: "top", ...polygonEdge, start_ratio: 0, end_ratio: 1, thickness_inches: DEFAULT_WALL_THICKNESS_INCHES };
    }
    if (kind === "doors") {
        return { edge: "bottom", ...polygonEdge, start_ratio: 0.38, end_ratio: 0.62 };
    }
    return { edge: "top", ...polygonEdge, start_ratio: 0.2, end_ratio: 0.8 };
}

function applyStairWidthValue(room, widthFeet) {
    const house = state.assessment?.objects?.housePlan?.properties || {};
    const linearUnit = String(room.properties.linear_unit || "feet");
    const direction = String(room.properties.stair_direction || "up");
    const clampedFeet = clamp(Number(widthFeet || 3), 3, 6);
    const widthValue = linearUnit === "meters" ? clampedFeet / 3.28084 : clampedFeet;
    const houseWidth = Math.max(Number(house.width || 0), 1);
    const houseHeight = Math.max(Number(house.height || 0), 1);

    if (direction === "left" || direction === "right") {
        room.properties.height = roundValue(widthValue, 2);
        const ratio = snapFloorRatioToInchGrid(widthValue / houseHeight, "y");
        if (getRoomPolygonRatios(room).length >= 3) {
            scaleRoomPolygonDimension(room, false, ratio);
        } else {
            room.properties.floor_height_ratio = ratio;
        }
    } else {
        room.properties.width = roundValue(widthValue, 2);
        const ratio = snapFloorRatioToInchGrid(widthValue / houseWidth, "x");
        if (getRoomPolygonRatios(room).length >= 3) {
            scaleRoomPolygonDimension(room, true, ratio);
        } else {
            room.properties.floor_width_ratio = ratio;
        }
    }

    syncRoomPhysicalProperties(room);
}

function applyRoomDimensionValue(room, dimension, rawValue) {
    if (dimension !== "width" && dimension !== "height") {
        return;
    }
    const house = state.assessment?.objects?.housePlan?.properties || {};
    const isWidth = dimension === "width";
    const ratioKey = isWidth ? "floor_width_ratio" : "floor_height_ratio";
    const positionKey = isWidth ? "floor_x_ratio" : "floor_y_ratio";
    const houseDimension = Math.max(Number(isWidth ? house.width : house.height) || 0, 1);
    const position = Number(room.properties[positionKey] || 0);
    const limits = getRoomResizeLimits(room);
    const minRatio = isWidth ? limits.minWidth : limits.minHeight;
    const maxRatio = isWidth ? limits.maxWidth(position) : limits.maxHeight(position);
    const requestedRatio = Number.isFinite(rawValue) ? rawValue / houseDimension : minRatio;

    const axis = isWidth ? "x" : "y";
    const nextRatio = clamp(snapFloorRatioToInchGrid(requestedRatio, axis), minRatio, maxRatio);
    if (getRoomPolygonRatios(room).length >= 3) {
        scaleRoomPolygonDimension(room, isWidth, nextRatio);
    } else {
        room.properties[ratioKey] = nextRatio;
    }
    syncRoomPhysicalProperties(room);
}

function scaleRoomPolygonDimension(room, isWidth, nextSpan) {
    const points = getRoomPolygonRatios(room);
    if (points.length < 3) {
        return;
    }
    const axis = isWidth ? 0 : 1;
    const values = points.map((point) => point[axis]);
    const minimum = Math.min(...values);
    const currentSpan = Math.max(Math.max(...values) - minimum, 0.0001);
    const scaled = points.map((point) => {
        const nextPoint = [...point];
        nextPoint[axis] = minimum + (((point[axis] - minimum) / currentSpan) * nextSpan);
        return nextPoint;
    });
    syncRoomPolygonBounds(room, snapFloorPolygonToInchGrid(scaled));
}

function applyRoomTypeValue(room, rawValue) {
    const roomType = String(rawValue || "room").trim().toLowerCase();
    if (!roomType) {
        return;
    }
    room.properties.room_type = roomType;
    room.properties.stair_direction ||= "up";
    room.subtitle = `${room.properties.level_name || "Floor Plan"} | ${roomType.replaceAll("_", " ")}`;
    syncRoomPhysicalProperties(room);
}

function applyRoomNameValue(room, rawValue) {
    const roomName = String(rawValue || "").trim();
    if (!roomName) {
        return;
    }
    room.label = roomName;
}

function applyRoomShapeValue(room, rawValue) {
    if (String(rawValue) === "polygon") {
        ensureRoomPolygon(room);
    } else {
        convertRoomToRectangle(room);
    }
    syncRoomPhysicalProperties(room);
}

function formatAreaValue(area, areaUnit) {
    if (areaUnit === "square feet") {
        return `${formatNumber(Number(area) / 43560)} acre`;
    }
    return `${formatNumber(area)} ${areaUnit}`;
}

function shouldDisplayProperty(item, key) {
    if (item.kind === "room") {
        return !new Set([
            "generated_floor_room",
            "floor_x_ratio",
            "floor_y_ratio",
            "floor_width_ratio",
            "floor_height_ratio",
            "floor_polygon_ratios",
        ]).has(key);
    }
    if (item.kind === "interior-design") {
        return !new Set([
            "source_room_id",
            "room_width",
            "room_height",
            "fixture_layout",
        ]).has(key);
    }
    return true;
}

function formatPropertyLabel(key) {
    const customLabels = {
        stair_clear_width_feet: "Stair Clear Width",
        stair_width_range: "Allowed Width Range",
        total_area_square_feet: "Shell Area",
        room_count: "Number of Rooms",
        stair_count: "Number of Stairs",
        wall_count: "Number of Walls",
        shell_width: "Shell Width",
        shell_height: "Shell Length",
        room_names: "Rooms",
        room_id: "Room ID",
        room_type: "Room Type",
        room_shape: "Room Shape",
        room_vertex_count: "Room Vertices",
        level_name: "Level",
        area_unit: "Area Unit",
        linear_unit: "Linear Unit",
        floor_x_ratio: "Floor X Ratio",
        floor_y_ratio: "Floor Y Ratio",
        floor_width_ratio: "Floor Width Ratio",
        floor_height_ratio: "Floor Height Ratio",
        stair_direction: "Stair Direction",
        room_design_id: "Room Design ID",
        target_room_id: "Target Room ID",
        room_label: "Room",
        scheme_name: "Design Scheme",
        palette_name: "Palette",
        palette_colors: "Palette Colors",
        primary_finish: "Primary Finish",
        surface_type: "Surface Type",
        material_name: "Material",
        color_name: "Primary Color",
        furniture_anchor: "Furniture",
        lighting_fixture: "Lighting",
        textile_selection: "Textile",
        window_treatment: "Window Treatment",
        estimated_budget: "Estimated Budget",
        cost_currency: "Currency",
        vendor_name: "Vendor",
        procurement_status: "Procurement Status",
    };
    return customLabels[key] || titleCase(String(key).replaceAll("_", " "));
}

function formatPropertyValue(key, value, properties) {
    if (key === "area") {
        return formatAreaValue(value, properties.area_unit);
    }
    if (key === "total_area_square_feet") {
        return `${formatNumber(value)} sq ft`;
    }
    if (key === "area_unit" && properties.area_unit === "square feet") {
        return "acre";
    }
    if ((key === "width" || key === "height" || key === "perimeter" || key === "shell_width" || key === "shell_height") && properties.linear_unit) {
        return `${formatNumber(value)} ${properties.linear_unit}`;
    }
    if (key === "patio_length_feet" || key === "patio_width_feet") {
        return `${formatNumber(value)} ft`;
    }
    if (key === "patio_area_square_feet") {
        return `${formatNumber(value)} sq ft`;
    }
    if (key === "stair_clear_width_feet") {
        return `${formatNumber(value)} ft`;
    }
    if (key === "estimated_budget") {
        return formatCurrency(value, properties.cost_currency);
    }
    if (key === "palette_colors" && Array.isArray(value)) {
        return value.map((color) => `${color.name} ${color.hex}`).join(", ");
    }
    if (key === "walls") {
        return formatRoomSegmentSummary(value, "walls");
    }
    if (key === "doors") {
        return formatRoomSegmentSummary(value, "doors");
    }
    if (key === "windows") {
        return formatRoomSegmentSummary(value, "windows");
    }
    if (key === "room_names" && Array.isArray(value)) {
        return value.join(", ");
    }
    return stringifyValue(value);
}

function formatCurrency(value, currency) {
    const amount = Number(value || 0);
    const currencyCode = currency || "USD";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 0,
    }).format(amount);
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
