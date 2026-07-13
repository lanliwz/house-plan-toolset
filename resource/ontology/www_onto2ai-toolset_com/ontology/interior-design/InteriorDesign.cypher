// ===========================================================
// NEO4J SCHEMA CONSTRAINTS FOR INTERIOR DESIGN ONTOLOGY
// Companion constraints aligned with InteriorDesign.rdf
// ===========================================================

// Class: interior design plan
// Definition: A coordinated interior design plan for a house or project phase.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#InteriorDesignPlan
// Mandatory property: planId
CREATE CONSTRAINT InteriorDesignPlan_planId_Required IF NOT EXISTS FOR (n:`InteriorDesignPlan`) REQUIRE n.`planId` IS NOT NULL;

// Class: design scheme
// Definition: A named aesthetic and functional concept used to guide room selections, color direction, material palette, and furnishing decisions.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#DesignScheme
// Mandatory property: schemeName
CREATE CONSTRAINT DesignScheme_schemeName_Required IF NOT EXISTS FOR (n:`DesignScheme`) REQUIRE n.`schemeName` IS NOT NULL;

// Class: room design
// Definition: A room-specific interior design specification linked to an existing house room.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#RoomDesign
// Mandatory properties: roomDesignId, targetRoomId
CREATE CONSTRAINT RoomDesign_roomDesignId_Required IF NOT EXISTS FOR (n:`RoomDesign`) REQUIRE n.`roomDesignId` IS NOT NULL;
CREATE CONSTRAINT RoomDesign_targetRoomId_Required IF NOT EXISTS FOR (n:`RoomDesign`) REQUIRE n.`targetRoomId` IS NOT NULL;

// Class: finish specification
// Definition: A surface finish selection for floor, wall, ceiling, trim, cabinet, countertop, or similar interior application.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#FinishSpecification
// Mandatory properties: finishId, surfaceType
CREATE CONSTRAINT FinishSpecification_finishId_Required IF NOT EXISTS FOR (n:`FinishSpecification`) REQUIRE n.`finishId` IS NOT NULL;
CREATE CONSTRAINT FinishSpecification_surfaceType_Required IF NOT EXISTS FOR (n:`FinishSpecification`) REQUIRE n.`surfaceType` IS NOT NULL;

// Class: material
// Definition: A physical material or product family used in an interior finish, furnishing, or fixture.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#Material
// Mandatory property: materialName
CREATE CONSTRAINT Material_materialName_Required IF NOT EXISTS FOR (n:`Material`) REQUIRE n.`materialName` IS NOT NULL;

// Class: color specification
// Definition: A named color, palette entry, or product color value used by a design scheme or finish specification.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#ColorSpecification
// Mandatory property: colorName
CREATE CONSTRAINT ColorSpecification_colorName_Required IF NOT EXISTS FOR (n:`ColorSpecification`) REQUIRE n.`colorName` IS NOT NULL;

// Class: furniture item
// Definition: A movable interior furnishing selected for a room, such as a sofa, table, chair, bed, desk, or storage item.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#FurnitureItem
// Mandatory properties: itemId, itemName
CREATE CONSTRAINT FurnitureItem_itemId_Required IF NOT EXISTS FOR (n:`FurnitureItem`) REQUIRE n.`itemId` IS NOT NULL;
CREATE CONSTRAINT FurnitureItem_itemName_Required IF NOT EXISTS FOR (n:`FurnitureItem`) REQUIRE n.`itemName` IS NOT NULL;

// Class: lighting fixture
// Definition: A fixed or movable lighting element selected for ambient, task, accent, or decorative lighting needs.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#LightingFixture
// Mandatory properties: itemId, itemName
CREATE CONSTRAINT LightingFixture_itemId_Required IF NOT EXISTS FOR (n:`LightingFixture`) REQUIRE n.`itemId` IS NOT NULL;
CREATE CONSTRAINT LightingFixture_itemName_Required IF NOT EXISTS FOR (n:`LightingFixture`) REQUIRE n.`itemName` IS NOT NULL;

// Class: textile
// Definition: A fabric, rug, upholstery, bedding, or soft-goods selection used in an interior room design.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#Textile
// Mandatory properties: itemId, itemName
CREATE CONSTRAINT Textile_itemId_Required IF NOT EXISTS FOR (n:`Textile`) REQUIRE n.`itemId` IS NOT NULL;
CREATE CONSTRAINT Textile_itemName_Required IF NOT EXISTS FOR (n:`Textile`) REQUIRE n.`itemName` IS NOT NULL;

// Class: window treatment
// Definition: A shade, blind, curtain, drapery, or related treatment selected for privacy, daylight control, acoustics, or visual character.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#WindowTreatment
// Mandatory properties: itemId, itemName
CREATE CONSTRAINT WindowTreatment_itemId_Required IF NOT EXISTS FOR (n:`WindowTreatment`) REQUIRE n.`itemId` IS NOT NULL;
CREATE CONSTRAINT WindowTreatment_itemName_Required IF NOT EXISTS FOR (n:`WindowTreatment`) REQUIRE n.`itemName` IS NOT NULL;

// Class: budget allowance
// Definition: A planned budget amount for a room, category, product, fixture, or finish package.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#BudgetAllowance
// Mandatory properties: category, estimatedCost, costCurrency
CREATE CONSTRAINT BudgetAllowance_category_Required IF NOT EXISTS FOR (n:`BudgetAllowance`) REQUIRE n.`category` IS NOT NULL;
CREATE CONSTRAINT BudgetAllowance_estimatedCost_Required IF NOT EXISTS FOR (n:`BudgetAllowance`) REQUIRE n.`estimatedCost` IS NOT NULL;
CREATE CONSTRAINT BudgetAllowance_costCurrency_Required IF NOT EXISTS FOR (n:`BudgetAllowance`) REQUIRE n.`costCurrency` IS NOT NULL;

// Class: procurement item
// Definition: An item tracked for sourcing, purchasing, delivery, installation, or replacement in the interior design workflow.
// URI: http://www.onto2ai-toolset.com/ontology/interior-design/InteriorDesign#ProcurementItem
// Mandatory properties: itemId, itemName, procurementStatus
CREATE CONSTRAINT ProcurementItem_itemId_Required IF NOT EXISTS FOR (n:`ProcurementItem`) REQUIRE n.`itemId` IS NOT NULL;
CREATE CONSTRAINT ProcurementItem_itemName_Required IF NOT EXISTS FOR (n:`ProcurementItem`) REQUIRE n.`itemName` IS NOT NULL;
CREATE CONSTRAINT ProcurementItem_procurementStatus_Required IF NOT EXISTS FOR (n:`ProcurementItem`) REQUIRE n.`procurementStatus` IS NOT NULL;
