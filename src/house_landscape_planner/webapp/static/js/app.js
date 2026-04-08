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
    persistenceMode: "session",
    currentNeo4jParcelId: null,
    currentNeo4jDatabase: null,
};

const DETAIL_ZOOM_MIN = 0.5;
const DETAIL_ZOOM_MAX = 3;
const DETAIL_ZOOM_STEP = 0.25;

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
    document.getElementById("add-house-plan").addEventListener("click", addHousePlan);
    document.getElementById("remove-house-plan").addEventListener("click", removeHousePlan);
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
            state.selectedKind = "house-plan";
            state.selectedId = "house-plan";
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

function setupZoomControls() {
    document.getElementById("zoom-in").addEventListener("click", () => adjustDetailZoom(DETAIL_ZOOM_STEP));
    document.getElementById("zoom-out").addEventListener("click", () => adjustDetailZoom(-DETAIL_ZOOM_STEP));
    document.getElementById("zoom-reset").addEventListener("click", () => setDetailZoom(1));

    ["detail-canvas", "garden-canvas", "patio-canvas"].forEach((canvasId) => {
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
    state.assessment = payload;
    state.persistenceMode = payload.persistence_mode || "session";
    state.selectedKind = "parcel";
    state.selectedId = "parcel";
    state.activeView = "parcel";
    state.reportMarkdown = payload.report_markdown;
    state.detailZoom = 1;
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
        kind: "house-plan",
        id: "house-plan",
        label: "House Plan",
        subtitle: `${housePoints.length} edges | ${formatNumber(area)} ${areaUnit}`,
        description: "Editable multi-edge house footprint placed inside the parcel.",
        properties: {
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
        description: "Editable vertex on the house-plan footprint.",
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
        edges,
        vertices,
        features,
        housePlan,
        houseVertices = [],
    } = state.assessment.objects;
    const patioFeatures = getPatioFeatures();
    document.getElementById("parcel-count").textContent = "1";
    document.getElementById("edge-count").textContent = String(edges.length);
    document.getElementById("vertex-count").textContent = String(vertices.length);
    document.getElementById("house-plan-count").textContent = housePlan ? "1" : "0";
    document.getElementById("house-vertex-count").textContent = String(houseVertices.length);
    document.getElementById("feature-count").textContent = String(features.length);
    document.getElementById("patio-count").textContent = String(patioFeatures.length);

    document.getElementById("parcel-list").innerHTML = renderCatalogItem(parcel);
    document.getElementById("edge-list").innerHTML = edges.map(renderCatalogItem).join("");
    document.getElementById("vertex-list").innerHTML = vertices.map(renderCatalogItem).join("");
    document.getElementById("house-plan-list").innerHTML = housePlan
        ? renderCatalogItem(housePlan)
        : '<div class="placeholder">Add a house plan to start editing the footprint.</div>';
    document.getElementById("house-vertex-list").innerHTML = houseVertices.length
        ? houseVertices.map(renderCatalogItem).join("")
        : '<div class="placeholder">House-plan vertices will appear here.</div>';
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
    document.getElementById("view-parcel").classList.toggle("active", isParcel);
    document.getElementById("view-garden").classList.toggle("active", isGarden);
    document.getElementById("view-patio").classList.toggle("active", isPatio);
    document.getElementById("parcel-view-panel").classList.toggle("active", isParcel);
    document.getElementById("garden-view-panel").classList.toggle("active", isGarden);
    document.getElementById("patio-view-panel").classList.toggle("active", isPatio);
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
    parcelCanvas.innerHTML = buildParcelSvg(state.assessment);
    gardenCanvas.innerHTML = buildGardenSvg(state.assessment);
    patioCanvas.innerHTML = buildPatioSvg(state.assessment);

    [parcelCanvas, gardenCanvas, patioCanvas].forEach((canvas) => {
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
    const housePlanSvg = buildHousePlanSvg(data, project);

    const edgeLines = data.objects.edges.map((edge, index) => {
        const start = vertexPoints[index];
        const end = vertexPoints[(index + 1) % vertexPoints.length];
        const selected = state.selectedKind === "edge" && state.selectedId === edge.id ? "selected" : "";
        const labelX = ((start.x + end.x) / 2).toFixed(1);
        const labelY = (((start.y + end.y) / 2) - 10).toFixed(1);
        return `
            <line class="edge-line ${selected}" data-kind="edge" data-id="${escapeHtml(edge.id)}"
                x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}"
                x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" />
            <text class="canvas-label" x="${labelX}" y="${labelY}" text-anchor="middle">${index + 1}</text>
        `;
    }).join("");

    const vertexDots = data.objects.vertices.map((vertex, index) => {
        const point = vertexPoints[index];
        const selected = state.selectedKind === "vertex" && state.selectedId === vertex.id ? "selected" : "";
        return `
            <circle class="vertex-dot ${selected}" data-kind="vertex" data-id="${escapeHtml(vertex.id)}"
                cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" />
            <text class="canvas-label" x="${(point.x + 10).toFixed(1)}" y="${(point.y - 10).toFixed(1)}">${index + 1}</text>
        `;
    }).join("");

    return buildSvgFrame(width, height, `
        <polygon class="parcel-fill ${selectedParcel}" data-kind="parcel" data-id="parcel" points="${polygonPoints}"></polygon>
        ${housePlanSvg}
        ${edgeLines}
        ${vertexDots}
    `);
}

function buildGardenSvg(data) {
    const points = data.parcel_boundary_points || [];
    if (!points.length) {
        return '<div class="placeholder">Garden design diagram will appear here.</div>';
    }

    const { width, height, vertexPoints, polygonPoints } = buildDiagramGeometry(points);
    const left = Math.min(...vertexPoints.map((point) => point.x));
    const right = Math.max(...vertexPoints.map((point) => point.x));
    const top = Math.min(...vertexPoints.map((point) => point.y));
    const bottom = Math.max(...vertexPoints.map((point) => point.y));
    const boxWidth = Math.max(right - left, 1);
    const boxHeight = Math.max(bottom - top, 1);
    const parcelRotation = getParcelRotation(vertexPoints);
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
    const selectedPlan = state.selectedKind === "house-plan" ? "selected" : "";
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
                cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4"></circle>
            <text class="canvas-label" x="${(point.x + 8).toFixed(1)}" y="${(point.y - 8).toFixed(1)}">${index + 1}</text>
        `;
    }).join("");
    const outline = selectedPlan ? `<polygon class="house-plan-outline" points="${polygonPoints}"></polygon>` : "";

    return `
        ${edgeMarkup}
        <polygon class="house-plan-fill ${selectedPlan}" data-kind="house-plan" data-id="house-plan" data-house-plan-action="move-plan" points="${polygonPoints}"></polygon>
        ${outline}
        ${vertexMarkup}
    `;
}

function buildPatioSvg(data) {
    const points = data.parcel_boundary_points || [];
    if (!points.length) {
        return '<div class="placeholder">Patio design diagram will appear here.</div>';
    }

    const { width, height, vertexPoints, polygonPoints } = buildDiagramGeometry(points);
    const left = Math.min(...vertexPoints.map((point) => point.x));
    const right = Math.max(...vertexPoints.map((point) => point.x));
    const top = Math.min(...vertexPoints.map((point) => point.y));
    const bottom = Math.max(...vertexPoints.map((point) => point.y));
    const boxWidth = Math.max(right - left, 1);
    const boxHeight = Math.max(bottom - top, 1);
    const parcelRotation = getParcelRotation(vertexPoints);
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
            ${featureShapes}
        </g>
    `);
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
        <text class="feature-label" x="${centerX.toFixed(1)}" y="${(centerY + 4).toFixed(1)}" text-anchor="middle">${escapeHtml(feature.label)}</text>
    `;
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
    return points.slice(0, -1).map((point) => [Number(point[0]), Number(point[1])]);
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
    state.selectedKind = "house-plan";
    state.selectedId = "house-plan";
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
    state.selectedKind = "house-plan";
    state.selectedId = "house-plan";
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
    } else if (item.kind === "house-plan") {
        tags.push(`<span class="detail-chip">${escapeHtml(String(item.properties.vertex_count))} vertices</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(formatAreaValue(item.properties.area, item.properties.area_unit))}</span>`);
    } else if (item.kind === "house-vertex") {
        tags.push(`<span class="detail-chip">Vertex ${escapeHtml(String(item.properties.vertex_index))}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.linear_unit)}</span>`);
    } else if (item.kind === "edge") {
        tags.push(`<span class="detail-chip">${escapeHtml(formatNumber(item.properties.length))} ${escapeHtml(item.properties.linear_unit)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.direction)}</span>`);
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
        return `
            <p>${escapeHtml(item.description)}</p>
            <ul class="selection-list">
                <li>Edges: ${escapeHtml(String(state.assessment.objects.edges.length))}</li>
                <li>Vertices: ${escapeHtml(String(state.assessment.objects.vertices.length))}</li>
                <li>Image input: ${escapeHtml(state.assessment.image ? state.assessment.image.source_name : "Not provided")}</li>
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

    if (item.kind === "house-plan") {
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
    const cards = [
        metricCard("Area", formatAreaValue(data.metrics.area, data.metrics.area_unit)),
        metricCard("Perimeter", `${formatNumber(data.metrics.perimeter)} ${data.metrics.linear_unit}`),
        metricCard("Irregularity", data.metrics.irregularity_index.toFixed(3)),
        metricCard("Vertices", String(data.metrics.vertex_count)),
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
    if (state.selectedKind === "house-plan") {
        return state.assessment.objects.housePlan;
    }
    if (state.selectedKind === "house-vertex") {
        return state.assessment.objects.houseVertices.find((item) => item.id === state.selectedId) || null;
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
    const addHousePlanButton = document.getElementById("add-house-plan");
    const removeHousePlanButton = document.getElementById("remove-house-plan");
    const addHouseVertexButton = document.getElementById("add-house-vertex");
    const removeHouseVertexButton = document.getElementById("remove-house-vertex");
    const saveButton = document.getElementById("save-features");
    const removeButton = document.getElementById("remove-feature");
    const hasAssessment = Boolean(state.assessment);
    const hasHousePlan = hasAssessment && Boolean(state.assessment.objects.housePlan);
    const isHouseVertexSelected = hasAssessment && state.selectedKind === "house-vertex" && Boolean(getSelectedObject());
    const isFeatureSelected = hasAssessment && state.selectedKind === "feature" && Boolean(getSelectedObject());

    const isNeo4jBacked = state.persistenceMode === "neo4j" && Boolean(state.currentNeo4jParcelId);
    addHousePlanButton.disabled = !hasAssessment || hasHousePlan;
    removeHousePlanButton.disabled = !hasHousePlan;
    addHouseVertexButton.disabled = !hasHousePlan;
    removeHouseVertexButton.disabled = !isHouseVertexSelected || state.assessment.house_plan_points.length <= 3;
    saveButton.disabled = !hasAssessment || !isNeo4jBacked;
    removeButton.disabled = !isFeatureSelected || !isNeo4jBacked;
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
    document.getElementById("edge-count").textContent = "0";
    document.getElementById("vertex-count").textContent = "0";
    document.getElementById("house-plan-count").textContent = "0";
    document.getElementById("house-vertex-count").textContent = "0";
    document.getElementById("feature-count").textContent = "0";
    document.getElementById("patio-count").textContent = "0";
    document.getElementById("parcel-list").innerHTML = '<div class="placeholder">Load a parcel to populate the catalog.</div>';
    document.getElementById("edge-list").innerHTML = '<div class="placeholder">Boundary edges will appear here.</div>';
    document.getElementById("vertex-list").innerHTML = '<div class="placeholder">Corner vertices will appear here.</div>';
    document.getElementById("house-plan-list").innerHTML = '<div class="placeholder">Editable house footprint will appear here.</div>';
    document.getElementById("house-vertex-list").innerHTML = '<div class="placeholder">House-plan vertices will appear here.</div>';
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
    document.getElementById("selection-summary").innerHTML = '<p class="placeholder-line">Selection-specific notes will appear here.</p>';
    document.getElementById("zones-summary").innerHTML = '<p class="placeholder-line">Concept zones and next data steps will appear here.</p>';
    document.getElementById("report-preview").innerHTML = '<p class="placeholder-line">The generated markdown report will render here.</p>';
    document.getElementById("properties-title").textContent = "Inspector";
    document.getElementById("properties-list").innerHTML = '<div class="placeholder-line">Select an object to inspect its values.</div>';
    document.getElementById("metrics-grid").innerHTML = '<div class="placeholder">Parcel metrics will appear here after analysis.</div>';
    renderActiveView();
    updateFeatureActions();
    updateZoomControls();
}

function adjustDetailZoom(delta) {
    setDetailZoom(state.detailZoom + delta);
}

function setDetailZoom(value) {
    const clampedZoom = Math.min(DETAIL_ZOOM_MAX, Math.max(DETAIL_ZOOM_MIN, value));
    const nextZoom = Math.round(clampedZoom / DETAIL_ZOOM_STEP) * DETAIL_ZOOM_STEP;

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
    const zoomPercent = Math.round(state.detailZoom * 100);

    zoomIn.disabled = state.detailZoom >= DETAIL_ZOOM_MAX;
    zoomOut.disabled = state.detailZoom <= DETAIL_ZOOM_MIN;
    zoomReset.textContent = `${zoomPercent}%`;
    zoomReset.disabled = !state.assessment && state.detailZoom === 1;
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
                }),
            },
        );
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.detail || "Unable to save design changes to Neo4j.");
        }
        applyAssessment(payload);
        updateStatus(
            `Saved ${payload.landscape_features.length} features and ${payload.house_plan_points.length} house-plan points to Neo4j.`,
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
