// ===========================================================
// NEO4J SCHEMA CONSTRAINTS FOR LANDSCAPE ONTOLOGY
// Companion constraints aligned with Landscape.rdf
// ===========================================================

// Class: landscape plan
// Definition: A conceptual plan that organizes parcel-based outdoor spaces, circulation, planting, and infrastructure features.
// URI: http://www.onto2ai-toolset.com/ontology/landscape/Landscape#LandscapePlan
// Mandatory property: planId
CREATE CONSTRAINT LandscapePlan_planId_Required IF NOT EXISTS FOR (n:`LandscapePlan`) REQUIRE n.`planId` IS NOT NULL;

// Class: concept zone
// Definition: A planning zone representing a broad outdoor program area such as frontage, circulation, drainage, or privacy planting.
// URI: http://www.onto2ai-toolset.com/ontology/landscape/Landscape#ConceptZone
// Mandatory property: zoneId
CREATE CONSTRAINT ConceptZone_zoneId_Required IF NOT EXISTS FOR (n:`ConceptZone`) REQUIRE n.`zoneId` IS NOT NULL;

// Class: landscape feature
// Definition: A specific outdoor landscape element proposed as part of a conceptual residential site plan.
// URI: http://www.onto2ai-toolset.com/ontology/landscape/Landscape#LandscapeFeature
// Mandatory property: featureId
CREATE CONSTRAINT LandscapeFeature_featureId_Required IF NOT EXISTS FOR (n:`LandscapeFeature`) REQUIRE n.`featureId` IS NOT NULL;

// Class: entry garden
// Definition: A planted arrival feature that frames approach, softens hardscape, and strengthens front-door orientation.
// URI: http://www.onto2ai-toolset.com/ontology/landscape/Landscape#EntryGarden
// Mandatory property: featureId
CREATE CONSTRAINT EntryGarden_featureId_Required IF NOT EXISTS FOR (n:`EntryGarden`) REQUIRE n.`featureId` IS NOT NULL;

// Class: circulation path
// Definition: A walk or path alignment that organizes movement across the site and mediates grade transitions.
// URI: http://www.onto2ai-toolset.com/ontology/landscape/Landscape#CirculationPath
// Mandatory property: featureId
CREATE CONSTRAINT CirculationPath_featureId_Required IF NOT EXISTS FOR (n:`CirculationPath`) REQUIRE n.`featureId` IS NOT NULL;

// Class: outdoor terrace
// Definition: A primary usable outdoor room for seating, dining, and everyday residential gathering.
// URI: http://www.onto2ai-toolset.com/ontology/landscape/Landscape#OutdoorTerrace
// Mandatory property: featureId
CREATE CONSTRAINT OutdoorTerrace_featureId_Required IF NOT EXISTS FOR (n:`OutdoorTerrace`) REQUIRE n.`featureId` IS NOT NULL;

// Class: bioswale
// Definition: A planted drainage swale that slows runoff, improves infiltration, and stabilizes a hillside edge.
// URI: http://www.onto2ai-toolset.com/ontology/landscape/Landscape#Bioswale
// Mandatory property: featureId
CREATE CONSTRAINT Bioswale_featureId_Required IF NOT EXISTS FOR (n:`Bioswale`) REQUIRE n.`featureId` IS NOT NULL;

// Class: screening planting
// Definition: A layered perimeter planting feature used for privacy, habitat, and buffering from neighboring exposure.
// URI: http://www.onto2ai-toolset.com/ontology/landscape/Landscape#ScreeningPlanting
// Mandatory property: featureId
CREATE CONSTRAINT ScreeningPlanting_featureId_Required IF NOT EXISTS FOR (n:`ScreeningPlanting`) REQUIRE n.`featureId` IS NOT NULL;

// Class: retaining wall
// Definition: A grade-control feature used to support level changes, terrace edges, or compact retaining conditions on slope.
// URI: http://www.onto2ai-toolset.com/ontology/landscape/Landscape#RetainingWall
// Mandatory property: featureId
CREATE CONSTRAINT RetainingWall_featureId_Required IF NOT EXISTS FOR (n:`RetainingWall`) REQUIRE n.`featureId` IS NOT NULL;
