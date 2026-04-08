from __future__ import annotations

from house_landscape_planner.models import ConceptZone, LandscapeFeature, ParcelSummary


LANDSCAPE_NS = "http://www.onto2ai-toolset.com/ontology/landscape/Landscape#"


def build_landscape_features(
    parcel: ParcelSummary,
    concept_zones: list[ConceptZone],
) -> list[LandscapeFeature]:
    zone_map = {zone.name: zone for zone in concept_zones}
    metrics = parcel.metrics
    compact_shape = metrics.irregularity_index <= 1.35
    broad_site = metrics.area >= 30000

    frontage_zone = zone_map["Arrival And Frontage Zone"]
    circulation_zone = zone_map["Primary Circulation Spine"]
    drainage_zone = zone_map["Stormwater And Hillside Buffer"]
    terrace_zone = zone_map["Private Outdoor Living Terrace"]
    planting_zone = zone_map["Perimeter Planting And Privacy Belt"]

    features = [
        LandscapeFeature(
            feature_id="feature-arrival-garden",
            name="Arrival Garden Threshold",
            ontology_class=f"{LANDSCAPE_NS}EntryGarden",
            zone_name=frontage_zone.name,
            summary="Layered planting and paving apron that announces the main approach and softens the road-facing edge.",
            intent=frontage_zone.intent,
            placement=frontage_zone.siting,
            rationale="This feature converts the assumed street edge into a legible front-door sequence and gives the parcel a clear public face.",
            design_moves=list(frontage_zone.moves),
            priority="high",
            target_share_percent=frontage_zone.target_share_percent,
            anchor_x_ratio=0.50,
            anchor_y_ratio=0.14,
            width_ratio=0.66,
            height_ratio=0.14,
            visual_kind="bed",
            rotation_degrees=None,
        ),
        LandscapeFeature(
            feature_id="feature-circulation-spine",
            name="Hillside Circulation Spine",
            ontology_class=f"{LANDSCAPE_NS}CirculationPath",
            zone_name=circulation_zone.name,
            summary="Primary walk alignment that stitches the parcel together and breaks grade change into manageable runs.",
            intent=circulation_zone.intent,
            placement=circulation_zone.siting,
            rationale="The site recommendations depend on one reliable movement route that can organize terraces, planting pockets, and maintenance access.",
            design_moves=list(circulation_zone.moves),
            priority="high",
            target_share_percent=circulation_zone.target_share_percent,
            anchor_x_ratio=0.49,
            anchor_y_ratio=0.46,
            width_ratio=0.14,
            height_ratio=0.52,
            visual_kind="path",
            rotation_degrees=None,
        ),
        LandscapeFeature(
            feature_id="feature-terrace-room",
            name="Rectangular Gray Brick Patio",
            ontology_class=f"{LANDSCAPE_NS}OutdoorTerrace",
            zone_name=terrace_zone.name,
            summary="Rectangular gray-brick patio sized for dining and everyday outdoor living close to the house.",
            intent=terrace_zone.intent,
            placement=terrace_zone.siting,
            rationale="A single rectangular brick patio creates a clear gathering surface, reads cleanly against the parcel geometry, and concentrates durable hardscape where it is most useful.",
            design_moves=list(terrace_zone.moves),
            priority="high",
            target_share_percent=terrace_zone.target_share_percent,
            anchor_x_ratio=0.52,
            anchor_y_ratio=0.50,
            width_ratio=0.30,
            height_ratio=0.18,
            visual_kind="patio",
            rotation_degrees=None,
        ),
        LandscapeFeature(
            feature_id="feature-bioswale-buffer",
            name="Bioswale And Hillside Buffer",
            ontology_class=f"{LANDSCAPE_NS}Bioswale",
            zone_name=drainage_zone.name,
            summary="Linear drainage landscape that slows runoff and stabilizes the downhill edge.",
            intent=drainage_zone.intent,
            placement=drainage_zone.siting,
            rationale="The parcel brief is hillside-oriented, so drainage and erosion control need a named, inspectable feature rather than a generic note.",
            design_moves=list(drainage_zone.moves),
            priority="high",
            target_share_percent=drainage_zone.target_share_percent,
            anchor_x_ratio=0.50,
            anchor_y_ratio=0.82,
            width_ratio=0.64,
            height_ratio=0.16,
            visual_kind="swale",
            rotation_degrees=None,
        ),
        LandscapeFeature(
            feature_id="feature-privacy-belt",
            name="Perimeter Privacy Belt",
            ontology_class=f"{LANDSCAPE_NS}ScreeningPlanting",
            zone_name=planting_zone.name,
            summary="Screening and habitat planting wrapped around the irregular edges to absorb leftover geometry.",
            intent=planting_zone.intent,
            placement=planting_zone.siting,
            rationale="This feature turns narrow edges and corners into intentional screening structure while keeping maintenance intensity lower at the parcel perimeter.",
            design_moves=list(planting_zone.moves),
            priority="medium" if compact_shape else "high",
            target_share_percent=planting_zone.target_share_percent,
            anchor_x_ratio=0.52,
            anchor_y_ratio=0.89,
            width_ratio=0.76,
            height_ratio=0.08,
            visual_kind="screen",
            rotation_degrees=None,
        ),
    ]

    if not compact_shape or broad_site:
        features.append(
            LandscapeFeature(
                feature_id="feature-grade-terraces",
                name="Grade Transition Terraces",
                ontology_class=f"{LANDSCAPE_NS}RetainingWall",
                zone_name=circulation_zone.name,
                summary="Short retaining edges and level transitions that help the main path and outdoor room sit more comfortably on slope.",
                intent="Support hillside circulation and usable flat moments with restrained grade intervention.",
                placement="Locate these transitions where the main walk or terrace needs short level changes rather than one long continuous slope.",
                rationale="Larger or more irregular parcels are more likely to benefit from small, repeated grade transitions than a single aggressive retaining move.",
                design_moves=[
                    "Use short seat-wall-height retaining edges before considering taller engineered walls.",
                    "Align terrace transitions with the circulation spine so landings feel deliberate rather than leftover.",
                    "Pair level changes with planting pockets to soften grade structures and catch runoff.",
                ],
                priority="medium",
                target_share_percent=None,
                anchor_x_ratio=0.36,
                anchor_y_ratio=0.58,
                width_ratio=0.20,
                height_ratio=0.16,
                visual_kind="wall",
                rotation_degrees=None,
            )
        )

    return features
