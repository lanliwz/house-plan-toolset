const state = {
    assessment: null,
    neo4jParcels: [],
    selectedKind: "parcel",
    selectedId: "parcel",
    reportMarkdown: "",
};

document.addEventListener("DOMContentLoaded", () => {
    setupTheme();
    setupTabs();
    setupSectionToggles();
    setupSplitters();
    setupForm();
    setupActions();
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
        state.reportMarkdown = "";
        document.getElementById("download-report").disabled = true;
        updateStatus("Ready for parcel analysis", false);
        updateFileSummary();
        resetResults();
    });
}

function setupActions() {
    document.getElementById("download-report").addEventListener("click", downloadReport);
    document.getElementById("load-neo4j").addEventListener("click", loadSelectedNeo4jParcel);
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
        applyAssessment(payload);
        updateStatus(`Loaded ${parcelId} from ${database}.`, false);
    } catch (error) {
        updateStatus(error.message, true);
    }
}

function applyAssessment(payload) {
    state.assessment = payload;
    state.selectedKind = "parcel";
    state.selectedId = "parcel";
    state.reportMarkdown = payload.report_markdown;
    document.getElementById("download-report").disabled = false;

    renderCatalog();
    renderMetricSnapshot();
    renderList("assumptions-list", payload.assumptions);
    renderList("recommendations-list", payload.recommendations);
    renderZonesSummary();
    renderMarkdown(payload.report_markdown);
    renderSelection();
}

function renderCatalog() {
    const { parcel, edges, vertices } = state.assessment.objects;
    document.getElementById("parcel-count").textContent = "1";
    document.getElementById("edge-count").textContent = String(edges.length);
    document.getElementById("vertex-count").textContent = String(vertices.length);

    document.getElementById("parcel-list").innerHTML = renderCatalogItem(parcel);
    document.getElementById("edge-list").innerHTML = edges.map(renderCatalogItem).join("");
    document.getElementById("vertex-list").innerHTML = vertices.map(renderCatalogItem).join("");

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
    renderSelection();
}

function renderSelection() {
    const item = getSelectedObject();
    if (!item) {
        return;
    }

    syncCatalogSelection();
    renderInteractiveDiagram();
    renderDetailSummary(item);
    renderProperties(item);
}

function syncCatalogSelection() {
    document.querySelectorAll(".catalog-item").forEach((item) => {
        const matches = item.dataset.kind === state.selectedKind && item.dataset.id === state.selectedId;
        item.classList.toggle("selected", matches);
    });
}

function renderInteractiveDiagram() {
    const canvas = document.getElementById("detail-canvas");
    const svg = buildInteractiveSvg(state.assessment);
    canvas.innerHTML = svg;

    canvas.querySelectorAll("[data-kind][data-id]").forEach((element) => {
        element.addEventListener("click", () => {
            setSelection(element.dataset.kind, element.dataset.id);
        });
    });
}

