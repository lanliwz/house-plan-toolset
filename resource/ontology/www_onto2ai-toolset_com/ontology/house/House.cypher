// ===========================================================
// NEO4J SCHEMA CONSTRAINTS FOR HOUSE ONTOLOGY
// Companion constraints aligned with House.rdf
// ===========================================================

// Class: house
// Definition: A residential building located on a parcel and planned as part of the property lifecycle.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#House
// Mandatory property: houseId
CREATE CONSTRAINT House_houseId_Required IF NOT EXISTS FOR (n:`House`) REQUIRE n.`houseId` IS NOT NULL;

// Class: building footprint
// Definition: A polygonal representation of the house outline used for siting, access, and outdoor design coordination.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#BuildingFootprint
// Mandatory property: footprintId
CREATE CONSTRAINT BuildingFootprint_footprintId_Required IF NOT EXISTS FOR (n:`BuildingFootprint`) REQUIRE n.`footprintId` IS NOT NULL;

// Class: room
// Definition: An interior space within a house used for a functional domestic purpose.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#Room
// Mandatory property: roomId
CREATE CONSTRAINT Room_roomId_Required IF NOT EXISTS FOR (n:`Room`) REQUIRE n.`roomId` IS NOT NULL;

// Class: wall
// Definition: A boundary element defining one side of a room or separating adjacent interior or exterior spaces.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#Wall

// Class: door
// Definition: An opening element in a wall used for passage between rooms or between interior and exterior space.
// URI: http://www.onto2ai-toolset.com/ontology/house/House#Door

// Class: window
// Definition: An opening element in a wall used for daylight, view, or ventilation.
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
