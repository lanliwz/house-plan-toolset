// ===========================================================
// NEO4J SCHEMA CONSTRAINTS FOR HOUSE ONTOLOGY
// Companion constraints aligned with House.rdf
// ===========================================================

// Class: house
// Definition: A residential building located on a parcel and planned as part of the property lifecycle.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#House
// Mandatory properties: houseId, source
CREATE CONSTRAINT House_houseId_Required IF NOT EXISTS FOR (n:`House`) REQUIRE n.`houseId` IS NOT NULL;
CREATE CONSTRAINT House_source_Required IF NOT EXISTS FOR (n:`House`) REQUIRE n.`source` IS NOT NULL;

// Class: building footprint
// Definition: A polygonal representation of the house outline used for siting, access, and outdoor design coordination.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#BuildingFootprint
// Mandatory properties: footprintId, coordinateSequenceJson, coordinateSequenceText
CREATE CONSTRAINT BuildingFootprint_footprintId_Required IF NOT EXISTS FOR (n:`BuildingFootprint`) REQUIRE n.`footprintId` IS NOT NULL;
CREATE CONSTRAINT BuildingFootprint_coordinateSequenceJson_Required IF NOT EXISTS FOR (n:`BuildingFootprint`) REQUIRE n.`coordinateSequenceJson` IS NOT NULL;
CREATE CONSTRAINT BuildingFootprint_coordinateSequenceText_Required IF NOT EXISTS FOR (n:`BuildingFootprint`) REQUIRE n.`coordinateSequenceText` IS NOT NULL;

// Class: floor plan
// Definition: A level-specific interior planning view derived from the house footprint and used to position rooms, stairs, and interior openings.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#FloorPlan
// Mandatory properties: planId, floorPlanLevelName
CREATE CONSTRAINT FloorPlan_planId_Required IF NOT EXISTS FOR (n:`FloorPlan`) REQUIRE n.`planId` IS NOT NULL;
CREATE CONSTRAINT FloorPlan_floorPlanLevelName_Required IF NOT EXISTS FOR (n:`FloorPlan`) REQUIRE n.`floorPlanLevelName` IS NOT NULL;

// Class: room
// Definition: An interior space within a house used for a functional domestic purpose.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#Room
// Mandatory properties: roomId, roomType, levelName, area, areaUnit, width, height, linearUnit, wallLayoutJson, doorLayoutJson, windowLayoutJson
// Optional persisted editor property: interiorDesignLayoutJson (House.rdf#interiorDesignLayoutJson)
CREATE CONSTRAINT Room_roomId_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`roomId` IS NOT NULL;
CREATE CONSTRAINT Room_roomType_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`roomType` IS NOT NULL;
CREATE CONSTRAINT Room_levelName_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`levelName` IS NOT NULL;
CREATE CONSTRAINT Room_area_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`area` IS NOT NULL;
CREATE CONSTRAINT Room_areaUnit_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`areaUnit` IS NOT NULL;
CREATE CONSTRAINT Room_width_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`width` IS NOT NULL;
CREATE CONSTRAINT Room_height_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`height` IS NOT NULL;
CREATE CONSTRAINT Room_linearUnit_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`linearUnit` IS NOT NULL;
CREATE CONSTRAINT Room_wallLayoutJson_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`wallLayoutJson` IS NOT NULL;
CREATE CONSTRAINT Room_doorLayoutJson_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`doorLayoutJson` IS NOT NULL;
CREATE CONSTRAINT Room_windowLayoutJson_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`windowLayoutJson` IS NOT NULL;

// Class: garage
// Definition: A room or enclosed vehicular storage area associated with the house footprint and first-floor circulation.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#Garage

// Class: stair
// Definition: A vertical circulation room element connecting basement, first-floor, and second-floor plan levels.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#Stair
// Mandatory property when label is present: stairDirection
CREATE CONSTRAINT Stair_stairDirection_Required IF NOT EXISTS FOR (n:`Stair`) REQUIRE n.`stairDirection` IS NOT NULL;

// Class: wall
// Definition: A boundary element defining one side of a room or separating adjacent interior or exterior spaces.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#Wall

// Class: opening
// Definition: An editable wall-hosted boundary segment representing an interior or exterior opening in the floor-plan editor.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#Opening

// Class: door
// Definition: An opening element in a wall used for passage between rooms or between interior and exterior space, rendered in the editor as a virtual wall segment.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#Door

// Class: window
// Definition: An opening element in a wall used for daylight, view, or ventilation, rendered in the editor as a virtual wall segment.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#Window

// Class: utility connection
// Definition: A service connection or equipment interface supporting water, power, drainage, gas, communications, or related house systems.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#UtilityConnection
// Mandatory property: utilityConnectionId
CREATE CONSTRAINT UtilityConnection_utilityConnectionId_Required IF NOT EXISTS FOR (n:`UtilityConnection`) REQUIRE n.`utilityConnectionId` IS NOT NULL;

// Class: maintenance task
// Definition: A recurring or planned action needed to maintain a house, site feature, or utility asset in working order.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#MaintenanceTask
// Mandatory property: taskId
CREATE CONSTRAINT MaintenanceTask_taskId_Required IF NOT EXISTS FOR (n:`MaintenanceTask`) REQUIRE n.`taskId` IS NOT NULL;

// Class: project phase
// Definition: A stage in the design, build, or maintenance lifecycle of a house property.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#ProjectPhase
// Mandatory property: phaseName
CREATE CONSTRAINT ProjectPhase_phaseName_Required IF NOT EXISTS FOR (n:`ProjectPhase`) REQUIRE n.`phaseName` IS NOT NULL;