function buildInteractiveSvg(data) {
    const points = data.parcel_boundary_points || [];
    if (!points.length) {
        return '<div class="placeholder">Interactive parcel diagram will appear here.</div>';
    }

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
    const selectedParcel = state.selectedKind === "parcel" ? "selected" : "";

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
                cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="6" />
            <text class="canvas-label" x="${(point.x + 10).toFixed(1)}" y="${(point.y - 10).toFixed(1)}">${index + 1}</text>
        `;
    }).join("");

    return `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Parcel geometry detail view">
            <rect class="diagram-surface" width="${width}" height="${height}" rx="18"></rect>
            <polygon class="parcel-fill ${selectedParcel}" data-kind="parcel" data-id="parcel" points="${polygonPoints}"></polygon>
            ${edgeLines}
            ${vertexDots}
        </svg>
    `;
}

function renderDetailSummary(item) {
    document.getElementById("detail-title").textContent = item.label;
    document.getElementById("detail-subtitle").textContent = item.subtitle;
    document.getElementById("detail-tags").innerHTML = buildDetailTags(item);
    document.getElementById("selection-summary").innerHTML = buildSelectionSummary(item);
}

function buildDetailTags(item) {
    const tags = [`<span class="detail-chip">${escapeHtml(item.kind)}</span>`];
    if (item.kind === "parcel") {
        tags.push(`<span class="detail-chip">${escapeHtml(state.assessment.geometry_type)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(formatAreaValue(state.assessment.metrics.area, state.assessment.metrics.area_unit))}</span>`);
    } else if (item.kind === "edge") {
        tags.push(`<span class="detail-chip">${escapeHtml(formatNumber(item.properties.length))} ${escapeHtml(item.properties.linear_unit)}</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.direction)}</span>`);
    } else if (item.kind === "vertex") {
        tags.push(`<span class="detail-chip">Angle ${escapeHtml(String(item.properties.interior_angle_degrees))}°</span>`);
        tags.push(`<span class="detail-chip">${escapeHtml(item.properties.linear_unit)}</span>`);
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
    const entries = Object.entries(item.properties || {});
    const properties = document.getElementById("properties-list");
    properties.innerHTML = entries.map(([key, value]) => (
        `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(formatPropertyValue(key, value, item.properties || {}))}</dd>`
    )).join("");
}

function renderMetricSnapshot() {
    const data = state.assessment;
    const imageLabel = data.image ? `${data.image.width_px} x ${data.image.height_px}` : "No image";
    const cards = [
        metricCard("Area", formatAreaValue(data.metrics.area, data.metrics.area_unit)),
        metricCard("Perimeter", `${formatNumber(data.metrics.perimeter)} ${data.metrics.linear_unit}`),
        metricCard("Irregularity", data.metrics.irregularity_index.toFixed(3)),
        metricCard("Vertices", String(data.metrics.vertex_count)),
        metricCard("Bounds", `${formatNumber(data.metrics.width)} x ${formatNumber(data.metrics.height)}`),
        metricCard("Image", imageLabel),
    ];
    document.getElementById("metrics-grid").innerHTML = cards.join("");
}

function renderZonesSummary() {
    const zoneMarkup = state.assessment.concept_zones.map((zone) => `
        <li><strong>${escapeHtml(zone.name)}:</strong> ${escapeHtml(zone.target_share_percent)}% target share</li>
    `).join("");
    const nextData = state.assessment.next_data_to_collect.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    document.getElementById("zones-summary").innerHTML = `
        <p>${escapeHtml(state.assessment.concept_zones.length)} concept zones generated for the current parcel.</p>
        <ul class="selection-list">${zoneMarkup}</ul>
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
    if (state.selectedKind === "edge") {
        return state.assessment.objects.edges.find((item) => item.id === state.selectedId) || null;
    }
    if (state.selectedKind === "vertex") {
        return state.assessment.objects.vertices.find((item) => item.id === state.selectedId) || null;
    }
    return null;
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
    document.getElementById("parcel-list").innerHTML = '<div class="placeholder">Load a parcel to populate the catalog.</div>';
    document.getElementById("edge-list").innerHTML = '<div class="placeholder">Boundary edges will appear here.</div>';
    document.getElementById("vertex-list").innerHTML = '<div class="placeholder">Corner vertices will appear here.</div>';
    document.getElementById("assumptions-list").innerHTML = '<li class="placeholder-line">No assumptions loaded yet.</li>';
    document.getElementById("recommendations-list").innerHTML = '<li class="placeholder-line">No recommendations loaded yet.</li>';
    document.getElementById("detail-title").textContent = "Parcel detail view";
    document.getElementById("detail-subtitle").textContent = "Select a parcel object from the left panel or the diagram.";
    document.getElementById("detail-tags").innerHTML = '<span class="detail-chip">No object selected</span>';
    document.getElementById("detail-canvas").innerHTML = '<div class="placeholder">Interactive parcel diagram will appear here.</div>';
    document.getElementById("selection-summary").innerHTML = '<p class="placeholder-line">Selection-specific notes will appear here.</p>';
    document.getElementById("zones-summary").innerHTML = '<p class="placeholder-line">Concept zones and next data steps will appear here.</p>';
    document.getElementById("report-preview").innerHTML = '<p class="placeholder-line">The generated markdown report will render here.</p>';
    document.getElementById("properties-title").textContent = "Inspector";
    document.getElementById("properties-list").innerHTML = '<div class="placeholder-line">Select an object to inspect its values.</div>';
    document.getElementById("metrics-grid").innerHTML = '<div class="placeholder">Parcel metrics will appear here after analysis.</div>';
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
    return stringifyValue(value);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
